/* Add-receipt wizard. Steps:
 *   CAPTURE → OCR_RUNNING → META_CONFIRM → LINE_REVIEW → MATCH_CONFIRM → SAVING → DONE
 * Manual entry (Flow B) runs the SAME wizard starting at META_CONFIRM with
 * one empty line — one data path for both flows.
 * The draft lives in memory only; the photo is never persisted. */

import { el, field, select, toast, priceText } from './components.js';
import * as repo from '../repo.js';
import { parseReceipt } from '../parser.js';
import { recognizeReceipt } from '../ocr.js';
import { parsePrice, formatMinor } from '../money.js';
import { UNITS } from '../units.js';
import { findMatches } from '../match.js';
import { suggestEnglishName } from '../dictionary.js';

const STEPS = ['CAPTURE', 'META_CONFIRM', 'LINE_REVIEW', 'MATCH_CONFIRM', 'DONE'];

export async function render(container) {
  return runWizard(container, { manual: false });
}

export async function runWizard(container, { manual }) {
  const stores = await repo.listStores();
  const categories = await repo.listCategories();
  const products = await repo.listProducts();

  const state = {
    step: manual ? 'META_CONFIRM' : 'CAPTURE',
    meta: { storeId: stores[0]?.id || null, date: today(), currency: stores[0]?.currency_default || 'EUR' },
    lines: manual ? [emptyLine()] : [],
    cursor: 0,
    saved: [],
    failed: [],
  };

  function emptyLine() {
    return {
      rawText: '', name: '', suggestedName: null, totalMinor: null, currency: null,
      quantity: 1, size: 1, unit: 'pcs', perItemMinor: null, price_type: 'single',
      discountMinor: 0, confidence: 'high', status: 'accepted',
    };
  }

  function go(step) {
    state.step = step;
    draw();
  }

  function draw() {
    container.innerHTML = '';
    container.append(
      el('h1', {}, manual ? 'Add item' : 'Add receipt'),
      stepsBar(),
    );
    ({
      CAPTURE: drawCapture,
      OCR_RUNNING: drawOcr,
      META_CONFIRM: drawMeta,
      LINE_REVIEW: drawReview,
      MATCH_CONFIRM: drawMatch,
      SAVING: drawSaving,
      DONE: drawDone,
    })[state.step]();
  }

  function stepsBar() {
    const visual = manual ? STEPS.slice(1) : STEPS;
    const current = state.step === 'OCR_RUNNING' ? 'CAPTURE'
      : state.step === 'SAVING' ? 'MATCH_CONFIRM' : state.step;
    const idx = visual.indexOf(current);
    return el('div.steps', {}, visual.map((s, i) =>
      el('span' + (i <= idx ? '.done' : ''))));
  }

  /* ---------- CAPTURE ---------- */

  function drawCapture() {
    const input = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment',
      style: 'display:none',
      onchange: () => input.files[0] && startOcr(input.files[0]),
    });
    const drop = el('div.capture-drop', {},
      el('p', {}, '📷'),
      el('p', {}, 'Photograph or upload a receipt'),
      el('p.small.dim', {}, 'The photo is processed on this device and deleted after text extraction.'),
    );
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) startOcr(f);
    });
    container.append(
      drop,
      el('div.stack.mt', {},
        el('button.btn-primary.btn-block', { onclick: () => input.click() }, 'Take photo / choose image'),
        el('a.btn.btn-ghost.btn-block', { href: '#/manual' }, 'Type it in manually instead'),
      ),
      input,
    );
  }

  async function startOcr(file) {
    go('OCR_RUNNING');
    const bar = container.querySelector('progress');
    try {
      const text = await recognizeReceipt(file, (p) => { if (bar) bar.value = p; });
      const parsed = parseReceipt(text, { stores });
      if (parsed.storeGuess) {
        state.meta.storeId = parsed.storeGuess.id;
        state.meta.currency = parsed.storeGuess.currency_default;
      }
      if (parsed.currencyGuess) state.meta.currency = parsed.currencyGuess;
      if (parsed.dateISO) state.meta.date = parsed.dateISO;
      state.lines = parsed.lines.map((l) => ({
        ...l,
        status: l.confidence === 'high' && l.totalMinor != null && l.name ? 'accepted' : 'pending',
      }));
      if (!state.lines.length) {
        toast('No price lines found — you can add them manually.', 'bad');
        state.lines = [emptyLine()];
      }
      go('META_CONFIRM');
    } catch (err) {
      console.error(err);
      toast('OCR failed: ' + err.message, 'bad');
      go('CAPTURE');
    }
  }

  function drawOcr() {
    container.append(
      el('div.card.stack', {},
        el('p', {}, 'Reading receipt…'),
        el('progress', { max: 1, value: 0 }),
        el('p.small.dim', {}, 'First run downloads the OCR engine (~9 MB); afterwards it works offline.'),
        el('button.btn-ghost', { onclick: () => go('CAPTURE') }, 'Cancel'),
      ),
    );
  }

  /* ---------- META_CONFIRM ---------- */

  function drawMeta() {
    const storeSel = select(stores.map((s) => ({ value: s.id, label: `${s.name} (${s.country})` })), state.meta.storeId, {
      onchange: () => {
        state.meta.storeId = storeSel.value;
        const st = stores.find((s) => s.id === storeSel.value);
        if (st) { state.meta.currency = st.currency_default; curSel.value = st.currency_default; }
      },
    });
    const dateInput = el('input', { type: 'date', value: state.meta.date, onchange: () => { state.meta.date = dateInput.value; } });
    const curSel = select(['EUR', 'GBP', 'AUD'].map((c) => ({ value: c, label: c })), state.meta.currency, {
      onchange: () => { state.meta.currency = curSel.value; },
    });
    container.append(
      el('div.card.stack', {},
        field('Store', storeSel),
        el('div.field-row', {}, field('Receipt date', dateInput), field('Currency', curSel)),
        el('p.small.dim', {}, 'If the receipt has no date, the scan date (today) is used.'),
      ),
      el('div.row.mt', {},
        !manual && el('button.btn-ghost', { onclick: () => go('CAPTURE') }, 'Back'),
        el('button.btn-primary.grow', {
          onclick: () => {
            if (!state.meta.storeId) return toast('Pick a store', 'bad');
            if (!state.meta.date) state.meta.date = today();
            go(manual ? 'MATCH_CONFIRM' : 'LINE_REVIEW');
          },
        }, 'Continue'),
      ),
    );
  }

  /* ---------- LINE_REVIEW ---------- */

  function drawReview() {
    const list = el('ul.list');

    const redraw = () => { list.innerHTML = ''; state.lines.forEach((l, i) => list.append(row(l, i))); };

    function row(line, i) {
      const cls = line.status === 'accepted' ? '.accepted' : line.status === 'rejected' ? '.rejected' : '.low-conf';
      return el('li.list-item.draft-line' + cls, {},
        el('div.grow', { onclick: () => editLine(line, redraw) },
          el('div', {}, line.name || el('em.dim', {}, 'unnamed')),
          el('div.small.dim', {},
            priceText(line.totalMinor, line.currency || state.meta.currency),
            line.quantity > 1 ? ` · ×${line.quantity}` : '',
            line.price_type !== 'single' ? ` · ${line.price_type}` : '',
            line.discountMinor ? ` · incl. ${formatMinor(line.discountMinor, line.currency || state.meta.currency)} discount` : '',
          ),
        ),
        el('button.btn-sm', {
          onclick: () => { line.status = line.status === 'accepted' ? 'rejected' : 'accepted'; redraw(); },
        }, line.status === 'accepted' ? '✓' : line.status === 'rejected' ? '✗' : '?'),
      );
    }

    redraw();
    container.append(
      el('p.small.dim', {}, 'Tap a line to edit it. Toggle ✓/✗ to accept or reject. Rejected lines are not saved.'),
      el('div.row', { style: 'margin-bottom:10px' },
        el('button.btn-sm', { onclick: () => { state.lines.forEach((l) => { l.status = 'accepted'; }); redraw(); } }, 'Accept all'),
        el('button.btn-sm', { onclick: () => { state.lines.forEach((l) => { if (l.status === 'pending') l.status = 'rejected'; }); redraw(); } }, 'Reject unsure'),
        el('button.btn-sm', { onclick: () => { state.lines.push({ ...emptyLine(), status: 'accepted' }); redraw(); } }, '+ line'),
      ),
      list,
      el('div.row.mt', {},
        el('button.btn-ghost', { onclick: () => go('META_CONFIRM') }, 'Back'),
        el('button.btn-primary.grow', {
          onclick: () => {
            state.lines = state.lines.filter((l) => l.status !== 'rejected');
            if (!state.lines.filter((l) => l.status === 'accepted').length) return toast('Accept at least one line', 'bad');
            state.lines = state.lines.filter((l) => l.status === 'accepted');
            state.cursor = 0;
            go('MATCH_CONFIRM');
          },
        }, 'Continue'),
      ),
    );
  }

  function editLine(line, done) {
    const name = el('input', { value: line.name });
    const price = el('input', { value: line.totalMinor != null ? (line.totalMinor / 100).toFixed(2) : '', inputmode: 'decimal', placeholder: '2.99' });
    const qty = el('input', { value: line.quantity, type: 'number', min: 1 });
    const typeSel = select(repo.PRICE_TYPES.map((t) => ({ value: t, label: t })), line.price_type);
    const dlg = el('dialog', {},
      el('div.stack', {},
        field('Item name', name),
        el('div.field-row', {}, field('Total price', price), field('Quantity', qty)),
        field('Price type', typeSel),
        el('div.row', { style: 'justify-content:flex-end' },
          el('button.btn-ghost', { onclick: () => dlg.close() }, 'Cancel'),
          el('button.btn-primary', {
            onclick: () => {
              const p = parsePrice(price.value);
              line.name = name.value;
              line.totalMinor = p ? p.minor : null;
              line.quantity = Number(qty.value) || 1;
              line.price_type = typeSel.value;
              line.suggestedName = suggestEnglishName(line.name);
              line.status = 'accepted';
              dlg.close();
              done();
            },
          }, 'Save'),
        ),
      ),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* ---------- MATCH_CONFIRM (one line at a time) ---------- */

  function drawMatch() {
    const line = state.lines[state.cursor];
    if (!line) return startSaving();

    container.append(el('p.dim.small', {}, `Item ${state.cursor + 1} of ${state.lines.length}`));

    const name = el('input', {
      value: line.resolvedName ?? (line.suggestedName || line.name),
      placeholder: 'Canonical name (e.g. lactose-free milk)',
      oninput: () => { clearTimeout(name._t); name._t = setTimeout(() => { drawMatches(); }, 200); },
    });
    const brand = el('input', { value: line.brand || '', placeholder: 'Brand (optional)' });
    const catSel = select(
      [{ value: '', label: '— pick category —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
      line.categoryId || '',
    );
    const size = el('input', { value: line.size, inputmode: 'decimal' });
    const unitSel = select(UNITS.map((u) => ({ value: u, label: u })), line.unit);
    const price = el('input', { value: line.totalMinor != null ? (line.totalMinor / 100).toFixed(2) : '', inputmode: 'decimal', placeholder: '0.00' });
    const qty = el('input', { value: line.quantity, type: 'number', min: 1 });
    const typeSel = select(repo.PRICE_TYPES.map((t) => ({ value: t, label: t })), line.price_type);

    let chosenProduct = line.productId ? products.find((p) => p.id === line.productId) : null;

    const matchBox = el('div.stack');
    function drawMatches() {
      // receipt text and the live name input both feed the matcher
      const queryName = [line.name, name.value].filter(Boolean).join(' ').trim();
      const matches = queryName ? findMatches({ name: queryName }, products) : [];
      matchBox.innerHTML = '';
      if (chosenProduct) {
        matchBox.append(el('div.card', {},
          el('div.spread', {},
            el('div', {}, '✓ Same as ', el('strong', {}, chosenProduct.name)),
            el('button.btn-sm', { onclick: () => { chosenProduct = null; drawMatches(); toggleNewProduct(); } }, 'Undo'),
          ),
        ));
      } else if (matches.length) {
        matchBox.append(el('p.small.dim', {}, 'Same as a previous item?'));
        for (const m of matches) {
          matchBox.append(el('div.card', {},
            el('div.spread', {},
              el('div', {},
                el('div', {}, m.product.name),
                el('div.small.dim', {}, Math.round(m.score * 100) + '% match'),
              ),
              el('button.btn-sm.btn-primary', {
                onclick: () => { chosenProduct = m.product; drawMatches(); toggleNewProduct(); },
              }, 'Yes, same'),
            ),
          ));
        }
      }
    }

    const newProductFields = el('div.stack', {},
      field('Item name', name),
      el('div.field-row', {}, field('Brand', brand), field('Category', catSel)),
    );
    function toggleNewProduct() {
      newProductFields.style.display = chosenProduct ? 'none' : '';
    }
    drawMatches();
    toggleNewProduct();

    container.append(
      line.rawText ? el('p.small.dim', {}, 'Receipt text: ', el('em', {}, line.rawText)) : null,
      matchBox,
      el('div.card.stack.mt', {},
        newProductFields,
        el('div.field-row', {}, field('Size', size), field('Unit', unitSel)),
        el('div.field-row', {}, field(`Total price (${state.meta.currency})`, price), field('Quantity', qty)),
        field('Price type', typeSel),
      ),
      el('div.row.mt', {},
        el('button.btn-ghost', {
          onclick: () => {
            if (state.cursor === 0) go(manual ? 'META_CONFIRM' : 'LINE_REVIEW');
            else { state.cursor--; draw(); }
          },
        }, 'Back'),
        state.lines.length > 1 ? el('button.btn-ghost', {
          onclick: () => { line.skipped = true; state.cursor++; draw(); },
        }, 'Skip') : null,
        el('button.btn-primary.grow', {
          onclick: () => {
            const p = parsePrice(price.value);
            if (!p) return toast('Enter the price', 'bad');
            if (!chosenProduct && !name.value.trim()) return toast('Enter an item name', 'bad');
            if (!chosenProduct && !catSel.value) return toast('Pick a category — it powers substitute comparisons', 'bad');
            const sz = Number(String(size.value).replace(',', '.'));
            if (!Number.isFinite(sz) || sz <= 0) return toast('Size must be greater than zero', 'bad');
            line.resolution = {
              product: chosenProduct ? { id: chosenProduct.id } : {
                name: name.value.trim(), brand: brand.value.trim(), categoryId: catSel.value,
              },
              pkg: { size: sz, unit: unitSel.value },
              obs: {
                storeId: state.meta.storeId,
                total_price: p.minor,
                currency: p.currency || state.meta.currency,
                quantity: Number(qty.value) || 1,
                price_type: typeSel.value,
                date: state.meta.date || today(),
              },
            };
            line.skipped = false;
            state.cursor++;
            draw();
          },
        }, state.cursor + 1 < state.lines.length ? 'Save & next' : 'Save all'),
      ),
    );
  }

  /* ---------- SAVING / DONE ---------- */

  async function startSaving() {
    state.step = 'SAVING';
    draw();
    for (const line of state.lines) {
      if (!line.resolution || line.skipped) continue;
      try {
        const obs = await repo.saveEntry(line.resolution);
        state.saved.push(obs);
        // refresh in-memory products so later lines can match items created earlier
        const prod = await repo.getProduct(obs.productId);
        if (prod && !products.find((p) => p.id === prod.id)) products.push(prod);
      } catch (err) {
        state.failed.push({ line, error: err.message });
      }
    }
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    go('DONE');
  }

  function drawSaving() {
    container.append(el('div.card', {}, el('p', {}, 'Saving…'), el('progress', {})));
  }

  function drawDone() {
    const pending = state.saved.filter((o) => o.fx && o.fx.status === 'pending').length;
    container.append(
      el('div.card.stack', {},
        el('p', {}, `✓ Saved ${state.saved.length} price observation${state.saved.length === 1 ? '' : 's'}.`),
        pending ? el('p.small', {}, el('span.badge.warn', {}, `${pending} waiting for FX rates`), ' — they will backfill automatically when online.') : null,
        state.failed.length ? el('div', {},
          el('p', {}, `⚠ ${state.failed.length} line(s) failed validation:`),
          el('ul', {}, state.failed.map((f) => el('li.small', {}, `${f.line.name || 'unnamed'}: ${f.error}`))),
        ) : null,
      ),
      el('div.stack.mt', {},
        el('a.btn.btn-primary.btn-block', { href: '#/search' }, 'Done'),
        el('button.btn.btn-block', {
          onclick: () => { container.innerHTML = ''; runWizard(container, { manual }); },
        }, manual ? 'Add another item' : 'Scan another receipt'),
      ),
    );
  }

  draw();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
