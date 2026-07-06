import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRelevance, rankProducts } from '../js/search.js';
import { normalizeName, tokenize } from '../js/normalize.js';

/* build a product the way repo.saveProduct does, so tokens/nameNormalized
 * line up with production data */
function product(id, name, extraTokens = []) {
  return {
    id,
    name,
    nameNormalized: normalizeName(name),
    tokens: [...new Set([...tokenize(name), ...extraTokens])],
  };
}

test('relevance tiers: exact > prefix > token > fuzzy > none', () => {
  const exact = scoreRelevance(product('1', 'whole milk'), 'whole milk');
  const prefix = scoreRelevance(product('2', 'whole milk 1L'), 'whole milk');
  const token = scoreRelevance(product('3', 'organic milk drink'), 'milk');
  const none = scoreRelevance(product('4', 'irish butter'), 'milk');
  assert.ok(exact > prefix, `exact ${exact} > prefix ${prefix}`);
  assert.ok(prefix > token, `prefix ${prefix} > token ${token}`);
  assert.ok(token > none, `token ${token} > none ${none}`);
  assert.equal(none, 0);
});

test('empty query scores 0 for everything', () => {
  assert.equal(scoreRelevance(product('1', 'whole milk'), ''), 0);
});

test('rankProducts orders by relevance, then recency, then name', () => {
  const products = [
    product('a', 'irish butter'),
    product('b', 'whole milk'),
    product('c', 'whole milk 1L'),
  ];
  const meta = {
    a: { latestDate: '2026-05-01' },
    b: { latestDate: '2026-01-01' },
    c: { latestDate: '2026-06-01' },
  };
  const ranked = rankProducts(products, 'whole milk', meta).map((p) => p.id);
  // exact "whole milk" (b) first despite older date; then prefix (c); butter last
  assert.deepEqual(ranked, ['b', 'c', 'a']);
});

test('equal relevance falls back to most-recent observation first', () => {
  const products = [product('old', 'milk one'), product('new', 'milk two')];
  const meta = { old: { latestDate: '2025-01-01' }, new: { latestDate: '2026-06-01' } };
  // both are token matches for "milk" (equal relevance) → recency decides
  const ranked = rankProducts(products, 'milk', meta).map((p) => p.id);
  assert.deepEqual(ranked, ['new', 'old']);
});

test('empty query ranks purely by recency then name', () => {
  const products = [
    product('a', 'apples'),
    product('b', 'bananas'),
    product('c', 'cherries'),
  ];
  const meta = {
    a: { latestDate: '2026-01-01' },
    b: { latestDate: '2026-06-01' },
    c: {},
  };
  const ranked = rankProducts(products, '', meta).map((p) => p.id);
  // b (Jun) > a (Jan) > c (no observations, sorts last, then name)
  assert.deepEqual(ranked, ['b', 'a', 'c']);
});
