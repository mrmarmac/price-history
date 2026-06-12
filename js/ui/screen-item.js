/* Item detail: cheapest exact (per package), cheapest for the canonical
 * product, substitutes in the same category, and observation history. */

import { el, priceText, backLink, confirmDialog, toast } from './components.js';
import * as repo from '../repo.js';
import * as db from '../db.js';
import {
  cheapestOf, cheapestForProduct, findSubstitutes,
  getDisplayCurrency, equivalentTotal, equivalentUnitPrice,
} from '../search.js';
import { formatSize } from '../units.js';

export async function render(container, { id }) {
  const product = await repo.getProduct(id);
  if (!product) {
    container.append(el('div.empty', {}, 'Item not found.'));
    return;
  }
  const currency = await getDisplayCurrency();
  const stores = new Map((await repo.listStores()).map((s) => [s.id, s]));
  const categories = new Map((await repo.listCategories()).map((c) => [c.id, c.name]));
  const packages = await repo.getPackagesForProduct(id);
  const observations = await repo.getObservationsForProduct(id);

  container.append(
    backLink('#/search'),
    el('h1', {}, product.name),
    el('div.dim.small', {},
      product.brand ? product.brand + ' · ' : '',
      categories.get(product.categoryId) || 'no category'),
  );

  /* cheapest for the canonical product (any size) */
  const best = cheapestOf(observations, currency);
  container.append(el('h2', {}, 'Cheapest ever (any size)'));
  container.append(bestCard(best, currency, stores, packages));

  /* cheapest exact per package */
  if (packages.length) {
    container.append(el('h2', {}, 'Cheapest per size'));
    const ul = el('ul.list');
    for (const pkg of packages) {
      const pkgObs = observations.filter((o) => o.packageId === pkg.id);
      const { obs, excludedPending } = cheapestOf(pkgObs, currency);
      ul.append(el('li.list-item', {},
        el('div.grow', {},
          el('div', {}, formatSize(pkg.size, pkg.unit)),
          el('div.small.dim', {}, obs
            ? `${stores.get(obs.storeId)?.name || '?'} · ${obs.date}`
            : 'no prices yet'),
        ),
        obs && el('div.right', {},
          el('div.price', {}, priceText(equivalentTotal(obs, currency), currency)),
          unitLine(obs, currency),
        ),
        excludedPending ? el('span.badge.warn', {}, 'FX pending') : null,
      ));
    }
    container.append(ul);
  }

  /* substitutes */
  const subs = await findSubstitutes(product, currency);
  container.append(el('h2', {}, 'Cheapest substitutes (same category)'));
  if (!subs.length) {
    container.append(el('p.dim.small', {}, 'No comparable items in this category yet.'));
  } else {
    const ul = el('ul.list');
    for (const s of subs) {
      ul.append(el('li.list-item', { onclick: () => { location.hash = '#/item/' + s.product.id; } },
        el('div.grow', {},
          el('div', {}, s.product.name),
          el('div.small.dim', {}, `${stores.get(s.obs.storeId)?.name || '?'} · ${s.obs.date}`),
        ),
        el('div.right', {},
          el('div.price', {}, priceText(equivalentTotal(s.obs, currency), currency)),
          unitLine(s.obs, currency),
        ),
      ));
    }
    container.append(ul);
  }

  /* full history */
  container.append(el('h2', {}, `All observations (${observations.length})`));
  const hist = el('ul.list');
  for (const obs of observations.sort((a, b) => b.date.localeCompare(a.date))) {
    const pkg = packages.find((p) => p.id === obs.packageId);
    hist.append(el('li.list-item', {},
      el('div.grow', {},
        el('div', {},
          priceText(obs.total_price, obs.currency), ' ',
          el('span.dim.small', {},
            pkg ? formatSize(pkg.size, pkg.unit) : '',
            obs.quantity > 1 ? ` ×${obs.quantity}` : '',
            ` · ${obs.price_type}`),
        ),
        el('div.small.dim', {}, `${stores.get(obs.storeId)?.name || '?'} · ${obs.date}`),
        fxLine(obs),
      ),
      el('button.btn-sm.btn-danger', {
        onclick: async (ev) => {
          ev.stopPropagation();
          if (await confirmDialog('Delete this price observation?', 'Delete')) {
            await repo.deleteObservation(obs.id);
            toast('Observation deleted');
            render(clear(container), { id });
          }
        },
      }, '✕'),
    ));
  }
  if (!observations.length) hist.append(el('div.empty', {}, 'No observations yet.'));
  container.append(hist);
}

function bestCard(best, currency, stores, packages) {
  if (!best.obs) {
    return el('div.card.dim', {},
      'No prices recorded yet.',
      best.excludedPending ? ' (Some entries are waiting for FX rates.)' : '');
  }
  const obs = best.obs;
  const pkg = packages.find((p) => p.id === obs.packageId);
  return el('div.card', {},
    el('div.price-big', {}, priceText(equivalentTotal(obs, currency), currency)),
    el('div', {},
      pkg ? formatSize(pkg.size, pkg.unit) + ' · ' : '',
      stores.get(obs.storeId)?.name || 'unknown store', ' · ', obs.date),
    unitLine(obs, currency),
    obs.currency !== currency
      ? el('div.small.dim.mt', {}, `paid ${priceText(obs.total_price, obs.currency)} · FX of ${obs.fx?.rate_date || obs.date}`)
      : null,
    best.excludedPending ? el('div.mt', {}, el('span.badge.warn', {}, `${best.excludedPending} excluded (FX pending)`)) : null,
  );
}

function unitLine(obs, currency) {
  const up = equivalentUnitPrice(obs, currency);
  if (up == null || !obs.reference_unit) return null;
  return el('div.small.dim', {}, `${priceText(up, currency)} / ${obs.reference_unit}`);
}

function fxLine(obs) {
  if (obs.fx && obs.fx.status === 'pending') {
    return el('div.small', {}, el('span.badge.warn', {}, 'FX pending'));
  }
  return null;
}

function clear(container) {
  container.innerHTML = '';
  return container;
}
