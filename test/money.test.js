import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, formatMinor, roundMinor } from '../js/money.js';

test('parses German comma decimals', () => {
  assert.deepEqual(parsePrice('2,99'), { minor: 299, currency: null });
  assert.deepEqual(parsePrice('0,70'), { minor: 70, currency: null });
  assert.deepEqual(parsePrice('11,09'), { minor: 1109, currency: null });
});

test('parses UK prices with symbol', () => {
  assert.deepEqual(parsePrice('£5.80'), { minor: 580, currency: 'GBP' });
  assert.deepEqual(parsePrice('£0.91'), { minor: 91, currency: 'GBP' });
});

test('parses euro symbol and code', () => {
  assert.equal(parsePrice('2,99 €').currency, 'EUR');
  assert.equal(parsePrice('EUR 2.99').currency, 'EUR');
  assert.equal(parsePrice('2,99 €').minor, 299);
});

test('parses negative discounts', () => {
  assert.equal(parsePrice('-0,99').minor, -99);
  assert.equal(parsePrice('-£0.80').minor, -80);
});

test('parses thousands separators', () => {
  assert.equal(parsePrice('1.234,56').minor, 123456);
  assert.equal(parsePrice('1,234.56').minor, 123456);
});

test('rejects garbage', () => {
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('1,23,45'), null);
  // comma + exactly 3 digits is thousands grouping, not decimals
  assert.equal(parsePrice('12,345').minor, 1234500);
});

test('single decimal digit means tens of cents', () => {
  assert.equal(parsePrice('2,9').minor, 290);
});

test('roundMinor rounds half away from zero', () => {
  assert.equal(roundMinor(2.5), 3);
  assert.equal(roundMinor(-2.5), -3);
  assert.equal(roundMinor(2.4), 2);
});

test('formats per currency convention', () => {
  assert.equal(formatMinor(299, 'EUR'), '2,99 €');
  assert.equal(formatMinor(580, 'GBP'), '£5.80');
  assert.equal(formatMinor(450, 'AUD'), '$4.50');
  assert.equal(formatMinor(-99, 'EUR'), '-0,99 €');
});
