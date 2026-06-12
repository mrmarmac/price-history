/* Main screen: search box + product list with cheapest-known price. */

import { el, priceText } from './components.js';
import {
  searchProducts, cheapestForProduct, getDisplayCurrency,
  equivalentTotal, equivalentUnitPrice,
} from '../search.js';
import * as db from '../db.js';

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
      results.append(el('li.list-item', {
        onclick: () => { location.hash = '#/item/' + p.id; },
      },
        el('div.grow', {},
          el('div', {}, p.name, p.brand ? el('span.dim.small', {}, ' · ' + p.brand) : null),
          el('div.small.dim', {}, obs ? cheapestLine(obs) : 'no prices yet'),
        ),
        el('div.right', {},
          el('div.small.dim.nowrap', {}, obs ? obs.date : ''),
          el('span.badge', {}, categories.get(p.categoryId) || '—'),
        ),
      ));
    }
  }

  /* "2,29 €/l · 2,29 € · Lidl" — unit price first (the comparison number),
   * then the paid total, then the store. */
  function cheapestLine(obs) {
    const parts = [];
    const up = equivalentUnitPrice(obs, currency);
    if (up != null && obs.reference_unit) {
      parts.push(`${priceText(up, currency)}/${obs.reference_unit}`);
    }
    const total = equivalentTotal(obs, currency);
    if (total != null) parts.push(priceText(total, currency));
    parts.push(storesById.get(obs.storeId) || '?');
    return parts.join(' · ');
  }

  await run();
  input.focus();
}
