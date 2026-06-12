/* Service worker for Price History.
 * Release process: bump CACHE_NAME on every deploy. */
const CACHE_NAME = 'ph-v5';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/router.js',
  './js/db.js',
  './js/repo.js',
  './js/money.js',
  './js/units.js',
  './js/fx.js',
  './js/normalize.js',
  './js/dictionary.js',
  './js/match.js',
  './js/parser.js',
  './js/ocr.js',
  './js/search.js',
  './js/ui/components.js',
  './js/ui/screen-search.js',
  './js/ui/screen-item.js',
  './js/ui/screen-wizard.js',
  './js/ui/screen-manual.js',
  './js/ui/screen-stores.js',
  './js/ui/screen-categories.js',
  './js/ui/screen-settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' bypasses the browser HTTP cache — GitHub Pages serves
      // with max-age=600, and without this a new SW version can precache the
      // OLD files and pin the app to a stale release.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // FX API is never SW-cached: persistence of rates lives in IndexedDB,
  // owned by the pending/backfill logic.
  if (url.hostname.startsWith('api.frankfurter.')) return;

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Runtime cache-first for the heavy OCR vendor files (wasm + traineddata):
        // cached on first OCR, fully offline afterwards.
        if (res.ok && url.pathname.includes('/vendor/')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline navigation falls back to the cached shell (hash routing
        // means there is only one document).
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
