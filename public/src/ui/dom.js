// Tiny DOM helpers.
export function h(tag, attrs = {}, children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (children != null) {
    for (const c of Array.isArray(children) ? children : [children]) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function toast(text, err = false, ms = 2600) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: 'toast' + (err ? ' err' : '') }, text);
  root.append(el);
  setTimeout(() => el.remove(), ms);
}
