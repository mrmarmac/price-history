/* Pure receipt parser: OCR text → classified lines → DraftLine[].
 * Heuristic by design — it only DRAFTS lines; the wizard's correction
 * step is where truth is established. Every parsing bug found in the
 * field should become a fixture in test/fixtures/receipts.js.
 *
 * price_type mapping used by the parser:
 *   single    — one item, one price
 *   per_unit  — N × per-item price (e.g. "2 Stk x 0,39")
 *   weighted  — measured weight × per-kg price (e.g. "0,234 kg x 2,99 EUR/kg")
 *   bundle    — multi-buy line with a pack total (e.g. Tesco "2 … £5.80")
 *   promo     — a discount line was attached (e.g. "Frischerabatt -0,99",
 *               Tesco "Cc Any 2 For £5 -£0.80")
 */

import { parsePrice, roundMinor } from './money.js';
import { suggestEnglishName } from './dictionary.js';
import { diceSimilarity, normalizeName } from './normalize.js';

/* ---------- line-level regexes ---------- */

// "0,234 kg x 2,99 EUR/kg [0,70 B]" (REWE/EDEKA) | "1.015 kg @ (£0.90/kg)" (Tesco)
const RE_WEIGHT = /(\d+[.,]\d+)\s*kg\s*[x×*@]\s*\(?\s*(?:€|£|\$)?\s*(\d+[.,]\d{1,2})\s*(?:EUR|€|£|\$)?\s*\/\s*kg\s*\)?/i;

// "2 Stk x 0,39 [0,78 B]" (DE qty breakdown) | "1 x Frischerabatt" handled as discount
const RE_QTY = /^\s*(\d{1,2})\s*(?:stk|st)\.?\s*[x×*]\s*(?:€|£|\$)?\s*(\d+[.,]\d{2})/i;

// trailing price token: "2,59 B", "£3.00", "0,25*A", "-0,99 B", "1,75 8" (OCR'd B)
const RE_TRAIL_PRICE = /(-?\s*(?:€|£|\$)?\s*-?\d+[.,]\d{2})\s*(?:€|EUR)?\s*\*?\s*[AB8]?\s*$/;

// "£2.90 each" / "0,65 each"
const RE_EACH = /(?:€|£|\$)?\s*(\d+[.,]\d{2})\s*each/i;

// Tesco-style leading quantity: "2  Tesco Finest ... £5.80"
const RE_LEAD_QTY = /^\s*([1-9]\d?)\s+(\S.*)$/;

// dates: 23.02.2026 | 02/05/2026 | 2026-02-23 (day-first for . and /)
const RE_DATE_DMY = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
const RE_DATE_ISO = /(\d{4})-(\d{2})-(\d{2})/;

const DISCOUNT_WORDS = /rabatt|nachlass|aktionspreis|discount|coupon|cc\s|any\s*\d\s*for/i;

const NOISE = new RegExp([
  '^summe\\b', '^subtotal', '^total\\b', '^zwischensumme', 'zu zahlen',
  '^geg\\b', '^geg\\.', 'gegeben', 'rueckgeld', 'r[üu]ckgeld',
  'mastercard', 'maestro', 'girocard', 'visa', 'debit', 'credit', 'contactless',
  'kundenbeleg', 'zahlung', 'bezahlung', 'kartenzahlung',
  'uid\\b', 'ust', 'mwst', 'vat\\b', 'steuer', 'brutto', 'netto',
  '^datum', '^uhrzeit', 'beleg-?nr', 'trace', 'bon-?nr', '^tse', '^kasse',
  '^posten', 'clubcard', 'points', 'balance', '^savings', '^promotions',
  'aid:', 'pan seq', 'authori[sz]ation', 'merchant', '^number:',
  'danke', 'vielen dank', 'wiedersehen', 'thank you', 'store-locator',
  'jetzt sparen', 'collect money', 'rewe bonus',
  '^tel[.:]', 'telefon', 'www\\.', 'http', '@[a-z0-9.-]+\\.[a-z]{2}',
  '^\\*+', '^[-=_*\\s]+$', '^eur$', 'questions please',
].join('|'), 'i');

/* ---------- helpers ---------- */

function parseDateToken(line) {
  let m = line.match(RE_DATE_ISO);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    return toISO(y, mo, d);
  }
  m = line.match(RE_DATE_DMY);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return toISO(y, mo, d);
  }
  return null;
}

