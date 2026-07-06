/* Search + "cheapest price" decision logic.
 * All cross-currency comparisons use the FROZEN equivalents stored on each
 * observation — switching display currency is a read-time choice and never
 * touches stored data. Equivalent unit prices are derived here at display
 * time from equivalent totals (never stored → no rounding drift). */

import * as db from './db.js';
import * as repo from './repo.js';
import { tokenize, normalizeName, diceSimilarity } from './normalize.js';
import { roundMinor } from './money.js';
import { toReferenceQuantity, dimension } from './units.js';

/* Equivalent total of an observation in `currency`, or null when not
 * comparable (FX still pending and currencies differ). */
export function equivalentTotal(obs, currency) {
  if (obs.currency === currency) return obs.total_price;
  if (obs.fx && obs.fx.status === 'done') {
    return obs.fx['equivalent_' + currency.toLowerCase()] ?? null;
  }
  return null;
}

/* Equivalent price per 1 reference unit (kg/l/pc) in `currency`. */
export function equivalentUnitPrice(obs, currency) {
  const total = equivalentTotal(obs, currency);
  if (total === null) return null;
  const refQty = toReferenceQuantity(obs.size * obs.quantity, obs.unit);
  if (!refQty || refQty <= 0) return null;
  return roundMinor(total / refQty);
}

/* Cheapest observation of a list by equivalent unit price (fallback:
 * equivalent total). Pending-FX observations in another currency are
 * excluded from ranking but counted so the UI can show a badge. */
export function cheapestOf(observations, currency) {
  let best = null;
  let bestKey = Infinity;
  let excludedPending = 0;
  for (const obs of observations) {
    const unit = equivalentUnitPrice(obs, currency);
    const total = equivalentTotal(obs, currency);
    if (unit === null && total === null) { excludedPending++; continue; }
    const key = unit !== null ? unit : total;
    if (key < bestKey) { bestKey = key; best = obs; }
  }
  return { obs: best, excludedPending };
}

export const cheapestForPackage = async (packageId, currency) =>
  cheapestOf(await repo.getObservationsForPackage(packageId), currency);

export const cheapestForProduct = async (productId, currency) =>
  cheapestOf(await repo.getObservationsForProduct(productId), currency);

/* The unit dimension a product is traded in (from its packages). */
export async function productDimension(productId) {
  const packages = await repo.getPackagesForProduct(productId);
  const dims = new Set(packages.map((p) => dimension(p.unit)));
  return dims.size === 1 ? [...dims][0] : (dims.size ? [...dims][0] : null);
}

/* Substitutes: same category, same unit dimension, ranked by cheapest
 * equivalent unit price. Only explicit categories are comparable. */
export async function findSubstitutes(product, currency, limit = 5) {
  if (!product.categoryId) return [];
  const dim = await productDimension(product.id);
  const siblings = (await db.getAll('products', 'by-category', IDBKeyRange.only(product.categoryId)))
    .filter((p) => p.id !== product.id);

  const ranked = [];
  for (const p of siblings) {
    const pDim = await productDimension(p.id);
    if (dim && pDim && pDim !== dim) continue; // never compare g with ml
    const { obs } = await cheapestForProduct(p.id, currency);
    if (!obs) continue;
    ranked.push({ product: p, obs, unitPrice: equivalentUnitPrice(obs, currency) });
  }
  ranked.sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
  return ranked.slice(0, limit);
}

/* Token-prefix search over products (AND across query tokens).
 * Product tokens include dictionary EN translations at write time, so
 * searching "milk" finds "Vollmilch". Empty query → all products. */
/* Pure relevance score of a product against a raw query, 0..100.
 * Tiers: exact normalised name (100) > name starts-with query (80) >
 * an exact query token in the product's tokens, incl. dictionary
 * translations (60) > whole-name fuzzy similarity (≤40) > no match (0). */
export function scoreRelevance(product, queryRaw) {
  const q = normalizeName(queryRaw || '');
  if (!q) return 0;
  const name = product.nameNormalized || normalizeName(product.name || '');
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  const productTokens = new Set(product.tokens || tokenize(product.name || ''));
  let score = 0;
  for (const t of tokenize(queryRaw)) {
    if (productTokens.has(t)) { score = Math.max(score, 60); }
  }
  score = Math.max(score, Math.round(40 * diceSimilarity(queryRaw, product.name || '')));
  return score;
}

/* Pure ranking: relevance desc → latest observation date desc (recency)
 * → name asc. metaById maps productId → { latestDate }. */
export function rankProducts(products, queryRaw, metaById = {}) {
  return [...products].sort((a, b) => {
    const rb = scoreRelevance(b, queryRaw);
    const ra = scoreRelevance(a, queryRaw);
    if (rb !== ra) return rb - ra;
    const da = (metaById[a.id] && metaById[a.id].latestDate) || '';
    const dbb = (metaById[b.id] && metaById[b.id].latestDate) || '';
    if (da !== dbb) return dbb.localeCompare(da);
    return a.name.localeCompare(b.name);
  });
}

/* Latest observation date per product, for recency ranking. Single-user:
 * one pass over all observations is cheap. */
async function latestDatesByProduct() {
  const all = await db.getAll('observations');
  const meta = {};
  for (const o of all) {
    const cur = meta[o.productId];
    if (!cur || o.date > cur.latestDate) meta[o.productId] = { latestDate: o.date };
  }
  return meta;
}

export async function searchProducts(query) {
  const meta = await latestDatesByProduct();
  const tokens = tokenize(query || '');
  if (!tokens.length) {
    return rankProducts(await repo.listProducts(), query || '', meta);
  }
  let ids = null;
  for (const t of tokens) {
    const set = await db.productIdsByTokenPrefix(t);
    ids = ids === null ? set : new Set([...ids].filter((id) => set.has(id)));
    if (!ids.size) return [];
  }
  const products = (await Promise.all([...ids].map((id) => repo.getProduct(id)))).filter(Boolean);
  return rankProducts(products, query, meta);
}

/* Display currency preference (meta store), default EUR. */
export async function getDisplayCurrency() {
  const m = await db.get('meta', 'displayCurrency');
  return (m && m.value) || 'EUR';
}

export async function setDisplayCurrency(currency) {
  await db.put('meta', { key: 'displayCurrency', value: currency });
}
