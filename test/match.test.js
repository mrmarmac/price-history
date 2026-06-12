import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, findMatches } from '../js/match.js';
import { suggestEnglishName, translateTokens } from '../js/dictionary.js';
import { tokenize, normalizeName, diceSimilarity } from '../js/normalize.js';

const PRODUCTS = [
  { id: '1', name: 'lactose-free milk', brand: '', tokens: ['lactose', 'free', 'milk'] },
  { id: '2', name: 'whole milk', brand: '', tokens: ['whole', 'milk'] },
  { id: '3', name: 'irish butter', brand: 'Kerrygold', tokens: ['irish', 'butter', 'kerrygold'] },
  { id: '4', name: 'rye bread', brand: '', tokens: ['rye', 'bread'] },
];

test('German receipt name matches English canonical product via dictionary tokens', () => {
  const matches = findMatches({ name: 'LAKTOSEFR MILCH' }, PRODUCTS);
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].product.id, '1');
});

test('exact same name scores ~1', () => {
  assert.ok(scoreMatch({ name: 'irish butter' }, PRODUCTS[2]) > 0.9);
});

test('unrelated names do not match', () => {
  const matches = findMatches({ name: 'EDELBITTER 72%' }, PRODUCTS);
  assert.equal(matches.length, 0);
});

test('IRISCHE BUTTER matches irish butter', () => {
  const matches = findMatches({ name: 'IRISCHE BUTTER' }, PRODUCTS);
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].product.id, '3');
});

test('normalizeName transliterates umlauts', () => {
  assert.equal(normalizeName('Möhren'), 'moehren');
  assert.equal(normalizeName('Olivenöl'), 'olivenoel');
  assert.equal(normalizeName('Straße 50!'), 'strasse 50');
});

test('tokenize drops short tokens and pure numbers', () => {
  assert.deepEqual(tokenize('G&G Eier 10ST'), ['eier', '10st']);
  assert.deepEqual(tokenize('EDELBITTER 72%'), ['edelbitter', '72%']);
});

test('diceSimilarity basics', () => {
  assert.equal(diceSimilarity('milk', 'milk'), 1);
  assert.ok(diceSimilarity('milch', 'milk') > 0.3);
  assert.ok(diceSimilarity('butter', 'wurst') < 0.3);
});

test('dictionary suggests English names word by word', () => {
  assert.equal(suggestEnglishName('LAKTOSEFR MILCH'), 'lactose-free milk');
  assert.equal(suggestEnglishName('HAFERFLOCKEN'), 'oats');
  assert.equal(suggestEnglishName('IRISCHE BUTTER'), 'irish butter');
  // untranslatable name → null (probably already English)
  assert.equal(suggestEnglishName('Anchor Salted'), null);
});

test('translateTokens feeds the search index', () => {
  assert.ok(translateTokens('VOLLMILCH').includes('whole'));
  assert.ok(translateTokens('VOLLMILCH').includes('milk'));
  assert.ok(translateTokens('EIER FH WEISS').includes('eggs'));
});
