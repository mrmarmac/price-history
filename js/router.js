/* Tiny hash router. Routes: '#/search', '#/item/:id', '#/add', '#/manual',
 * '#/stores', '#/categories', '#/settings'. Screens export render(container, params). */

const routes = [];

export function route(pattern, render) {
  // pattern like 'item/:id' → regex with named params
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
    names.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ re, names, render });
}

let container;

export function startRouter(el) {
  container = el;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function navigate(path) {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
}

async function dispatch() {
  const path = (location.hash.replace(/^#\/?/, '') || 'search');
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    container.innerHTML = '';
    container.scrollTop = 0;
    window.scrollTo(0, 0);
    highlightTab(path);
    try {
      await r.render(container, params);
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty">Something went wrong.<br><span class="small">${String(err && err.message || err)}</span></div>`;
    }
    return;
  }
  navigate('search');
}

function highlightTab(path) {
  const tab = path.split('/')[0];
  // item detail and list screens belong to their parent tabs
  const owner = { item: 'search', stores: 'settings', categories: 'settings' }[tab] || tab;
  document.querySelectorAll('#tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === owner);
  });
}
