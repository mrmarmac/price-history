/* App bootstrap: open DB, register service worker, start router, kick the
 * FX backfill runner (resolves observations saved while offline). */

import { openDB } from './db.js';
import { route, startRouter } from './router.js';
import { initFxBackfill } from './fx.js';
import { ensurePersistence } from './storage.js';

import * as screenSearch from './ui/screen-search.js';
import * as screenItem from './ui/screen-item.js';
import * as screenWizard from './ui/screen-wizard.js';
import * as screenManual from './ui/screen-manual.js';
import * as screenStores from './ui/screen-stores.js';
import * as screenCategories from './ui/screen-categories.js';
import * as screenSettings from './ui/screen-settings.js';

route('search', screenSearch.render);
route('item/:id', screenItem.render);
route('add', screenWizard.render);
route('manual', screenManual.render);
route('stores', screenStores.render);
route('categories', screenCategories.render);
route('settings', screenSettings.render);

async function boot() {
  await openDB();
  // ask for persistent storage up front (result cached for the Settings screen)
  ensurePersistence().then((s) => { window.__persistence = s; }).catch(() => {});
  initFxBackfill();
  startRouter(document.getElementById('app'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
}

boot();
