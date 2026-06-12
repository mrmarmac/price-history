/* Pure name normalisation and tokenisation for matching and search. */

const TRANSLIT = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  'à': 'a', 'á': 'a', 'â': 'a', 'è': 'e', 'é': 'e', 'ê': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ò': 'o', 'ó': 'o', 'ô': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ç': 'c', 'ñ': 'n',
};

export function normalizeName(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.replace(/[äöüßàáâèéêìíîòóôùúûçñ]/g, (ch) => TRANSLIT[ch] || ch);
  s = s.replace(/[^a-z0-9%]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/* Tokens for the products.by-tokens multiEntry index and for matching.
 * Single-character tokens and pure numbers are dropped. */
export function tokenize(raw) {
  const out = new Set();
  for (const t of normalizeName(raw).split(' ')) {
    if (t.length < 2) continue;
    if (/^\d+$/.test(t)) continue;
    out.add(t);
  }
  return [...out];
}

/* Sørensen–Dice bigram similarity between two normalised strings, 0..1. */
export function diceSimilarity(a, b) {
  const x = normalizeName(a).replace(/ /g, '');
  const y = normalizeName(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < x.length - 1; i++) {
    const bg = x.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const bg = y.slice(i, i + 2);
    const n = bigrams.get(bg) || 0;
    if (n > 0) { hits++; bigrams.set(bg, n - 1); }
  }
  return (2 * hits) / (x.length - 1 + y.length - 1);
}
