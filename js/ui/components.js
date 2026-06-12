/* Minimal DOM helpers shared by all screens. */

import { formatMinor } from '../money.js';

/* el('div.card', {onclick}, child1, 'text', ...) */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), v);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else if (k in node && k !== 'list' && k !== 'form') {
      node[k] = v;
    } else {
      node.setAttribute(k, v);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function toast(msg, kind = '') {
  const host = document.getElementById('toast-host');
  const t = el('div.toast' + (kind ? '.' + kind : ''), {}, msg);
  host.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function confirmDialog(message, okLabel = 'OK') {
  return new Promise((resolve) => {
    const dlg = el('dialog', {},
      el('p', { style: 'margin-top:0' }, message),
      el('div.row', { style: 'justify-content:flex-end' },
        el('button.btn-ghost', { onclick: () => { dlg.close(); resolve(false); } }, 'Cancel'),
        el('button.btn-primary', { onclick: () => { dlg.close(); resolve(true); } }, okLabel),
      ),
    );
    dlg.addEventListener('close', () => { dlg.remove(); resolve(false); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export function priceText(minor, currency) {
  if (minor == null) return '—';
  return formatMinor(minor, currency);
}

export function field(labelText, inputEl) {
  return el('div.field', {}, el('label', {}, labelText), inputEl);
}

export function select(options, value, attrs = {}) {
  const s = el('select', attrs);
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

export function backLink(hash, label = '‹ Back') {
  return el('a.btn.btn-ghost.btn-sm', { href: hash, style: 'margin-bottom:10px' }, label);
}
