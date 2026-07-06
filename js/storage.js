/* Persistent-storage request. On a local-only PWA the browser may evict
 * IndexedDB under storage pressure; asking for persistence up front (not
 * just at first save) reduces that risk immediately. If the browser
 * declines, the UI nudges the user to export a backup. */

export async function ensurePersistence() {
  if (!navigator.storage || !navigator.storage.persist) {
    return { supported: false, persisted: false };
  }
  try {
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const persisted = already || await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: true, persisted: false };
  }
}

/* Pure: warning string for a persistence state, or null when all good. */
export function persistenceMessage({ supported, persisted }) {
  if (supported && persisted) return null;
  if (!supported) {
    return 'This browser can’t guarantee persistent storage — export a backup regularly.';
  }
  return 'Storage isn’t persistent yet — the browser may evict your data. ' +
    'Add the app to your Home Screen and export a backup to be safe.';
}
