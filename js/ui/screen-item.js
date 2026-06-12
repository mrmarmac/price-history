/* Item detail: cheapest exact (per package), cheapest for the canonical
 * product, substitutes in the same category, and observation history.
 * Product (name/brand/category) and individual observations are editable. */

import { el, priceText, backLink, confirmDialog, toast, field, select } from './components.js';
import * as repo from '../repo.js';
import { parsePrice } from '../money.js';
import {
  cheapestOf, findSubstitutes,
  getDisplayCurrency, equivalentTotal, equivalentUnitPrice,
} from '../search.js';
import { formatSize, UNITS } from '../units.js';

const ALL_CURRENCIES = ['EUR', 'GBP', 'AUD'];

export async function render(container, { id }) {
  const product = await repo.getProduct(id);
  if (!product) {
    container.append(el('div.empty', {}, 'Item not found.'));
    return;
  }
  const currency = await getDisplayCurrency();
  const storeList = await repo.listStores();
  const stores = new Map(storeList.map((s) => [s.id, s]));
  const categoryList = await repo.listCategories();
  const categories = new Map(categoryList.map((c) => [c.id, c.name]));
  const packages = await repo.getPackagesForProduct(id);
  const observations = await repo.getObservationsForProduct(id);

  const rerender = () => render(clear(container), { id });

  container.append(
    backLink('#/search'),
    el('div.spread', {},
      el('h1', { style: 'margin:0' }, product.name),
      el('button.btn-sm', {
        onclick: () => editProductDialog(product, categoryList, rerender),
      }, '✎ Edit'),
    ),
    el('div.dim.small', { style: 'margin-top:4px' },
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
          obs ? unitLineAll(obs) : null,
        ),
        obs && el('div.right', {},
          el('div.price', {}, priceText(equivalentTotal(obs, currency), currency)),
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
        unitLineAll(obs),
        fxLine(obs),
      ),
      el('button.btn-sm', {
        onclick: (ev) => {
          ev.stopPropagation();
          editObservationDialog(obs, pkg, storeList, rerender);
        },
      }, '✎'),
      el('button.btn-sm.btn-danger', {
        onclick: async (ev) => {
          ev.stopPropagation();
          if (await confirmDialog('Delete this price observation?', 'Delete')) {
            await repo.deleteObservation(obs.id);
            toast('Observation deleted');
            rerender();
          }
        },
      }, '✕'),
    ));
  }
  if (!observations.length) hist.append(el('div.empty', {}, 'No observations yet.'));
  container.append(hist);
}

/* ---------- edit dialogs ---------- */

function editProductDialog(product, categoryList, done) {
  const name = el('input', { value: product.name });
  const brand = el('input', { value: product.brand || '', placeholder: 'optional' });
  const catSel = select(
    categoryList.map((c) => ({ value: c.id, label: c.name })),
    product.categoryId,
  );
  showDialog('Edit item', [
    field('Name', name),
    field('Brand', brand),
    field('Category', catSel),
  ], async () => {
    await repo.saveProduct({
      id: product.id,
      name: name.value,
      brand: brand.value,
      categoryId: catSel.value,
    });
    toast('Item updated', 'good');
    done();
  });
}

function editObservationDialog(obs, pkg, storeList, done) {
  const storeSel = select(
    storeList.map((s) => ({ value: s.id, label: `${s.name} (${s.country})` })),
    obs.storeId,
  );
  const date = el('input', { type: 'date', value: obs.date });
  const price = el('input', { value: (obs.total_price / 100).toFixed(2), inputmode: 'decimal' });
  const curSel = select(ALL_CURRENCIES.map((c) => ({ value: c, label: c })), obs.currency);
  const qty = el('input', { value: obs.quantity, type: 'number', min: 1 });
  const size = el('input', { value: pkg ? pkg.size : obs.size, inputmode: 'decimal' });
  const unitSel = select(UNITS.map((u) => ({ value: u, label: u })), pkg ? pkg.unit : obs.unit);
  showDialog('Edit observation', [
    field('Store', storeSel),
    el('div.field-row', {}, field('Date', date), field('Currency', curSel)),
    el('div.field-row', {}, field('Total price', price), field('Quantity', qty)),
    el('div.field-row', {}, field('Size', size), field('Unit', unitSel)),
    el('p.small.dim', { style: 'margin:0' },
      'Changing date or currency recomputes the FX equivalents for the new receipt date.'),
  ], async () => {
    const p = parsePrice(price.value);
    if (!p) throw new Error('Enter a valid price');
    const sz = Number(String(size.value).replace(',', '.'));
    await repo.updateObservation(obs.id, {
      pkg: { size: sz, unit: unitSel.value },
      obs: {
        storeId: storeSel.value,
        country: null, // re-derived from the store
        date: date.value,
        total_price: p.minor,
        currency: curSel.value,
        quantity: Number(qty.value) || 1,
      },
    });
    toast('Observation updated', 'good');
    done();
  });
}

function showDialog(title, fields, onSave) {
  const dlg = el('dialog', {},
    el('div.stack', {},
      el('h2', { style: 'margin:0' }, title),
      ...fields,
      el('div.row', { style: 'justify-content:flex-end' },
        el('button.btn-ghost', { onclick: () => dlg.close() }, 'Cancel'),
        el('button.btn-primary', {
          onclick: async () => {
            try {
              await onSave();
              dlg.close();
            } catch (err) {
              toast(err.message, 'bad');
            }
          },
        }, 'Save'),
      ),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

/* ---------- cards & lines ---------- */

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
    unitLineAll(obs),
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

/* Unit price in all three currencies, from the frozen equivalents.
 * While FX is pending only the original currency is shown. */
function unitLineAll(obs) {
  if (!obs.reference_unit) return null;
  const parts = [];
  for (const cur of ALL_CURRENCIES) {
    const up = equivalentUnitPrice(obs, cur);
    if (up != null) parts.push(`${priceText(up, cur)}/${obs.reference_unit}`);
  }
  if (!parts.length) return null;
  return el('div.small.dim', {}, parts.join(' · '));
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
