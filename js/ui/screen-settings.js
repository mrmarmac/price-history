/* "Lists" tab: links to stores & categories + display currency. */

import { el, field, select, toast } from './components.js';
import { getDisplayCurrency, setDisplayCurrency } from '../search.js';

export async function render(container) {
  const currency = await getDisplayCurrency();
  const sel = select(
    ['EUR', 'GBP', 'AUD'].map((c) => ({ value: c, label: c })),
    currency,
    {
      onchange: async () => {
        await setDisplayCurrency(sel.value);
        toast('Display currency: ' + sel.value, 'good');
      },
    },
  );

  container.append(
    el('h1', {}, 'Lists & Settings'),
    el('ul.list', {},
      el('li.list-item', { onclick: () => { location.hash = '#/stores'; } },
        el('div.grow', {}, 'Stores'), el('span.dim', {}, '›')),
      el('li.list-item', { onclick: () => { location.hash = '#/categories'; } },
        el('div.grow', {}, 'Categories'), el('span.dim', {}, '›')),
    ),
    el('h2', {}, 'Display'),
    el('div.card', {},
      field('Compare prices in', sel),
      el('p.small.dim', {},
        'Changing this only changes how prices are displayed and ranked. ',
        'Historical FX equivalents are frozen at the time each price was recorded and never change.'),
    ),
  );
}
