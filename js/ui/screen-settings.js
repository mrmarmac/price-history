/* "Lists" tab: links to stores & categories + display currency. */

import { el, field, select, toast, confirmDialog } from './components.js';
import { getDisplayCurrency, setDisplayCurrency } from '../search.js';
import { countPendingFx, backfillPendingFx } from '../fx.js';
import { exportBackup, importBackup, validateBackup, backupCounts } from '../backup.js';
import { ensurePersistence, persistenceMessage } from '../storage.js';

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
    el('h2', {}, 'Backup'),
    backupCard(),
  );
}

function backupCard() {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });

  const exportBtn = el('button.btn-primary', {
    onclick: async () => {
      try {
        const backup = await exportBackup();
        const stamp = (backup.exportedAt || '').slice(0, 10) || 'backup';
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: `price-history-${stamp}.json` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const c = backupCounts(backup);
        toast(`Exported ${c.products} items, ${c.observations} prices`, 'good');
      } catch (err) {
        toast('Export failed: ' + err.message, 'bad');
      }
    },
  }, 'Export backup (.json)');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const v = validateBackup(obj);
      if (!v.ok) { toast(v.errors[0], 'bad'); return; }
      const c = backupCounts(obj);
      const mode = await importModeDialog(c);
      if (!mode) return;
      const done = await importBackup(obj, mode);
      toast(`Imported ${done.products} items, ${done.observations} prices`, 'good');
      location.hash = '#/search';
    } catch (err) {
      toast('Import failed: ' + err.message, 'bad');
    } finally {
      fileInput.value = '';
    }
  });

  const persistWarn = el('p.small', { style: 'margin:0' });
  ensurePersistence().then((state) => {
    const msg = persistenceMessage(state);
    if (msg) persistWarn.append(el('span.badge.warn', {}, '⚠ ' + msg));
  }).catch(() => {});

  return el('div.card.stack', {},
    el('p.small.dim', { style: 'margin:0' },
      'Your data lives only on this device. Export regularly — a browser can evict local storage, and the file restores everything to any device.'),
    persistWarn,
    exportBtn,
    el('button', { onclick: () => fileInput.click() }, 'Import backup…'),
    fileInput,
  );
}

/* Ask how to apply an import: Merge (default, safe) or Replace-all. */
function importModeDialog(counts) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { settled = true; resolve(value); dlg.close(); };
    const dlg = el('dialog', {},
      el('div.stack', {},
        el('h2', { style: 'margin:0' }, 'Import backup'),
        el('p.small', { style: 'margin:0' },
          `This file has ${counts.products} items and ${counts.observations} prices.`),
        el('button.btn-primary.btn-block', {
          onclick: () => finish('merge'),
        }, 'Merge (add & update, keep current)'),
        el('button.btn-block.btn-danger', {
          onclick: async () => {
            if (await confirmDialog('Replace ALL current data with this backup? This cannot be undone.', 'Replace all')) {
              finish('replace');
            }
          },
        }, 'Replace all (restore)'),
        el('button.btn-ghost.btn-block', { onclick: () => finish(null) }, 'Cancel'),
      ),
    );
    dlg.addEventListener('close', () => { dlg.remove(); if (!settled) resolve(null); }, { once: true });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
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
