/* IndexedDB layer: schema v1, seeds, promisified helpers.
 * No side effects at import time (keeps pure-module tests importable in node). */

const DB_NAME = 'price-history';
const DB_VERSION = 1;

export const SEED_STORES = [
  { id: 'store-kaufland-de', name: 'Kaufland', country: 'DE', currency_default: 'EUR' },
  { id: 'store-rewe-de', name: 'REWE', country: 'DE', currency_default: 'EUR' },
  { id: 'store-edeka-de', name: 'Edeka', country: 'DE', currency_default: 'EUR' },
  { id: 'store-lidl-de', name: 'Lidl', country: 'DE', currency_default: 'EUR' },
  { id: 'store-tesco-uk', name: 'Tesco Superstore', country: 'UK', currency_default: 'GBP' },
  { id: 'store-woolworths-au', name: 'Woolworths', country: 'AU', currency_default: 'AUD' },
  { id: 'store-coles-au', name: 'Coles', country: 'AU', currency_default: 'AUD' },
];

export const SEED_CATEGORIES = [
  'fruit', 'vegetables', 'ready meals', 'canned', 'drinks',
  'meat', 'frozen', 'snacks', 'bakery',
].map((name) => ({ id: 'cat-' + name.replace(/\s+/g, '-'), name }));

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // switch fall-through keeps future versions additive
      switch (e.oldVersion) {
        case 0: {
          const products = db.createObjectStore('products', { keyPath: 'id' });
          products.createIndex('by-tokens', 'tokens', { multiEntry: true });
          products.createIndex('by-category', 'categoryId');
          products.createIndex('by-name', 'nameNormalized', { unique: true });

          const packages = db.createObjectStore('packages', { keyPath: 'id' });
          packages.createIndex('by-product', 'productId');

          const obs = db.createObjectStore('observations', { keyPath: 'id' });
          obs.createIndex('by-product', 'productId');
          obs.createIndex('by-package', 'packageId');
          obs.createIndex('by-date', 'date');
          obs.createIndex('by-fx-pending', 'fx_pending');

          const stores = db.createObjectStore('stores', { keyPath: 'id' });
          stores.createIndex('by-country', 'country');

          db.createObjectStore('categories', { keyPath: 'id' });
          db.createObjectStore('fxRates', { keyPath: 'date' });
          db.createObjectStore('meta', { keyPath: 'key' });

          // seed inside the upgrade transaction
          const tx = req.transaction;
          for (const s of SEED_STORES) tx.objectStore('stores').put(s);
          for (const c of SEED_CATEGORIES) tx.objectStore('categories').put(c);
          tx.objectStore('meta').put({ key: 'seeded', value: 1 });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* ---- promisified primitives ---- */

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return reqToPromise(db.transaction(storeName).objectStore(storeName).get(key));
}

export async function getAll(storeName, indexName = null, query = null) {
  const db = await openDB();
  let src = db.transaction(storeName).objectStore(storeName);
  if (indexName) src = src.index(indexName);
  return reqToPromise(src.getAll(query));
}

export async function put(storeName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  return txDone(tx).then(() => value);
}

export async function del(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  return txDone(tx);
}

export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

/* Multi-store readwrite transaction helper: fn receives the tx. */
export async function withTx(storeNames, fn) {
  const db = await openDB();
  const tx = db.transaction(storeNames, 'readwrite');
  const result = fn(tx);
  await txDone(tx);
  return result;
}

/* Distinct product ids whose tokens have `prefix` (uses the multiEntry index). */
export async function productIdsByTokenPrefix(prefix) {
  const db = await openDB();
  const idx = db.transaction('products').objectStore('products').index('by-tokens');
  const range = IDBKeyRange.bound(prefix, prefix + '￿');
  const ids = new Set();
  return new Promise((resolve, reject) => {
    const cur = idx.openKeyCursor(range);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve(ids);
      ids.add(c.primaryKey);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

export function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
