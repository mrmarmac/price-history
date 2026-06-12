/* "Lists" tab: links to stores & categories + display currency. */

import { el, field, select, toast } from './components.js';
import { getDisplayCurrency, setDisplayCurrency } from '../search.js';
import { countPendingFx, backfillPendingFx } from '../fx.js';

export async function render(container) {
  const currency = await getDisplayCurrency();
  const pendingCount = await countPendingFx();
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
    el('h2', {}, 'Exchange rates'),
    fxCard(pendingCount),
  );
}

function fxCard(pendingCount) {
  const status = el('p');
  const setStatus = (n) => {
    status.innerHTML = '';
    status.append(n
      ? el('span.badge.warn', {}, `${n} price${n === 1 ? '' : 's'} waiting for FX rates`)
      : el('span.badge.good', {}, 'All prices have FX rates'));
  };
  setStatus(pendingCount);
  const btn = el('button', {
    onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Fetching…';
      try {
        const fixed = await backfillPendingFx();
        const left = await countPendingFx();
        if (fixed > 0) toast(`Resolved ${fixed} price${fixed === 1 ? '' : 's'}`, 'good');
        else if (left > 0) toast('Rate service not reachable — will retry automatically', 'bad');
        else toast('Nothing to fetch', 'good');
        setStatus(left);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Fetch rates now';
      }
    },
  }, 'Fetch rates now');
  return el('div.card', {},
    status,
    pendingCount ? el('p.small.dim', {},
      'Rates are fetched for each receipt date from frankfurter.app (ECB). ',
      'Retries happen automatically when the app is opened or comes back online.') : null,
    btn,
  );
}
