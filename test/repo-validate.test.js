import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateObservation } from '../js/repo.js';

const base = {
  storeId: 'store-tesco-uk', currency: 'GBP', total_price: 170,
  quantity: 1, size: 200, unit: 'g', price_type: 'promo', date: '2026-05-02',
};

test('valid observation passes', () => {
  assert.deepEqual(validateObservation(base), []);
});

test('full_price may be absent (null/undefined)', () => {
  assert.deepEqual(validateObservation({ ...base, full_price: null }), []);
  assert.deepEqual(validateObservation({ ...base }), []);
});

test('full_price >= total_price is allowed (a saving)', () => {
  assert.deepEqual(validateObservation({ ...base, full_price: 260 }), []);
  assert.deepEqual(validateObservation({ ...base, full_price: 170 }), []); // equal = no saving
});

test('full_price below total_price is rejected (cannot be cheaper than paid)', () => {
  const errs = validateObservation({ ...base, full_price: 100 });
  assert.ok(errs.some((e) => /full price/i.test(e)), errs.join('; '));
});

test('non-integer full_price is rejected', () => {
  const errs = validateObservation({ ...base, full_price: 1.5 });
  assert.ok(errs.length > 0);
});
