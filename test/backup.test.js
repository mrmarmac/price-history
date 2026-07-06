import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, validateBackup, BACKUP_VERSION } from '../js/backup.js';

const sample = {
  stores: [{ id: 's1', name: 'REWE', country: 'DE', currency_default: 'EUR' }],
  categories: [{ id: 'c1', name: 'drinks' }],
  products: [{ id: 'p1', name: 'milk', nameNormalized: 'milk', tokens: ['milk'], categoryId: 'c1' }],
  packages: [{ id: 'k1', productId: 'p1', size: 1, unit: 'l' }],
  observations: [{ id: 'o1', productId: 'p1', packageId: 'k1', total_price: 229, currency: 'EUR', date: '2026-02-23' }],
  meta: [{ key: 'displayCurrency', value: 'GBP' }],
};

test('serializeBackup tags app + version and nests all stores', () => {
  const b = serializeBackup(sample, '2026-06-13T00:00:00.000Z');
  assert.equal(b.app, 'price-history');
  assert.equal(b.version, BACKUP_VERSION);
  assert.equal(b.exportedAt, '2026-06-13T00:00:00.000Z');
  assert.deepEqual(b.data.observations, sample.observations);
  assert.deepEqual(b.data.stores, sample.stores);
});

test('serialize → validate round trip is ok', () => {
  const b = serializeBackup(sample, '2026-06-13T00:00:00.000Z');
  const v = validateBackup(b);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.deepEqual(v.errors, []);
});

test('validateBackup rejects a non-object', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup('nope').ok, false);
  assert.equal(validateBackup(42).ok, false);
});

test('validateBackup rejects a wrong app tag', () => {
  const b = serializeBackup(sample, 't');
  b.app = 'something-else';
  const v = validateBackup(b);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /app/i.test(e)));
});

test('validateBackup rejects an unsupported version', () => {
  const b = serializeBackup(sample, 't');
  b.version = 999;
  const v = validateBackup(b);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /version/i.test(e)));
});

test('validateBackup rejects missing data arrays', () => {
  const b = serializeBackup(sample, 't');
  delete b.data.observations;
  const v = validateBackup(b);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /observations/i.test(e)));
});

test('validateBackup rejects a data collection that is not an array', () => {
  const b = serializeBackup(sample, 't');
  b.data.products = { not: 'an array' };
  assert.equal(validateBackup(b).ok, false);
});
