import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUnitPrice, comparable, toReferenceQuantity, dimension } from '../js/units.js';

test('unit price for 500g at 2,99 → per kg', () => {
  const r = computeUnitPrice(299, 500, 'g');
  assert.equal(r.unit_price, 598);
  assert.equal(r.reference_unit, 'kg');
  assert.equal(r.reference_quantity, 1);
});

test('unit price for 1l milk', () => {
  const r = computeUnitPrice(229, 1, 'l');
  assert.equal(r.unit_price, 229);
  assert.equal(r.reference_unit, 'l');
});

test('unit price for weighed goods (0.234 kg apples at 0,70 total)', () => {
  const r = computeUnitPrice(70, 0.234, 'kg');
  assert.equal(r.unit_price, 299); // ≈ the printed 2,99 EUR/kg
});

test('unit price for multi-pack (2 × 0,39 rolls)', () => {
  const r = computeUnitPrice(78, 1, 'pcs', 2);
  assert.equal(r.unit_price, 39);
  assert.equal(r.reference_unit, 'pcs');
});

test('rejects zero or negative size', () => {
  assert.equal(computeUnitPrice(100, 0, 'g'), null);
  assert.equal(computeUnitPrice(100, -5, 'g'), null);
});

test('mass and volume are never comparable, conversions within dimension are', () => {
  assert.equal(comparable('g', 'kg'), true);
  assert.equal(comparable('ml', 'l'), true);
  assert.equal(comparable('g', 'ml'), false);
  assert.equal(comparable('kg', 'pcs'), false);
});

test('reference conversion', () => {
  assert.equal(toReferenceQuantity(500, 'g'), 0.5);
  assert.equal(toReferenceQuantity(330, 'ml'), 0.33);
  assert.equal(dimension('kg'), 'mass');
});
