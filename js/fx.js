/* FX: frankfurter.app fetch + pure equivalents math + pending backfill.
 *
 * Correctness guarantee: equivalents are computed ONCE from the receipt-date
 * rate and then frozen — no code path updates the fx block of a 'done'
 * observation. Offline saves are marked pending and backfilled later with
 * the SAME receipt-date rate, so backfill is deterministic: late values are
 * identical to what an online save would have produced. */

import { roundMinor } from './money.js';
import * as db from './db.js';

const API = 'https://api.frankfurter.app';

/* ---------- pure ---------- */

const round6 = (x) => Math.round(x * 1e6) / 1e6;

/* From a frankfurter EUR-base response → the cross-rate set we persist.
 * apiDate is the date frankfurter actually used (previous ECB working day
 * for weekends/holidays) — recorded as fx_rate_date to keep values honest. */
export function deriveRates(apiResponse) {
  const eurGbp = apiResponse.rates.GBP;
  const eurAud = apiResponse.rates.AUD;
  if (!eurGbp || !eurAud) return null;
  return {
    rate_date: apiResponse.date,
    EUR_GBP: round6(eurGbp),
    EUR_AUD: round6(eurAud),
    AUD_GBP: round6(eurGbp / eurAud),
    AUD_EUR: round6(1 / eurAud),
  };
}

/* totalMinor in `currency` → frozen integer-minor equivalents in all three.
 * The identity currency is copied exactly (no FX noise on the original). */
export function computeEquivalents(totalMinor, currency, rates) {
  const { EUR_GBP, EUR_AUD } = rates;
  let eur, gbp, aud;
  switch (currency) {
    case 'EUR':
      eur = totalMinor;
      gbp = roundMinor(totalMinor * EUR_GBP);
      aud = roundMinor(totalMinor * EUR_AUD);
      break;
    case 'GBP':
      gbp = totalMinor;
      eur = roundMinor(totalMinor / EUR_GBP);
      aud = roundMinor(totalMinor * (EUR_AUD / EUR_GBP));
      break;
    case 'AUD':
      aud = totalMinor;
      eur = roundMinor(totalMinor / EUR_AUD);
      gbp = roundMinor(totalMinor * (EUR_GBP / EUR_AUD));
      break;
    default:
      return null;
  }
  return { equivalent_eur: eur, equivalent_gbp: gbp, equivalent_aud: aud };
}

/* Build the fx block for an observation; rates=null → pending. */
export function buildFxBlock(totalMinor, currency, rates) {
  if (!rates) return { status: 'pending' };
  const eq = computeEquivalents(totalMinor, currency, rates);
  if (!eq) return { status: 'pending' };
  return {
    status: 'done',
    rate_date: rates.rate_date,
    rates: {
      EUR_GBP: rates.EUR_GBP,
      EUR_AUD: rates.EUR_AUD,
      AUD_GBP: rates.AUD_GBP,
      AUD_EUR: rates.AUD_EUR,
    },
    ...eq,
  };
}

/* ---------- browser shell (IDB cache + fetch + backfill) ---------- */

/* Rates for a receipt date; cached in IDB keyed by the REQUESTED date so two
 * receipts from the same day cost one network call. Returns null if offline
 * or the API fails — caller saves the observation as fx-pending. */
export async function getRatesForDate(dateISO) {
  try {
    const cached = await db.get('fxRates', dateISO);
    if (cached) return cached.rates;
  } catch { /* fall through to network */ }

  try {
    const res = await fetch(`${API}/${dateISO}?from=EUR&to=GBP,AUD`);
    if (!res.ok) return null;
    const rates = deriveRates(await res.json());
    if (!rates) return null;
    await db.put('fxRates', { date: dateISO, rates });
    return rates;
  } catch {
    return null;
  }
}

/* Backfill runner: resolve fx for observations saved offline. Triggered at
 * app start and on the window 'online' event. Only ever touches
 * observations whose fx.status is 'pending'. */
export async function backfillPendingFx() {
  let pending;
  try {
    pending = await db.getAll('observations', 'by-fx-pending', IDBKeyRange.only(1));
  } catch {
    return 0;
  }
  if (!pending.length) return 0;

  const byDate = new Map();
  for (const obs of pending) {
    if (!byDate.has(obs.date)) byDate.set(obs.date, []);
    byDate.get(obs.date).push(obs);
  }

  let fixed = 0;
  for (const [date, group] of byDate) {
    const rates = await getRatesForDate(date);
    if (!rates) continue; // still offline — try again next time
    for (const obs of group) {
      if (obs.fx && obs.fx.status === 'done') continue;
      obs.fx = buildFxBlock(obs.total_price, obs.currency, rates);
      delete obs.fx_pending; // drops it out of the by-fx-pending index
      await db.put('observations', obs);
      fixed++;
    }
  }
  return fixed;
}

export function initFxBackfill() {
  backfillPendingFx().catch(() => {});
  window.addEventListener('online', () => backfillPendingFx().catch(() => {}));
}
