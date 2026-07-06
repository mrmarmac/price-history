import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistenceMessage } from '../js/storage.js';

test('granted persistence → no warning', () => {
  assert.equal(persistenceMessage({ supported: true, persisted: true }), null);
});

test('denied persistence → warns about eviction and nudges backup', () => {
  const msg = persistenceMessage({ supported: true, persisted: false });
  assert.ok(msg && /evict|persist/i.test(msg), msg);
  assert.ok(/backup/i.test(msg), msg);
});

test('unsupported → warns to back up regularly', () => {
  const msg = persistenceMessage({ supported: false, persisted: false });
  assert.ok(msg && /backup/i.test(msg), msg);
});
