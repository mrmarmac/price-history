import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRates, computeEquivalents, buildFxBlock } from '../js/fx.js';

const API_RESPONSE = {
  amount: 1, base: 'EUR', date: '2026-02-23',
  rates: { AUD: 1.7, GBP: 0.85 },
};

test('derives cross rates from EUR-base response', () => {
  const r = deriveRates(API_RESPONSE);
  assert.equal(r.rate_date, '2026-02-23');
  assert.equal(r.EUR_GBP, 0.85);
  assert.equal(r.EUR_AUD, 1.7);
  assert.equal(r.AUD_GBP, 0.5);
  assert.equal(r.AUD_EUR, Math.round(1e6 / 1.7) / 1e6);
});

test('EUR observation: identity copied exactly, others rounded once', () => {
  const r = deriveRates(API_RESPONSE);
  const eq = computeEquivalents(299, 'EUR', r);
  assert.equal(eq.equivalent_eur, 299);
  assert.equal(eq.equivalent_gbp, 254); // 299*0.85 = 254.15 → 254
  assert.equal(eq.equivalent_aud, 508); // 299*1.7 = 508.3 → 508
});

test('GBP observation converts through EUR rates', () => {
  const r = deriveRates(API_RESPONSE);
  const eq = computeEquivalents(580, 'GBP', r);
  assert.equal(eq.equivalent_gbp, 580);
  assert.equal(eq.equivalent_eur, 682); // 580/0.85 = 682.35… → 682
  assert.equal(eq.equivalent_aud, 1160); // 580*2 = 1160
});

test('AUD observation converts through EUR rates', () => {
  const r = deriveRates(API_RESPONSE);
  const eq = computeEquivalents(1700, 'AUD', r);
  assert.equal(eq.equivalent_aud, 1700);
  assert.equal(eq.equivalent_eur, 1000);
  assert.equal(eq.equivalent_gbp, 850);
});

test('determinism: same rate input always yields identical equivalents (backfill ≡ online save)', () => {
  const r = deriveRates(API_RESPONSE);
  const a = computeEquivalents(2423, 'EUR', r);
  const b = computeEquivalents(2423, 'EUR', deriveRates(API_RESPONSE));
  assert.deepEqual(a, b);
});

test('buildFxBlock done vs pending', () => {
  const done = buildFxBlock(299, 'EUR', deriveRates(API_RESPONSE));
  assert.equal(done.status, 'done');
  assert.equal(done.rate_date, '2026-02-23');
  assert.equal(done.rates.EUR_GBP, 0.85);
  assert.equal(done.equivalent_gbp, 254);

  const pending = buildFxBlock(299, 'EUR', null);
  assert.deepEqual(pending, { status: 'pending' });
});

test('weekend receipt: rate_date records the API-returned working day', () => {
  const weekend = { ...API_RESPONSE, date: '2026-02-20' }; // ECB returned Friday
  const block = buildFxBlock(100, 'EUR', deriveRates(weekend));
  assert.equal(block.rate_date, '2026-02-20');
});
