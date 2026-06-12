/* Store list management (seeded with the spec's chains, fully editable). */

import { el, field, select, toast, confirmDialog, backLink } from './components.js';
import * as repo from '../repo.js';

export async function render(container) {
  container.append(backLink('#/settings'), el('h1', {}, 'Stores'));

  const list = el('ul.list');
  container.append(list, el('h2', {}, 'Add store'), form());

  async function refresh() {
    const stores = await repo.listStores();
    list.innerHTML = '';
    for (const s of stores.sort((a, b) => a.name.localeCompare(b.name))) {
      const li = el('li.list-item', {},
        el('div.grow', {},
          el('div', {}, s.name),
          el('div.small.dim', {}, `${s.country} · ${s.currency_default}`),
        ),
        el('button.btn-sm', { onclick: () => list.replaceChild(editRow(s), li) }, 'Edit'),
        el('button.btn-sm.btn-danger', {
          onclick: async () => {
            if (await confirmDialog(`Delete store "${s.name}"? Existing observations keep their data.`, 'Delete')) {
              await repo.deleteStore(s.id);
              refresh();
            }
          },
        }, '✕'),
      );
      list.append(li);
    }
  }

  function editRow(s) {
    const name = el('input', { value: s.name });
    const country = select(repo.COUNTRIES.map((c) => ({ value: c, label: c })), s.country);
    const cur = select(['EUR', 'GBP', 'AUD'].map((c) => ({ value: c, label: c })), s.currency_default);
    return el('li.list-item', { dataset: { id: s.id } },
      el('div.grow.stack', {}, name, el('div.field-row', {}, country, cur)),
      el('button.btn-sm.btn-primary', {
        onclick: async () => {
          try {
            await repo.saveStore({ ...s, name: name.value, country: country.value, currency_default: cur.value });
            toast('Store updated', 'good');
            refresh();
          } catch (err) { toast(err.message, 'bad'); }
        },
      }, 'Save'),
    );
  }

  function form() {
    const name = el('input', { placeholder: 'Store name' });
    const country = select(repo.COUNTRIES.map((c) => ({ value: c, label: c })), 'DE');
    const cur = select(['EUR', 'GBP', 'AUD'].map((c) => ({ value: c, label: c })), 'EUR');
    return el('div.card.stack', {},
      field('Name', name),
      el('div.field-row', {}, field('Country', country), field('Currency', cur)),
      el('button.btn-primary', {
        onclick: async () => {
          try {
            await repo.saveStore({ name: name.value, country: country.value, currency_default: cur.value });
            name.value = '';
            toast('Store added', 'good');
            refresh();
          } catch (err) { toast(err.message, 'bad'); }
        },
      }, 'Add store'),
    );
  }

  await refresh();
}