function toISO(y, mo, d) {
  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function cleanName(s) {
  return s
    .replace(RE_TRAIL_PRICE, '')
    .replace(/\s+(?:EUR|€|£)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isPlausibleName(s) {
  const letters = (s.match(/[a-zA-ZäöüßÄÖÜ]/g) || []).length;
  return letters >= 3;
}

function guessCurrency(text) {
  if (/£/.test(text)) return 'GBP';
  if (/€|\bEUR\b/.test(text)) return 'EUR';
  if (/\$|\bAUD\b/i.test(text)) return 'AUD';
  return null;
}

function guessStore(lines, stores) {
  let best = null;
  let bestScore = 0.5;
  for (const line of lines.slice(0, 12)) {
    const norm = normalizeName(line);
    if (!norm) continue;
    for (const s of stores) {
      const sNorm = normalizeName(s.name);
      const first = sNorm.split(' ')[0];
      let score = diceSimilarity(norm, sNorm);
      if (first.length >= 4 && norm.includes(first)) score = Math.max(score, 0.9);
      if (score > bestScore) { bestScore = score; best = s; }
    }
  }
  return best;
}

function makeDraft(raw) {
  return {
    rawText: raw,
    name: '',
    suggestedName: null,
    totalMinor: null,
    currency: null,
    quantity: 1,
    size: 1,
    unit: 'pcs',
    perItemMinor: null,
    price_type: 'single',
    discountMinor: 0,
    confidence: 'high',
  };
}

function finishDraft(d) {
  d.suggestedName = suggestEnglishName(d.name);
  if (d.discountMinor !== 0) {
    d.totalMinor = (d.totalMinor ?? 0) + d.discountMinor;
    d.price_type = 'promo';
  }
  return d;
}

/* ---------- main entry ---------- */

/* parseReceipt(text, { stores }) →
 *   { storeGuess, dateISO, currencyGuess, lines: DraftLine[] } */
export function parseReceipt(text, opts = {}) {
  const stores = opts.stores || [];
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let dateISO = null;
  const items = [];
  let pendingName = null; // name-only line waiting for its price/detail line
  let last = null;        // last emitted item, for detail/discount attachment

  const currencyGuess = guessCurrency(text);
  const storeGuess = guessStore(rawLines, stores);

  for (const line of rawLines) {
    // date can sit on a noise line ("Datum: 23.02.2026") — check first
    if (!dateISO) {
      const iso = parseDateToken(line);
      if (iso && /datum|date|\d{1,2}:\d{2}/i.test(line)) dateISO = iso;
      else if (iso && !dateISO) dateISO = dateISO || iso;
    }

    if (NOISE.test(line)) { pendingName = null; continue; }

    /* --- weighed goods: "0,234 kg x 2,99 EUR/kg [0,70 B]" --- */
    const w = line.match(RE_WEIGHT);
    if (w) {
      const weight = Number(w[1].replace(',', '.'));
      const perKg = parsePrice(w[2]);
      const rest = line.replace(w[0], ' ');
      const trail = rest.match(RE_TRAIL_PRICE);
      const total = trail ? parsePrice(trail[1]) : null;

      let target = null;
      if (pendingName) {
        target = makeDraft(pendingName + ' | ' + line);
        target.name = pendingName;
        items.push(target);
        pendingName = null;
      } else if (last) {
        target = last; // Tesco: item line first, weight detail after
        target.rawText += ' | ' + line;
      } else {
        continue;
      }
      target.price_type = 'weighted';
      target.quantity = 1;
      target.size = weight;
      target.unit = 'kg';
      target.perItemMinor = perKg ? perKg.minor : null;
      if (total) target.totalMinor = total.minor;
      else if (target.totalMinor == null && perKg) {
        target.totalMinor = roundMinor(weight * perKg.minor);
        target.confidence = 'low';
      }
      last = target;
      continue;
    }

    /* --- qty breakdown: "2 Stk x 0,39 [0,78 B]" --- */
    const q = line.match(RE_QTY);
    if (q) {
      const n = Number(q[1]);
      const per = parsePrice(q[2]);
      const rest = line.replace(q[0], ' ');
      const trail = rest.match(RE_TRAIL_PRICE);
      const total = trail ? parsePrice(trail[1]) : null;

      let target = null;
      if (pendingName) {
        target = makeDraft(pendingName + ' | ' + line);
        target.name = pendingName;
        items.push(target);
        pendingName = null;
      } else if (last) {
        target = last;
        target.rawText += ' | ' + line;
      } else {
        continue;
      }
      target.price_type = 'per_unit';
      target.quantity = n;
      target.perItemMinor = per ? per.minor : null;
      if (total) target.totalMinor = total.minor;
      else if (per) target.totalMinor = per.minor * n;
      last = target;
      continue;
    }

    /* --- "£2.90 each" note --- */
    const each = line.match(RE_EACH);
    if (each && last) {
      const per = parsePrice(each[1]);
      if (per) last.perItemMinor = per.minor;
      continue;
    }

    /* --- discount lines --- */
    const trail = line.match(RE_TRAIL_PRICE);
    const trailPrice = trail ? parsePrice(trail[1]) : null;
    const looksDiscount = (trailPrice && trailPrice.minor < 0) || DISCOUNT_WORDS.test(line);
    if (looksDiscount && trailPrice && last) {
      const amount = trailPrice.minor < 0 ? trailPrice.minor : -trailPrice.minor;
      last.discountMinor += amount;
      last.rawText += ' | ' + line;
      pendingName = null;
      continue;
    }

    /* --- item line: name + trailing price --- */
    if (trailPrice && trailPrice.minor > 0) {
      let body = cleanName(line);
      let quantity = 1;
      const lead = body.match(RE_LEAD_QTY);
      if (lead && isPlausibleName(lead[2])) {
        quantity = Number(lead[1]);
        body = lead[2];
      }
      if (pendingName) {
        // wrapped name: "FRANKENDAMMER" + "SESAMRING SIMIT  2,59 B"
        body = (pendingName + ' ' + body).trim();
        pendingName = null;
      }
      if (!isPlausibleName(body)) continue;

      const d = makeDraft(line);
      d.name = body;
      d.totalMinor = trailPrice.minor;
      d.currency = trailPrice.currency;
      d.quantity = quantity;
      if (quantity > 1) {
        d.price_type = 'bundle';
        d.perItemMinor = roundMinor(trailPrice.minor / quantity);
      }
      items.push(d);
      last = d;
      continue;
    }

    /* --- name-only line (wrapped name or weighed-item header) --- */
    if (isPlausibleName(cleanName(line)) && !/\d{4,}/.test(line)) {
      pendingName = cleanName(line);
      continue;
    }
    pendingName = null;
  }

  return {
    storeGuess,
    dateISO,
    currencyGuess,
    lines: items.map(finishDraft),
  };
}
