/* Main screen: search box + product list with cheapest-known price. */

import { el, priceText } from './components.js';
import { searchProducts, cheapestForProduct, getDisplayCurrency, equivalentUnitPrice } from '../search.js';
import * as db from '../db.js';
import { formatSize } from '../units.js';

export async function render(container) {
  const currency = await getDisplayCurrency();
  const categories = new Map((await db.getAll('categories')).map((c) => [c.id, c.name]));
  const storesById = new Map((await db.getAll('stores')).map((s) => [s.id, s.name]));

  const results = el('ul.list');
  const input = el('input', {
    type: 'search',
    placeholder: 'Search items… (e.g. milk, Milch)',
    autocomplete: 'off',
    oninput: () => { clearTimeout(input._t); input._t = setTimeout(run, 150); },
  });

  container.append(
    el('h1', {}, 'Price History'),
    el('div.field', {}, input),
    results,
  );

  async function run() {
    const products = await searchProducts(input.value);
    results.innerHTML = '';
    if (!products.length) {
      results.append(el('div.empty', {},
        input.value ? 'No items match.' : 'No items yet — scan a receipt or add one manually.'));
      return;
    }
    for (const p of products) {
      const { obs } = await cheapestForProduct(p.id, currency);
      const sub = obs
        ? `${priceText(equivalentTotalLine(obs, currency), currency)} · ${storesById.get(obs.storeId) || '?'} · ${obs.date}`
        : 'no prices yet';
      results.append(el('li.list-item', {
        onclick: () => { location.hash = '#/item/' + p.id; },
      },
        el('div.grow', {},
          el('div', {}, p.name, p.brand ? el('span.dim.small', {}, ' · ' + p.brand) : null),
          el('div.small.dim', {}, sub),
        ),
        el('span.badge', {}, categories.get(p.categoryId) || '—'),
      ));
    }
  }

  function equivalentTotalLine(obs, cur) {
    // cheapest is ranked by unit price; the list shows the observation total
    const t = obs.currency === cur ? obs.total_price
      : (obs.fx && obs.fx.status === 'done' ? obs.fx['equivalent_' + cur.toLowerCase()] : null);
    return t;
  }

  await run();
  input.focus();
}
