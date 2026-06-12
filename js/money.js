/* Pure money helpers. All monetary values are integers in minor units
 * (cents / pence). One rounding rule, applied exactly once per stored value:
 * round half away from zero. */

export const CURRENCIES = {
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  AUD: { symbol: '$', name: 'Australian Dollar' },
};

export function roundMinor(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/* Parse a price token like "2,99", "2.99", "£5.80", "-0,99", "2,99 €",
 * "EUR 2.99", "$4.50". Returns { minor, currency } where currency is
 * null when the token carries no symbol/code.
 * Comma and dot are both accepted as the decimal separator; a separator
 * followed by exactly 3 digits is treated as a thousands separator only
 * when another separator follows (e.g. "1.234,56"). Receipt prices always
 * carry 2 decimals, so "1,234" alone parses as 1.234 → rejected (>2 dp). */
export function parsePrice(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let currency = null;
  if (/£/.test(s)) currency = 'GBP';
  else if (/€/.test(s) || /\bEUR\b/i.test(s)) currency = 'EUR';
  else if (/\bAUD\b/i.test(s)) currency = 'AUD';
  else if (/\bGBP\b/i.test(s)) currency = 'GBP';

  s = s.replace(/[£€$]|[A-Za-z]/g, '').trim();

  let negative = false;
  if (/^-/.test(s) || /-$/.test(s)) { negative = true; s = s.replace(/-/g, ''); }
  s = s.trim();

  const m = s.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;

  let intPart = m[1];
  let decPart = m[2] || '';
  // "1.234,56" / "1,234.56" → strip grouping separators from the integer part
  intPart = intPart.replace(/[.,]/g, '');

  const units = parseInt(intPart, 10);
  const cents = decPart.length === 0 ? 0
    : decPart.length === 1 ? parseInt(decPart, 10) * 10
    : parseInt(decPart, 10);

  let minor = units * 100 + cents;
  if (negative) minor = -minor;
  return { minor, currency };
}

export function formatMinor(minor, currency) {
  const c = CURRENCIES[currency];
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const units = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  const sym = c ? c.symbol : (currency || '');
  // EUR receipts read "2,99 €"; GBP/AUD read "£2.99"/"$2.99"
  if (currency === 'EUR') return `${sign}${units},${cents} €`;
  return `${sign}${sym}${units}.${cents}`;
}

export function isValidCurrency(c) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, c);
}
