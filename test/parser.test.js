import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt } from '../js/parser.js';
import * as fx from './fixtures/receipts.js';

const STORES = [
  { id: 'store-rewe-de', name: 'REWE', country: 'DE', currency_default: 'EUR' },
  { id: 'store-edeka-de', name: 'Edeka', country: 'DE', currency_default: 'EUR' },
  { id: 'store-tesco-uk', name: 'Tesco Superstore', country: 'UK', currency_default: 'GBP' },
];

const byName = (lines, frag) =>
  lines.find((l) => l.name.toLowerCase().includes(frag.toLowerCase()));

test('REWE: weighed apples, wrapped name, multi-unit rolls', () => {
  const r = parseReceipt(fx.REWE_WEIGHED_AND_MULTI, { stores: STORES });

  assert.equal(r.storeGuess?.id, 'store-rewe-de');
  assert.equal(r.dateISO, '2026-02-23');
  assert.equal(r.currencyGuess, 'EUR');

  // weighed: APFEL GALA 0,234 kg x 2,99 EUR/kg = 0,70
  const apples = byName(r.lines, 'apfel');
  assert.ok(apples, 'apples line found');
  assert.equal(apples.price_type, 'weighted');
  assert.equal(apples.totalMinor, 70);
  assert.equal(apples.size, 0.234);
  assert.equal(apples.unit, 'kg');
  assert.equal(apples.perItemMinor, 299);
  assert.equal(apples.suggestedName, 'apple gala');

  // wrapped name: FRANKENDAMMER + SESAMRING SIMIT 2,59
  const simit = byName(r.lines, 'simit');
  assert.ok(simit, 'simit line found');
  assert.equal(simit.totalMinor, 259);
  assert.ok(simit.name.toLowerCase().includes('frankendammer'));

  // multi-unit: ROGGEN KUMPEL 2 Stk x 0,39 = 0,78
  const rolls = byName(r.lines, 'roggen');
  assert.ok(rolls, 'rolls line found');
  assert.equal(rolls.price_type, 'per_unit');
  assert.equal(rolls.quantity, 2);
  assert.equal(rolls.perItemMinor, 39);
  assert.equal(rolls.totalMinor, 78);

  // plain items
  assert.equal(byName(r.lines, 'edelbitter').totalMinor, 175);
  assert.equal(byName(r.lines, 'clement').totalMinor, 229);

  // totals / payment / footer never become items
  assert.equal(byName(r.lines, 'summe'), undefined);
  assert.equal(byName(r.lines, 'mastercard'), undefined);
});

test('REWE: Frischerabatt discount attaches to preceding item as promo', () => {
  const r = parseReceipt(fx.REWE_DISCOUNT, { stores: STORES });

  const knacker = byName(r.lines, 'knacker');
  assert.ok(knacker, 'knacker line found');
  assert.equal(knacker.price_type, 'promo');
  assert.equal(knacker.discountMinor, -99);
  assert.equal(knacker.totalMinor, 329 - 99); // effective price after discount

  // weight breakdown without its own total attaches to the banana item line
  const bananas = byName(r.lines, 'banane');
  assert.equal(bananas.price_type, 'weighted');
  assert.equal(bananas.totalMinor, 127);
  assert.equal(bananas.size, 0.986);

  // qty breakdown without total: 2 Stk x 0,99 on PROTEINMOUSSE 1,98
  const mousse = byName(r.lines, 'proteinmousse');
  assert.equal(mousse.quantity, 2);
  assert.equal(mousse.totalMinor, 198);

  // dictionary suggestions
  assert.equal(byName(r.lines, 'laktosefr').suggestedName, 'lactose-free milk');
});

test('EDEKA: plain items incl. Pfand deposit, umlauts survive', () => {
  const r = parseReceipt(fx.EDEKA_SIMPLE, { stores: STORES });
  assert.equal(r.storeGuess?.id, 'store-edeka-de');

  assert.equal(byName(r.lines, 'eier').totalMinor, 399);
  assert.equal(byName(r.lines, 'olivenöl').totalMinor, 599);
  assert.equal(byName(r.lines, 'pfand').totalMinor, 25);
  assert.equal(byName(r.lines, 'möhren').totalMinor, 179);
  assert.equal(byName(r.lines, 'möhren').suggestedName, 'ehl carrots');
  // "Posten: 16" and SUMME are noise
  assert.equal(byName(r.lines, 'posten'), undefined);
});

test('date extraction is OCR-tolerant and prefers labelled/footer dates', () => {
  const parse = (text) => parseReceipt(text, { stores: STORES }).dateISO;

  // OCR spacing and separator variants
  assert.equal(parse('MILCH 2,29 B\nDatum: 21 . 02 . 2026'), '2026-02-21');
  assert.equal(parse('MILCH 2,29 B\nDatum: 21-02-2026'), '2026-02-21');
  assert.equal(parse('MILCH 2,29 B\n2026-02-21'), '2026-02-21');

  // date on its own line (label printed on the next line, common OCR split)
  assert.equal(parse('MILCH 2,29 B\n21.02.2026\nDatum:'), '2026-02-21');

  // a best-before date in the future is not the receipt date
  assert.equal(parse('HALTBAR BIS 01.01.2099\nMILCH 2,29 B\nDatum: 21.02.2026'), '2026-02-21');

  // labelled date beats unlabelled candidates elsewhere on the receipt
  assert.equal(parse('GEDRUCKT 20.02.2026\nDatum: 21.02.2026'), '2026-02-21');

  // no date at all → null (the wizard falls back to scan date and warns)
  assert.equal(parse('MILCH 2,29 B\nSUMME EUR 2,29'), null);

  // times never become dates
  assert.equal(parse('MILCH 2,29 B\nUhrzeit: 09:18:27 Uhr'), null);
});

test('Tesco: multi-buy bundle, Clubcard discount, weighed bananas, UK date', () => {
  const r = parseReceipt(fx.TESCO_MULTIBUY, { stores: STORES });

  assert.equal(r.storeGuess?.id, 'store-tesco-uk');
  assert.equal(r.currencyGuess, 'GBP');
  assert.equal(r.dateISO, '2026-05-02'); // 02/05/2026 is day-first

  // "2 Tesco Finest ... £5.80" + "£2.90 each" + "Cc Any 2 For £5 -£0.80"
  const eggs = byName(r.lines, 'finest free range');
  assert.ok(eggs, 'eggs line found');
  assert.equal(eggs.quantity, 2);
  assert.equal(eggs.discountMinor, -80);
  assert.equal(eggs.totalMinor, 580 - 80);
  assert.equal(eggs.price_type, 'promo'); // bundle + attached discount → promo
  assert.equal(eggs.perItemMinor, 290);

  // single item with Clubcard discount
  const butter = byName(r.lines, 'anchor');
  assert.equal(butter.totalMinor, 260 - 90);
  assert.equal(butter.price_type, 'promo');

  // weighed bananas: item line first, weight detail after
  const bananas = byName(r.lines, 'bananas loose');
  assert.equal(bananas.price_type, 'weighted');
  assert.equal(bananas.totalMinor, 91);
  assert.equal(bananas.size, 1.015);
  assert.equal(bananas.unit, 'kg');
  assert.equal(bananas.perItemMinor, 90);

  // undiscounted singles
  assert.equal(byName(r.lines, 'dates').totalMinor, 180);

  // summary lines never become items
  assert.equal(byName(r.lines, 'subtotal'), undefined);
  assert.equal(byName(r.lines, 'savings'), undefined);
});
