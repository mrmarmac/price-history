/* Category list management. Only items explicitly placed in a category
 * are comparable as substitutes. */

import { el, toast, confirmDialog, backLink } from './components.js';
import * as repo from '../repo.js';

export async function render(container) {
  container.append(backLink('#/settings'), el('h1', {}, 'Categories'));

  const list = el('ul.list');
  const name = el('input', { placeholder: 'New category name' });
  container.append(
    list,
    el('h2', {}, 'Add category'),
    el('div.card', {},
      el('div.row', {},
        el('div.grow', {}, name),
        el('button.btn-primary', {
          onclick: async () => {
            try {
              await repo.saveCategory({ name: name.value });
              name.value = '';
              toast('Category added', 'good');
              refresh();
            } catch (err) { toast(err.message, 'bad'); }
          },
        }, 'Add'),
      ),
    ),
  );

  async function refresh() {
    const cats = await repo.listCategories();
    list.innerHTML = '';
    for (const c of cats.sort((a, b) => a.name.localeCompare(b.name))) {
      const li = el('li.list-item', {},
        el('div.grow', {}, c.name),
        el('button.btn-sm', {
          onclick: () => {
            const input = el('input', { value: c.name });
            const row = el('li.list-item', {},
              el('div.grow', {}, input),
              el('button.btn-sm.btn-primary', {
                onclick: async () => {
                  try {
                    await repo.saveCategory({ id: c.id, name: input.value });
                    refresh();
                  } catch (err) { toast(err.message, 'bad'); }
                },
              }, 'Save'),
            );
            list.replaceChild(row, li);
          },
        }, 'Edit'),
        el('button.btn-sm.btn-danger', {
          onclick: async () => {
            if (await confirmDialog(`Delete category "${c.name}"? Items keep their data but lose substitute matching.`, 'Delete')) {
              await repo.deleteCategory(c.id);
              refresh();
            }
          },
        }, '✕'),
      );
      list.append(li);
    }
  }

  await refresh();
}
