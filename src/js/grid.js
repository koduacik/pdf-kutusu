// Sayfa ızgarası: küçük resimler, sürükleyerek sıralama, sayfa işlemleri.
import { state, mutate, findPage, pageIndex, pageProxy, totalRotation, uid } from './state.js';
import { renderBase, paintEdits } from './paint.js';
import { $, el, icon } from './ui.js';

const THUMB_W = 150;
const THUMB_H = 196;
const DRAG_TYPE = 'application/x-pdfkutusu-page';

const cards = new Map(); // sayfa id → { el, canvas, num, src, badges, sig, visible }
let handlers = {};
let observer;
let draggingId = null;
let indicator;
let addCard;

const sigOf = (p) => JSON.stringify([p.doc, p.index, p.rot, p.edits]);

export function initGrid(h) {
  handlers = h;
  const grid = $('#grid');
  indicator = el('div', { class: 'drop-indicator', hidden: true });
  addCard = el('div', { class: 'card add-card' },
    el('button', { class: 'add-btn', title: 'Sona sayfa ekle', onclick: () => handlers.onInsert(state.pages.length) },
      icon('plus'), el('span', {}, 'Sayfa ekle')));

  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const c = cards.get(en.target.dataset.id);
      if (!c) continue;
      c.visible = en.isIntersecting;
      if (c.visible) enqueue(en.target.dataset.id);
    }
  }, { root: $('.workspace'), rootMargin: '400px 0px' });

  grid.addEventListener('dragover', (ev) => {
    const internal = draggingId !== null;
    const files = ev.dataTransfer?.types?.includes('Files');
    if (!internal && !files) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = internal ? 'move' : 'copy';
    showIndicator(dropIndex(ev.clientX, ev.clientY));
  });
  grid.addEventListener('dragleave', (ev) => {
    if (!grid.contains(ev.relatedTarget)) indicator.hidden = true;
  });
  grid.addEventListener('drop', (ev) => {
    const internal = draggingId !== null;
    const files = ev.dataTransfer?.files;
    if (!internal && !files?.length) return;
    ev.preventDefault();
    ev.stopPropagation();
    const idx = dropIndex(ev.clientX, ev.clientY);
    indicator.hidden = true;
    if (internal) movePage(draggingId, idx);
    else handlers.onFilesDropped(files, idx);
  });
}

function dropIndex(x, y) {
  const list = [...$('#grid').querySelectorAll('.card[data-id]')];
  let best = null;
  let bestD = Infinity;
  list.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const dy = Math.max(0, Math.abs(y - (r.top + r.height / 2)) - r.height / 2);
    const d = dy * 10000 + Math.abs(x - cx);
    if (d < bestD) {
      bestD = d;
      best = { i, before: x < cx };
    }
  });
  if (!best) return state.pages.length;
  return best.before ? best.i : best.i + 1;
}

function showIndicator(idx) {
  const grid = $('#grid');
  const list = [...grid.querySelectorAll('.card[data-id]')];
  if (!list.length) return;
  const g = grid.getBoundingClientRect();
  const ref = list[Math.min(idx, list.length - 1)].getBoundingClientRect();
  const x = idx < list.length ? ref.left - 9 : ref.right + 7;
  indicator.style.left = `${x - g.left + grid.scrollLeft}px`;
  indicator.style.top = `${ref.top - g.top + grid.scrollTop}px`;
  indicator.style.height = `${ref.height}px`;
  indicator.hidden = false;
}

export function movePage(id, idx) {
  const from = pageIndex(id);
  if (from < 0) return;
  let to = idx > from ? idx - 1 : idx;
  to = Math.max(0, Math.min(to, state.pages.length - 1));
  if (to === from) return;
  mutate((pages) => {
    const [p] = pages.splice(from, 1);
    pages.splice(to, 0, p);
  });
}

export function rotatePage(id, by = 90) {
  mutate(() => {
    const p = findPage(id);
    p.rot = (((p.rot + by) % 360) + 360) % 360;
  });
}

export function duplicatePage(id) {
  mutate((pages) => {
    const i = pageIndex(id);
    const copy = structuredClone(pages[i]);
    copy.id = uid('p');
    const idMap = new Map();
    for (const e of copy.edits) {
      const n = uid('e');
      idMap.set(e.id, n);
      e.id = n;
    }
    for (const e of copy.edits) if (e.linked) e.linked = idMap.get(e.linked) ?? e.linked;
    pages.splice(i + 1, 0, copy);
  });
}

export function deletePage(id) {
  mutate((pages) => {
    const i = pageIndex(id);
    if (i >= 0) pages.splice(i, 1);
  });
}

