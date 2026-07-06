/* Add-receipt wizard. Steps:
 *   CAPTURE → OCR_RUNNING → META_CONFIRM → LINE_REVIEW → MATCH_CONFIRM → SAVING → DONE
 * Manual entry (Flow B) runs the SAME wizard starting at META_CONFIRM with
 * one empty line — one data path for both flows.
 * The draft lives in memory only; the photo is never persisted. */

import { el, field, select, toast, priceText } from './components.js';
import * as repo from '../repo.js';
import * as db from '../db.js';
import { parseReceipt } from '../parser.js';
import { recognizeReceipt } from '../ocr.js';
import { parsePrice, formatMinor, roundMinor } from '../money.js';
import { UNITS, toReferenceQuantity, referenceUnitFor, computeUnitPrice } from '../units.js';
import { findMatches } from '../match.js';
import { suggestEnglishName } from '../dictionary.js';

const STEPS = ['CAPTURE', 'META_CONFIRM', 'LINE_REVIEW', 'MATCH_CONFIRM', 'DONE'];

export async function render(container) {
  return runWizard(container, { manual: false });
}

export async function runWizard(container, { manual }) {
  const stores = (await repo.listStores()).sort((a, b) => a.name.localeCompare(b.name));
  const categories = await repo.listCategories();
  const products = await repo.listProducts();

  // default to the store used last time
  const lastStoreId = (await db.get('meta', 'lastStoreId'))?.value;
  const defaultStore = stores.find((s) => s.id === lastStoreId) || stores[0] || null;

  const state = {
    step: manual ? 'META_CONFIRM' : 'CAPTURE',
    meta: { storeId: defaultStore?.id || null, date: today(), currency: defaultStore?.currency_default || 'EUR' },
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
      state.meta.dateFromReceipt = !!parsed.dateISO;
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
    const dateNote = manual
      ? el('p.small.dim', {}, 'If the receipt has no date, the scan date (today) is used.')
      : state.meta.dateFromReceipt
        ? el('p.small', {}, el('span.badge.good', {}, '✓ Date read from receipt'))
        : el('p.small', {},
            el('span.badge.warn', {}, '⚠ No date found on the receipt'),
            el('span.dim', {}, " — today's date is prefilled, please check it."));
    container.append(
      el('div.card.stack', {},
        field('Store', storeSel),
        el('div.field-row', {}, field('Receipt date', dateInput), field('Currency', curSel)),
        dateNote,
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

    const pricing = pricingCard(line, state.meta.currency);

    if (line.rawText) {
      container.append(el('p.small.dim', {}, 'Receipt text: ', el('em', {}, line.rawText)));
    }
    container.append(
      matchBox,
      el('div.card.stack.mt', {}, newProductFields),
      pricing.node,
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
            if (!chosenProduct && !name.value.trim()) return toast('Enter an item name', 'bad');
            if (!chosenProduct && !catSel.value) return toast('Pick a category — it powers substitute comparisons', 'bad');
            const result = pricing.read();
            if (result.error) return toast(result.error, 'bad');
            line.resolution = {
              product: chosenProduct ? { id: chosenProduct.id } : {
                name: name.value.trim(), brand: brand.value.trim(), categoryId: catSel.value,
              },
              pkg: result.pkg,
              obs: {
                storeId: state.meta.storeId,
                total_price: result.totalMinor,
                full_price: result.full_price ?? null,
                currency: state.meta.currency,
                quantity: result.quantity,
                price_type: (line.discountMinor || result.full_price) ? 'promo' : result.price_type,
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

  /* ---------- pricing card: "How did you buy it?" ----------
   * Three plain-language modes instead of raw size/qty/price_type fields:
   *   pack     — a shelf-priced item or pack (200 g butter, carton of 6 eggs)
   *   weighed  — priced by weight/volume at the till (1.015 kg bananas @ 0.90/kg)
   *   multibuy — one deal price across several items ("any 2 for £5")
   */
  function pricingCard(line, currency) {
    const initialMode =
      (line.price_type === 'weighted' || line.price_type === 'per_weight') ? 'weighed'
      : (line.price_type === 'bundle' || (line.price_type === 'per_unit' && line.quantity > 1)) ? 'multibuy'
      : 'pack';
    let mode = initialMode;

    const moneyVal = (minor) => (minor != null ? (minor / 100).toFixed(2) : '');
    const num = (input) => {
      const v = Number(String(input.value).trim().replace(',', '.'));
      return Number.isFinite(v) ? v : null;
    };

    /* shared inputs, prefilled from the parsed line */
    const packSize = el('input', { value: line.unit === 'pcs' && line.size === 1 ? 1 : line.size, inputmode: 'decimal' });
    const packUnit = select(UNITS.map((u) => ({ value: u, label: u })), line.unit);
    const packTotal = el('input', { value: moneyVal(line.totalMinor), inputmode: 'decimal', placeholder: '0.00' });
    const packCount = el('input', { value: 1, type: 'number', min: 1 });

    const weighedQty = el('input', { value: line.price_type === 'weighted' ? line.size : '', inputmode: 'decimal', placeholder: '1.015' });
    const weighedUnit = select(['kg', 'g', 'l', 'ml'].map((u) => ({ value: u, label: u })), ['kg', 'g', 'l', 'ml'].includes(line.unit) ? line.unit : 'kg');
    const weighedPer = el('input', { value: moneyVal(line.perItemMinor), inputmode: 'decimal', placeholder: '0.90' });
    const weighedTotal = el('input', { value: moneyVal(line.totalMinor), inputmode: 'decimal', placeholder: '0.91' });

    const dealCount = el('input', { value: Math.max(line.quantity, 2), type: 'number', min: 2 });
    const dealSize = el('input', { value: line.size, inputmode: 'decimal' });
    const dealUnit = select(UNITS.map((u) => ({ value: u, label: u })), line.unit);
    const dealTotal = el('input', { value: moneyVal(line.totalMinor), inputmode: 'decimal', placeholder: '5.00' });

    // optional full (non-loyalty / pre-offer) price — e.g. Tesco Clubcard,
    // where the shelf price differs from what a member pays.
    const fullPrice = el('input', { value: moneyVal(line.fullMinor), inputmode: 'decimal', placeholder: 'optional' });

    /* weighed mode: per-unit price ⇄ total stay in sync */
    function syncWeighed(from) {
      const qty = num(weighedQty);
      const unit = weighedUnit.value;
      const ref = qty ? toReferenceQuantity(qty, unit) : null;
      if (!ref) return;
      if (from !== 'total') {
        const per = parsePrice(weighedPer.value);
        if (per) weighedTotal.value = ((per.minor * ref) / 100).toFixed(2);
      } else {
        const total = parsePrice(weighedTotal.value);
        if (total) weighedPer.value = ((total.minor / ref) / 100).toFixed(2);
      }
      updatePreview();
    }
    weighedQty.addEventListener('input', () => syncWeighed('qty'));
    weighedUnit.addEventListener('change', () => syncWeighed('qty'));
    weighedPer.addEventListener('input', () => syncWeighed('per'));
    weighedTotal.addEventListener('input', () => syncWeighed('total'));
    for (const i of [packSize, packTotal, packCount, dealCount, dealSize, dealTotal, fullPrice]) {
      i.addEventListener('input', updatePreview);
    }
    for (const s of [packUnit, dealUnit]) s.addEventListener('change', updatePreview);

    const HELP = {
      pack: 'A shelf-priced item or pack — e.g. a 200 g butter block, a carton of 6 eggs, a 1 l milk.',
      weighed: 'Priced by weight at the till — e.g. 1.015 kg of bananas at 0.90 per kg. Enter either the per-kg price or the total; the other fills in.',
      multibuy: 'One deal price for several items — e.g. two 6-packs of eggs, any 2 for £5.',
    };

    const body = el('div.stack');
    const help = el('p.small.dim', { style: 'margin:0' });
    const preview = el('p.small', { style: 'margin:0' });

    const tabs = el('div.segmented', {},
      ['pack', 'weighed', 'multibuy'].map((m) =>
        el('button.seg' + (m === mode ? '.active' : ''), {
          type: 'button',
          dataset: { mode: m },
          onclick: (ev) => {
            mode = m;
            tabs.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
            drawBody();
          },
        }, { pack: 'Pack / item', weighed: 'Weighed', multibuy: 'Multi-buy deal' }[m])),
    );

    function drawBody() {
      help.textContent = HELP[mode];
      body.innerHTML = '';
      if (mode === 'pack') {
        body.append(
          el('div.field-row', {}, field('Pack size', packSize), field('Unit', packUnit)),
          el('div.field-row', {}, field(`Total paid (${currency})`, packTotal), field('Packs bought', packCount)),
          field(`Full price before offer (${currency})`, fullPrice),
        );
      } else if (mode === 'weighed') {
        body.append(
          el('div.field-row', {}, field('Weight / volume', weighedQty), field('Unit', weighedUnit)),
          el('div.field-row', {},
            field(`Price per ${referenceUnitFor(weighedUnit.value) || 'kg'} (${currency})`, weighedPer),
            field(`Total paid (${currency})`, weighedTotal)),
        );
      } else {
        body.append(
          el('div.field-row', {}, field('Items in deal', dealCount), field('Size of one item', el('div.field-row', {}, dealSize, dealUnit))),
          field(`Deal total paid (${currency})`, dealTotal),
          field(`Full price before offer (${currency})`, fullPrice),
        );
      }
      updatePreview();
    }

    /* the optional full price, only when it is set and >= paid */
    function readFull(paidMinor) {
      const f = parsePrice(fullPrice.value);
      if (!f || f.minor <= 0) return null;
      if (f.minor < paidMinor) return { error: 'Full price cannot be below the price paid' };
      return { minor: f.minor };
    }

    /* read() → {pkg, totalMinor, quantity, price_type, full_price} or {error} */
    function read() {
      if (mode === 'pack') {
        const size = num(packSize);
        const total = parsePrice(packTotal.value);
        const count = Math.max(1, Math.round(num(packCount) ?? 1));
        if (!size || size <= 0) return { error: 'Pack size must be greater than zero' };
        if (!total || total.minor <= 0) return { error: 'Enter the total you paid' };
        const full = readFull(total.minor);
        if (full && full.error) return { error: full.error };
        return {
          pkg: { size, unit: packUnit.value },
          totalMinor: total.minor,
          quantity: count,
          price_type: count > 1 ? 'per_unit' : 'single',
          full_price: full ? full.minor : null,
        };
      }
      if (mode === 'weighed') {
        const qty = num(weighedQty);
        const total = parsePrice(weighedTotal.value);
        if (!qty || qty <= 0) return { error: 'Enter the weight or volume' };
        if (!total || total.minor <= 0) return { error: 'Enter the per-unit price or the total — the other fills in' };
        return {
          pkg: { size: qty, unit: weighedUnit.value },
          totalMinor: total.minor,
          quantity: 1,
          price_type: 'weighted',
        };
      }
      const count = Math.max(2, Math.round(num(dealCount) ?? 2));
      const size = num(dealSize);
      const total = parsePrice(dealTotal.value);
      if (!size || size <= 0) return { error: 'Enter the size of one item' };
      if (!total || total.minor <= 0) return { error: 'Enter the deal total' };
      const full = readFull(total.minor);
      if (full && full.error) return { error: full.error };
      return {
        pkg: { size, unit: dealUnit.value },
        totalMinor: total.minor,
        quantity: count,
        price_type: 'bundle',
        full_price: full ? full.minor : null,
      };
    }

    function updatePreview() {
      preview.innerHTML = '';
      const r = read();
      if (r.error) return;
      const parts = [];
      if (r.quantity > 1) {
        parts.push(`${formatMinor(roundMinor(r.totalMinor / r.quantity), currency)} each`);
      }
      const up = computeUnitPrice(r.totalMinor, r.pkg.size, r.pkg.unit, r.quantity);
      if (up) parts.push(`${formatMinor(up.unit_price, currency)} / ${up.reference_unit}`);
      if (parts.length) preview.append(el('span.badge.good', {}, '= ' + parts.join(' · ')));
      if (r.full_price && r.full_price > r.totalMinor) {
        preview.append(' ', el('span.badge.warn', {},
          `save ${formatMinor(r.full_price - r.totalMinor, currency)}`));
      }
    }

    drawBody();
    const node = el('div.card.stack.mt', {},
      el('label', { style: 'margin:0' }, 'How did you buy it?'),
      tabs, help, body, preview,
    );
    return { node, read };
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
    if (state.saved.length) {
      await db.put('meta', { key: 'lastStoreId', value: state.meta.storeId }).catch(() => {});
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
