/* JSON export / import backup. Guards against IndexedDB eviction (iOS
 * silently drops storage for local-only sites) — the file is a full,
 * portable snapshot the user can re-import to any device.
 *
 * The pure core (serializeBackup / validateBackup) is unit-tested; the IDB
 * read/write shell (exportBackup / importBackup) is covered by e2e. */

import * as db from './db.js';

export const BACKUP_VERSION = 1;

/* Object stores included in a backup. 'meta' is filtered to user settings
 * (the 'seeded' flag is per-device and must not travel). */
const STORES = ['stores', 'categories', 'products', 'packages', 'observations', 'meta'];
const META_EXPORT_KEYS = ['displayCurrency', 'lastStoreId'];

/* ---------- pure ---------- */

export function serializeBackup(data, exportedAt) {
  return {
    app: 'price-history',
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      stores: data.stores || [],
      categories: data.categories || [],
      products: data.products || [],
      packages: data.packages || [],
      observations: data.observations || [],
      meta: data.meta || [],
    },
  };
}

export function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['Not a backup file'] };
  }
  if (obj.app !== 'price-history') errors.push('This is not a Price History backup (wrong app tag)');
  if (obj.version !== BACKUP_VERSION) errors.push(`Unsupported backup version ${obj.version}`);
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('Backup has no data');
    return { ok: false, errors };
  }
  for (const s of STORES) {
    if (!Array.isArray(obj.data[s])) errors.push(`Missing or invalid "${s}" collection`);
  }
  return { ok: errors.length === 0, errors };
}

/* Record counts, for confirmation UIs. */
export function backupCounts(obj) {
  const d = (obj && obj.data) || {};
  return {
    products: (d.products || []).length,
    observations: (d.observations || []).length,
    stores: (d.stores || []).length,
    categories: (d.categories || []).length,
  };
}

/* ---------- IDB shell ---------- */

export async function exportBackup(now = new Date().toISOString()) {
  const [stores, categories, products, packages, observations, allMeta] = await Promise.all([
    db.getAll('stores'), db.getAll('categories'), db.getAll('products'),
    db.getAll('packages'), db.getAll('observations'), db.getAll('meta'),
  ]);
  const meta = allMeta.filter((m) => META_EXPORT_KEYS.includes(m.key));
  return serializeBackup({ stores, categories, products, packages, observations, meta }, now);
}

/* Import a validated backup.
 *   mode 'merge'   — put every record by id; existing records with the same
 *                    id are overwritten, others are kept.
 *   mode 'replace' — clear each store first (preserving the per-device
 *                    meta 'seeded' flag), then write the backup.
 * Returns the imported counts. */
export async function importBackup(obj, mode = 'merge') {
  const v = validateBackup(obj);
  if (!v.ok) throw new Error(v.errors.join('; '));

  const database = await db.openDB();
  const tx = database.transaction(STORES, 'readwrite');

  if (mode === 'replace') {
    for (const name of STORES) {
      const store = tx.objectStore(name);
      if (name === 'meta') {
        // keep the seeded flag; wipe everything else
        const keep = await new Promise((res, rej) => {
          const r = store.get('seeded');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        store.clear();
        if (keep) store.put(keep);
      } else {
        store.clear();
      }
    }
  }

  for (const name of STORES) {
    for (const record of obj.data[name]) tx.objectStore(name).put(record);
  }

  await db.txDone(tx);
  return backupCounts(obj);
}