function createCard(p) {
  const canvas = el('canvas', { width: 1, height: 1 });
  const num = el('span', { class: 'num' });
  const src = el('span', { class: 'src' });
  const badges = el('div', { class: 'badges' });
  const act = (name, title, fn) =>
    el('button', { class: `cact cact-${name}`, title, 'aria-label': title, 'data-act': name,
      onclick: (ev) => { ev.stopPropagation(); fn(card.dataset.id); } }, icon(name));
  const card = el('div', { class: 'card', draggable: 'true', tabindex: '0', 'data-id': p.id },
    el('button', { class: 'ins-before', title: 'Bu sayfanın önüne sayfa ekle', 'aria-label': 'Buraya sayfa ekle',
      onclick: (ev) => { ev.stopPropagation(); handlers.onInsert(pageIndex(card.dataset.id)); } }, icon('plus')),
    el('div', { class: 'thumb' }, canvas, badges),
    el('div', { class: 'meta' }, num, src),
    el('div', { class: 'card-actions' },
      act('edit', 'Düzenle (çift tıkla)', (id) => handlers.onEdit(id)),
      act('rotate', 'Sağa döndür', (id) => rotatePage(id, 90)),
      act('dup', 'Çoğalt', duplicatePage),
      act('del', 'Sil', deletePage)));

  card.addEventListener('dblclick', () => handlers.onEdit(card.dataset.id));
  card.addEventListener('keydown', (ev) => {
    if (ev.target !== card) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deletePage(card.dataset.id); }
    else if (ev.key === 'Enter') { ev.preventDefault(); handlers.onEdit(card.dataset.id); }
    else if (ev.key.toLowerCase() === 'r' && !ev.ctrlKey && !ev.metaKey) rotatePage(card.dataset.id, ev.shiftKey ? -90 : 90);
  });
  card.addEventListener('dragstart', (ev) => {
    draggingId = card.dataset.id;
    ev.dataTransfer.setData(DRAG_TYPE, draggingId);
    ev.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    draggingId = null;
    card.classList.remove('dragging');
    indicator.hidden = true;
  });

  const c = { el: card, canvas, num, src, badges, sig: null, visible: false };
  cards.set(p.id, c);
  observer.observe(card);
  return c;
}

export function renderGrid() {
  const grid = $('#grid');
  const seen = new Set();
  const nodes = [];
  state.pages.forEach((p, i) => {
    const c = cards.get(p.id) || createCard(p);
    const doc = state.docs.get(p.doc);
    c.num.textContent = String(i + 1);
    c.src.textContent = doc.label;
    c.src.title = doc.name;
    c.el.style.setProperty('--doc', doc.color);
    c.el.setAttribute('aria-label', `Sayfa ${i + 1} — ${doc.name}`);
    const nEdits = p.edits.filter((e) => e.role !== 'cover' && e.role !== 'redact').length;
    const redact = p.edits.some((e) => e.role === 'redact');
    c.badges.replaceChildren(
      ...(nEdits ? [el('span', { class: 'badge', title: 'Bu sayfada düzenleme var' }, `✎ ${nEdits}`)] : []),
      ...(redact ? [el('span', { class: 'badge danger', title: 'Kaydederken bu sayfa resme çevrilecek' }, 'Kalıcı karart')] : []));
    seen.add(p.id);
    nodes.push(c.el);
    if (c.sig !== sigOf(p)) enqueue(p.id);
  });
  for (const [id, c] of cards) {
    if (!seen.has(id)) {
      observer.unobserve(c.el);
      c.el.remove();
      cards.delete(id);
    }
  }
  grid.replaceChildren(...nodes, addCard, indicator);
}

// Küçük resim çizim kuyruğu (aynı anda en çok 2)
const queue = [];
let running = 0;
function enqueue(id) {
  const c = cards.get(id);
  if (!c || !c.visible) return;
  if (!queue.includes(id)) queue.push(id);
  pump();
}
function pump() {
  while (running < 2 && queue.length) {
    const id = queue.shift();
    running++;
    renderThumb(id)
      .catch((err) => console.warn('küçük resim çizilemedi', err))
      .finally(() => { running--; pump(); });
  }
}

async function renderThumb(id) {
  const p = findPage(id);
  const c = cards.get(id);
  if (!p || !c) return;
  const sig = sigOf(p);
  if (c.sig === sig) return;
  const proxy = await pageProxy(p);
  const R = await totalRotation(p);
  const vp1 = proxy.getViewport({ scale: 1, rotation: R });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssScale = Math.min(THUMB_W / vp1.width, THUMB_H / vp1.height);
  const off = document.createElement('canvas');
  const ctx = await renderBase(proxy, off, R, cssScale * dpr);
  paintEdits(ctx, p, proxy, R, cssScale * dpr);
  c.canvas.width = off.width;
  c.canvas.height = off.height;
  c.canvas.getContext('2d').drawImage(off, 0, 0);
  c.canvas.style.width = `${Math.round(vp1.width * cssScale)}px`;
  c.canvas.style.height = `${Math.round(vp1.height * cssScale)}px`;
  c.el.dataset.rotation = String(R);
  c.sig = sig;
  const now = findPage(id);
  if (now && sigOf(now) !== sig) enqueue(id);
}
