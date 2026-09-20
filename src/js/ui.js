// Küçük arayüz yardımcıları. Tarayıcının alert/confirm pencereleri kullanılmaz:
// online sürümde editör yalıtılmış çerçevede çalışır ve orada bu pencereler kapalıdır.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

export function toast(msg, kind = 'info', ms = 4000) {
  const t = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function setStatus(msg) {
  $('#status').textContent = msg;
}

let busyDepth = 0;
export function busy(text) {
  busyDepth++;
  $('#busy').hidden = false;
  $('#busy-text').textContent = text;
  return {
    update(t) { $('#busy-text').textContent = t; },
    done() {
      busyDepth = Math.max(0, busyDepth - 1);
      if (!busyDepth) $('#busy').hidden = true;
    },
  };
}

/**
 * Modal pencere. buttons: [{label, value, kind:'primary'|'danger'|undefined}]
 * body: metin (satır sonları korunur) ya da DOM düğümü. Esc = ilk "cancel" değerli düğme.
 */
export function modal({ title, body, buttons = [{ label: 'Tamam', value: true, kind: 'primary' }], kind = '', onOpen }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const content = typeof body === 'string' ? el('div', { class: 'modal-text' }, body) : body;
    let closed = false;
    const close = (v) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.();
      resolve(v);
    };
    const btns = buttons.map((b) =>
      el('button', { class: `btn ${b.kind || ''}`, 'data-value': String(b.value), onclick: () => close(b.value) }, b.label));
    const box = el('div', { class: `modal ${kind}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h2', {}, title), content, el('div', { class: 'modal-buttons' }, btns));
    const overlay = el('div', { class: 'modal-overlay' }, box);
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        const cancel = buttons.find((b) => b.value === false || b.value === 'cancel' || b.value === null);
        close(cancel ? cancel.value : buttons[0].value);
      } else if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA' && ev.target.tagName !== 'BUTTON') {
        const i = buttons.findIndex((b) => b.kind === 'primary');
        if (i >= 0) { ev.preventDefault(); btns[i].click(); } // doğrulama dinleyicileri de çalışsın
      }
    };
    document.addEventListener('keydown', onKey, true);
    $('#modal-root').append(overlay);
    onOpen?.(box, close);
    (box.querySelector('input,select,textarea') || btns.find((b, i) => buttons[i].kind === 'primary') || btns[0])?.focus();
  });
}

export function errorModal(title, message) {
  return modal({ title, body: message, kind: 'error', buttons: [{ label: 'Tamam', value: true, kind: 'primary' }] });
}

export function confirmModal(title, message, okLabel = 'Evet', cancelLabel = 'Vazgeç', danger = false) {
  return modal({
    title, body: message,
    buttons: [
      { label: cancelLabel, value: false },
      { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
}

export function formatMB(bytes) {
  return (bytes / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB';
}

// Tek tip SVG simgeler
const P = {
  rotate: '<path d="M20 11a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name];
  return s;
}
