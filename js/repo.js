/* Domain CRUD + save-time validation. The only write path for
 * observations is saveEntry(), which enforces the validation rules and
 * freezes FX at write time. */

import * as db from './db.js';
import { isValidCurrency } from './money.js';
import { isValidUnit, dimension, computeUnitPrice, referenceUnitFor } from './units.js';
import { tokenize, normalizeName } from './normalize.js';
import { translateTokens } from './dictionary.js';
import { getRatesForDate, buildFxBlock } from './fx.js';

export const PRICE_TYPES = ['single', 'per_unit', 'per_weight', 'bundle', 'weighted', 'promo'];
export const COUNTRIES = ['DE', 'UK', 'AU'];

/* ---------- stores / categories ---------- */

export const listStores = () => db.getAll('stores');
export const listCategories = () => db.getAll('categories');

export function saveStore(store) {
  if (!store.name || !store.name.trim()) throw new Error('Store name is required');
  if (!COUNTRIES.includes(store.country)) throw new Error('Invalid country');
  if (!isValidCurrency(store.currency_default)) throw new Error('Invalid default currency');
  return db.put('stores', { id: store.id || db.uuid(), ...store, name: store.name.trim() });
}

export const deleteStore = (id) => db.del('stores', id);

export function saveCategory(cat) {
  const name = (cat.name || '').trim().toLowerCase();
  if (!name) throw new Error('Category name is required');
  return db.put('categories', { id: cat.id || db.uuid(), name });
}

export const deleteCategory = (id) => db.del('categories', id);

/* ---------- products / packages ---------- */

export const listProducts = () => db.getAll('products');
export const getProduct = (id) => db.get('products', id);
export const getPackagesForProduct = (productId) =>
  db.getAll('packages', 'by-product', IDBKeyRange.only(productId));
export const getObservationsForProduct = (productId) =>
  db.getAll('observations', 'by-product', IDBKeyRange.only(productId));
export const getObservationsForPackage = (packageId) =>
  db.getAll('observations', 'by-package', IDBKeyRange.only(packageId));

export function buildProductTokens(name, brand) {
  return [...new Set([
    ...tokenize(name),
    ...tokenize(brand || ''),
    ...translateTokens(name),
  ])];
}

export async function saveProduct({ id, name, brand, categoryId }) {
  name = (name || '').trim();
  if (!name) throw new Error('Product name is required');
  if (!categoryId || !(await db.get('categories', categoryId))) {
    throw new Error('Product must have a category');
  }
  const nameNormalized = normalizeName(name);
  // reuse an existing canonical product with the same normalised name
  if (!id) {
    const existing = (await listProducts()).find((p) => p.nameNormalized === nameNormalized);
    if (existing) return existing;
  }
  const product = {
    id: id || db.uuid(),
    name,
    nameNormalized,
    brand: (brand || '').trim(),
    categoryId,
    tokens: buildProductTokens(name, brand),
    createdAt: id ? undefined : new Date().toISOString(),
  };
  if (id) {
    const prev = await db.get('products', id);
    product.createdAt = prev ? prev.createdAt : new Date().toISOString();
  }
  await db.put('products', product);
  return product;
}

export async function savePackage({ id, productId, size, unit }) {
  size = Number(size);
  if (!productId) throw new Error('Package needs a product');
  if (!Number.isFinite(size) || size <= 0) throw new Error('Size must be greater than zero');
  if (!isValidUnit(unit)) throw new Error('Invalid unit');
  // reuse identical package
  if (!id) {
    const existing = (await getPackagesForProduct(productId))
      .find((p) => p.size === size && p.unit === unit);
    if (existing) return existing;
  }
  const pkg = { id: id || db.uuid(), productId, size, unit };
  await db.put('packages', pkg);
  return pkg;
}

/* ---------- observation validation (spec section 3) ---------- */

export function validateObservation(o) {
  const errors = [];
  if (!o.storeId) errors.push('A store is required');
  if (!isValidCurrency(o.currency)) errors.push('Missing or invalid currency on priced line');
  if (!Number.isInteger(o.total_price)) errors.push('Price must be set');
  else if (o.total_price < 0) errors.push('Price cannot be negative');
  if (!Number.isFinite(o.quantity) || o.quantity <= 0) errors.push('Quantity must be greater than zero');
  if (!Number.isFinite(o.size) || o.size <= 0) errors.push('Size must be greater than zero');
  if (!isValidUnit(o.unit)) errors.push('Invalid unit');
  if (!PRICE_TYPES.includes(o.price_type)) errors.push('Invalid price type');
  // impossible unit combinations: weight-priced lines must use a weighable unit
  if ((o.price_type === 'weighted' || o.price_type === 'per_weight') &&
      dimension(o.unit) === 'count') {
    errors.push('Weighed lines need a weight/volume unit, not pieces');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) errors.push('Date is required (YYYY-MM-DD)');
  return errors;
}

/* ---------- the single write path ----------
 * entry = {
 *   product: {id} | {name, brand, categoryId},
 *   pkg:     {id} | {size, unit},
 *   obs:     {storeId, country, total_price, currency, quantity, unit,
 *             price_type, date, note?}
 * }
 * Receipt date fallback (scan date = today) must be applied by the caller
 * BEFORE calling; validation rejects a missing date outright. */
export async function saveEntry({ product, pkg, obs }) {
  const prod = product.id ? await getProduct(product.id) : await saveProduct(product);
  if (!prod) throw new Error('Product not found');

  const pack = pkg.id
    ? await db.get('packages', pkg.id)
    : await savePackage({ ...pkg, productId: prod.id });
  if (!pack) throw new Error('Package not found');

  const store = await db.get('stores', obs.storeId);

  const record = {
    id: db.uuid(),
    productId: prod.id,
    packageId: pack.id,
    storeId: obs.storeId,
    country: obs.country || (store ? store.country : null),
    total_price: obs.total_price,
    currency: obs.currency,
    quantity: obs.quantity ?? 1,
    size: pack.size,
    unit: pack.unit,
    price_type: obs.price_type || 'single',
    date: obs.date,
    note: obs.note || '',
    createdAt: new Date().toISOString(),
  };

  const errors = validateObservation(record);
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.validation = errors;
    throw err;
  }

  // unit_price per 1 reference unit (kg / l / pc), only when computable
  const up = computeUnitPrice(record.total_price, record.size, record.unit, record.quantity);
  record.unit_price = up ? up.unit_price : null;
  record.reference_quantity = up ? up.reference_quantity : null;
  record.reference_unit = up ? up.reference_unit : referenceUnitFor(record.unit);

  // FX frozen at write time; offline → pending + backfill
  const rates = await getRatesForDate(record.date);
  record.fx = buildFxBlock(record.total_price, record.currency, rates);
  if (record.fx.status === 'pending') record.fx_pending = 1;

  await db.put('observations', record);
  return record;
}

export async function deleteObservation(id) {
  return db.del('observations', id);
}

/* Editing an observation = rewrite through the same validated path,
 * with FX recomputed for the (possibly corrected) receipt date. */
export async function updateObservation(id, changes) {
  const prev = await db.get('observations', id);
  if (!prev) throw new Error('Observation not found');
  await db.del('observations', id);
  try {
    return await saveEntry({
      product: { id: changes.productId || prev.productId },
      pkg: changes.pkg || { id: prev.packageId },
      obs: { ...prev, ...changes.obs },
    });
  } catch (err) {
    await db.put('observations', prev); // restore on failure
    throw err;
  }
}
