/* Pure fuzzy matching of a draft line against existing products,
 * powering the "Same as previous item?" suggestions. */

import { tokenize, diceSimilarity } from './normalize.js';
import { translateTokens, suggestEnglishName } from './dictionary.js';

const SUGGEST_THRESHOLD = 0.45;

/* Score how likely `draft` ({name, brand}) refers to `product`
 * ({name, brand, tokens}). 0..1. Token overlap (including the product's
 * dictionary-translated tokens) carries most weight; whole-name bigram
 * similarity breaks ties; matching brand adds a small boost. */
export function scoreMatch(draft, product) {
  const draftTokens = new Set([
    ...tokenize(draft.name || ''),
    ...translateTokens(draft.name || ''),
  ]);
  if (draftTokens.size === 0) return 0;

  const productTokens = new Set(product.tokens || [
    ...tokenize(product.name || ''),
    ...tokenize(product.brand || ''),
  ]);

  let overlap = 0;
  for (const t of draftTokens) if (productTokens.has(t)) overlap++;
  const tokenScore = overlap / Math.min(draftTokens.size, Math.max(productTokens.size, 1));

  const nameSim = Math.max(
    diceSimilarity(draft.name || '', product.name || ''),
    diceSimilarity(suggestEnglishName(draft.name || '') || '', product.name || ''),
  );

  let score = 0.55 * tokenScore + 0.45 * nameSim;

  if (draft.brand && product.brand &&
      diceSimilarity(draft.brand, product.brand) > 0.8) {
    score = Math.min(1, score + 0.1);
  }
  return score;
}

/* Rank all products against a draft line; returns [{product, score}]
 * above threshold, best first, capped at `limit`. */
export function findMatches(draft, products, limit = 3) {
  const scored = [];
  for (const p of products) {
    const score = scoreMatch(draft, p);
    if (score >= SUGGEST_THRESHOLD) scored.push({ product: p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
