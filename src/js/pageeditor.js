// Sayfa düzenleyici: bir sayfaya çift tıklayınca açılır.
import { state, mutate, beginGesture, findPage, pageIndex, pageProxy, totalRotation, onChange, uid, undo, redo, canUndo, canRedo } from './state.js';
import { renderBase } from './paint.js';
import { mapBox, viewport, norm, rgbToHex } from './geom.js';
import { fontOf, measureTextEdit, textWidth, LINE_HEIGHT } from './fonts.js';
import { createAsset } from './images.js';
import { sniffType } from './pdfengine.js';
import { $, el, modal, errorModal, toast } from './ui.js';

const ed = {
  open: false,
  pageId: null,
  proxy: null,
  R: 0, // sayfanın ekrandaki toplam dönüşü
  W: 0, H: 0, // o dönüşte sayfa boyu (nokta)
  z: 1, // yakınlaştırma (nokta → CSS piksel)
  tool: 'select',
  sel: null, // seçili öğe id
  runs: [], // sayfadaki mevcut yazılar
  typing: null, // açık yazı kutusu
  defaults: { size: 14, color: '#000000', bold: false, family: 'sans' },
  rectColor: '#ffffff',
  colorGesture: null,
  renderToken: 0,
  seenReplaceInfo: false,
  seenRedactInfo: false,
};

const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const page = () => findPage(ed.pageId);
const selected = () => page()?.edits.find((e) => e.id === ed.sel) || null;

const HINTS = {
  select: [
    'Sayfadaki bir yazıya tıkla ve yenisini yaz. Eklediklerini sürükleyerek taşı, köşesinden boyutlandır.',
    '⚠ Yazı değiştirmek eski yazının üstünü örter; eski yazı dosyanın içinde kalır. Gizli bir bilgiyi silmek için “Kalıcı karart”ı kullan.',
  ],
  text: ['Yazının başlayacağı yere tıkla ve yaz.', 'Enter: bitir · Shift+Enter: yeni satır · Esc: vazgeç'],
  rect: ['Örtmek istediğin yeri sürükleyerek çiz; rengini üstten seç.',
    '⚠ Örtü yalnızca görüntüyü kapatır; alttaki yazı dosyada kalır. Gizli bilgi için “Kalıcı karart”.'],
  redact: ['Silmek istediğin yeri sürükleyerek işaretle.',
    'Kaydederken bu sayfa resme çevrilir: işaretli yerdeki bilgi dosyadan gerçekten silinir; bu sayfadaki yazılar artık seçilemez.'],
};

export function editorIsOpen() {
  return ed.open;
}

export function initEditor({ onClose }) {
  ed.onClose = onClose;
  for (const b of document.querySelectorAll('#editor [data-tool]')) {
    b.addEventListener('click', () => {
      if (b.dataset.tool === 'image') pickImage();
      else setTool(b.dataset.tool);
    });
  }
  $('#ed-done').addEventListener('click', closeEditor);
  $('#ed-undo').addEventListener('click', () => { commitTyping(); undo(); });
  $('#ed-redo').addEventListener('click', () => { commitTyping(); redo(); });
  $('#ed-zoom-in').addEventListener('click', () => setZoom(ed.z * 1.25));
  $('#ed-zoom-out').addEventListener('click', () => setZoom(ed.z / 1.25));
  $('#ed-prev').addEventListener('click', () => gotoRelative(-1));
  $('#ed-next').addEventListener('click', () => gotoRelative(1));
  $('#image-input').addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (f) await addImageFile(f);
  });

  const pg = $('#ed-page');
  pg.addEventListener('pointerdown', onPointerDown);
  pg.addEventListener('dblclick', (ev) => {
    const node = ev.target.closest('[data-edit]');
    const e = node && page()?.edits.find((x) => x.id === node.dataset.edit);
    if (e?.type === 'text') startTypingExisting(e);
  });

  // Düzenleyiciye görsel sürükle-bırak
  const stage = $('#ed-stage');
  stage.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types?.includes('Files')) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'copy';
  });
  stage.addEventListener('drop', async (ev) => {
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    ev.preventDefault();
    ev.stopPropagation();
    const r = $('#ed-page').getBoundingClientRect();
    await addImageFile(f, { x: (ev.clientX - r.left) / ed.z, y: (ev.clientY - r.top) / ed.z });
  });

  // Özellikler
  $('#p-size').addEventListener('change', (ev) => {
    const v = clamp(parseFloat(String(ev.target.value).replace(',', '.')) || ed.defaults.size, 4, 200);
    ev.target.value = String(v);
    applyProp((e) => { e.size = v; }, () => { ed.defaults.size = v; });
  });
  $('#p-bold').addEventListener('click', () => {
    const e = selected();
    const v = !(e?.type === 'text' ? e.bold : ed.defaults.bold);
    applyProp((x) => { x.bold = v; }, () => { ed.defaults.bold = v; });
  });
  $('#p-family').addEventListener('change', (ev) => {
    const v = ev.target.value === 'serif' ? 'serif' : 'sans';
    applyProp((e) => { e.family = v; }, () => { ed.defaults.family = v; });
  });
  // Kalın düğmesi yazı kutusundan odağı çalmasın (yazarken de basılabilsin)
  $('#p-bold').addEventListener('mousedown', (ev) => ev.preventDefault());
  const color = $('#p-color');
  color.addEventListener('input', () => {
    const e = selected();
    if (ed.typing) {
      ed.typing.edit.color = color.value;
      if (ed.typing.mode === 'new') ed.defaults.color = color.value;
      styleTextarea();
    } else if (e && (e.type === 'text' || e.type === 'rect')) {
      ed.colorGesture ||= beginGesture();
      e.color = color.value;
      renderOverlays();
    } else if (ed.tool === 'rect') ed.rectColor = color.value;
    else ed.defaults.color = color.value;
  });
  color.addEventListener('change', () => {
    ed.colorGesture?.end(true);
    ed.colorGesture = null;
  });
  $('#p-delete').addEventListener('click', deleteSelected);

  onChange(() => {
    if (ed.open) refreshAfterChange();
  });
  window.addEventListener('resize', () => {
    if (ed.open) renderOverlays();
  });
}

function applyProp(onEdit, onDefault) {
  if (ed.typing) {
    // yazarken: değişiklik yazıyla birlikte kaydedilir
    onEdit(ed.typing.edit);
    measureTextEdit(ed.typing.edit);
    if (ed.typing.mode === 'new') onDefault();
    styleTextarea();
    syncProps();
    return;
  }
  const e = selected();
  if (e && e.type === 'text') {
    mutate(() => {
      const x = page().edits.find((y) => y.id === e.id);
      onEdit(x);
      measureTextEdit(x);
    });
  } else {
    onDefault();
    syncProps();
  }
}

export async function openEditor(pageId) {
  const ed_ = $('#editor');
  ed.open = true;
  ed_.hidden = false;
  document.body.classList.add('editor-open');
  setTool('select');
  await loadPage(pageId, true);
  $('#ed-done').focus();
}

export function closeEditor() {
  if (!ed.open) return;
  commitTyping();
  ed.open = false;
  ed.pageId = null;
  ed.sel = null;
  $('#editor').hidden = true;
  document.body.classList.remove('editor-open');
  ed.onClose?.();
}

async function loadPage(pageId, fit = false) {
  commitTyping();
  ed.pageId = pageId;
  ed.sel = null;
  const p = page();
  if (!p) return closeEditor();
  ed.proxy = await pageProxy(p);
  ed.R = await totalRotation(p);
  const vp = viewport(ed.proxy, ed.R);
  ed.W = vp.width;
  ed.H = vp.height;
  ed.runs = await extractRuns(p, ed.proxy);
  if (fit) fitZoom();
  await renderCanvas();
  renderOverlays();
  updateNav();
}

async function refreshAfterChange() {
  const p = page();
  if (!p) return closeEditor();
  const R = await totalRotation(p);
  if (R !== ed.R) {
    ed.R = R;
    const vp = viewport(ed.proxy, R);
    ed.W = vp.width;
    ed.H = vp.height;
    await renderCanvas();
  }
  if (ed.sel && !selected()) ed.sel = null;
  renderOverlays();
  updateNav();
}

function updateNav() {
  const i = pageIndex(ed.pageId);
  $('#ed-pageno').textContent = `${i + 1} / ${state.pages.length}`;
  $('#ed-prev').disabled = i <= 0;
  $('#ed-next').disabled = i >= state.pages.length - 1;
  $('#ed-undo').disabled = !canUndo();
  $('#ed-redo').disabled = !canRedo();
  $('#ed-zoom').textContent = `%${Math.round(ed.z * 100)}`;
}

function gotoRelative(d) {
  const i = pageIndex(ed.pageId) + d;
  if (i < 0 || i >= state.pages.length) return;
  loadPage(state.pages[i].id, true);
}

function fitZoom() {
  const stage = $('#ed-stage');
  const avail = Math.max(200, stage.clientWidth - 48);
  ed.z = clamp(avail / ed.W, 0.3, 1.75);
}

async function setZoom(z) {
  commitTyping();
  ed.z = clamp(z, 0.25, 5);
  await renderCanvas();
  renderOverlays();
  updateNav();
}

async function renderCanvas() {
  const token = ++ed.renderToken;
  const off = document.createElement('canvas');
  await renderBase(ed.proxy, off, ed.R, ed.z * dpr());
  if (token !== ed.renderToken) return;
  const cv = $('#ed-canvas');
  cv.width = off.width;
  cv.height = off.height;
  cv.getContext('2d').drawImage(off, 0, 0);
  const w = `${ed.W * ed.z}px`;
  const h = `${ed.H * ed.z}px`;
  cv.style.width = w;
  cv.style.height = h;
  const pg = $('#ed-page');
  pg.style.width = w;
  pg.style.height = h;
}

// ---------------------------------------------------------------- mevcut yazılar

const runCache = new Map(); // "doc:index" → runs
async function extractRuns(p, proxy) {
  const key = `${p.doc}:${p.index}`;
  if (runCache.has(key)) return runCache.get(key);
  const tc = await proxy.getTextContent();
  const runs = [];
  let cur = null;
  for (const it of tc.items) {
    if (typeof it.str !== 'string') continue;
    const [a, b, c, d, tx, ty] = it.transform;
    const size = Math.hypot(c, d);
    const ang = (Math.atan2(b, a) * 180) / Math.PI;
    const snapped = Math.round(ang / 90) * 90;
    if (!it.str || size < 1 || Math.abs(ang - snapped) > 1.5) {
      if (it.hasEOL || it.str) cur = null;
      continue;
    }
    const rot = norm(snapped);
    const [bx, by] = viewport(proxy, rot).convertToViewportPoint(tx, ty);
    if (!it.str.trim()) {
      if (cur) cur.space = true;
      if (it.hasEOL) cur = null;
      continue;
    }
    const st = tc.styles[it.fontName] || {};
    const join = cur && cur.rot === rot && cur.fontName === it.fontName &&
      Math.abs(cur.size - size) < 0.05 * size && Math.abs(cur.by - by) < 0.2 * size &&
      bx >= cur.x + cur.w - 0.5 * size && bx - (cur.x + cur.w) < 1.2 * size;
    if (join) {
      const gap = bx - (cur.x + cur.w);
      if ((cur.space || gap > 0.15 * size) && !cur.text.endsWith(' ') && !it.str.startsWith(' ')) cur.text += ' ';
      cur.text += it.str;
      cur.w = bx + it.width - cur.x;
      cur.space = false;
    } else {
      cur = {
        key: String(runs.length), rot, fontName: it.fontName, size, x: bx, by, w: it.width, text: it.str,
        asc: clamp(st.ascent ?? 0.8, 0.5, 1.1), desc: clamp(-(st.descent ?? -0.2), 0.1, 0.5),
        serifHint: st.fontFamily === 'serif', space: false,
      };
      runs.push(cur);
    }
    if (it.hasEOL) cur = null;
  }
  for (const r of runs) {
    r.text = r.text.replace(/\s+$/, '');
    r.box = { x: r.x, y: r.by - r.asc * r.size, w: Math.max(r.w, 1), h: (r.asc + r.desc) * r.size };
  }
  runCache.set(key, runs);
  return runs;
}

/** Yazının yazı tipi kalın mı, tırnaklı mı? (pdf.js sayfayı çizdikten sonra bilinir) */
function fontInfo(run) {
  let bold = false;
  let serif = run.serifHint;
  try {
    if (ed.proxy.commonObjs.has(run.fontName)) {
      const f = ed.proxy.commonObjs.get(run.fontName);
      const name = String(f.name || '');
      bold = !!(f.bold || f.black) || /bold|black|heavy|semibold|demi/i.test(name);
      if (/times|georgia|garamond|cambria|palatino|minion|bookman|serif/i.test(name) && !/sans/i.test(name)) serif = true;
      if (/arial|helvetica|calibri|verdana|tahoma|segoe|sans/i.test(name)) serif = false;
    }
  } catch {
    /* bilinmiyorsa varsayılan */
  }
  return { bold, family: serif ? 'serif' : 'sans' };
}

/** Hızlı renk örneği: ekranda zaten çizili olan tuvalden. Yazı kutusu beklemeden açılsın diye. */
function sampleFromCanvas(run) {
  try {
    const disp = mapBox(ed.proxy, run.rot, ed.R, run.box);
    const s = ed.z * dpr();
    const cv = $('#ed-canvas');
    const pad = Math.max(2, Math.round(0.25 * run.size * s));
    const x0 = clamp(Math.floor(disp.x * s) - pad, 0, cv.width - 2);
    const y0 = clamp(Math.floor(disp.y * s) - pad, 0, cv.height - 2);
    const w = clamp(Math.ceil(disp.w * s) + 2 * pad, 1, cv.width - x0);
    const h = clamp(Math.ceil(disp.h * s) + 2 * pad, 1, cv.height - y0);
    const data = cv.getContext('2d').getImageData(x0, y0, w, h).data;
    return renkleriAyikla(data, w, h, pad);
  } catch {
    return { bg: '#ffffff', fg: '#000000' };
  }
}

/** Yazının zemin ve yazı rengini sayfanın yüksek çözünürlüklü görüntüsünden ölç. */
async function sampleColors(run) {
  const disp = mapBox(ed.proxy, run.rot, ed.R, run.box);
  const S = clamp(48 / (run.size * 0.7), 3, 12); // büyük harf ≈ 48 piksel olacak kadar yakın
  const pad = Math.ceil(0.35 * run.size * S) + 2;
  const x0 = Math.floor(disp.x * S) - pad;
  const y0 = Math.floor(disp.y * S) - pad;
  const w = Math.ceil(disp.w * S) + 2 * pad;
  const h = Math.ceil(disp.h * S) + 2 * pad;
  const cv = document.createElement('canvas');
  cv.width = clamp(w, 1, 4000);
  cv.height = clamp(h, 1, 4000);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const vp = ed.proxy.getViewport({ scale: S, rotation: ed.R });
  await ed.proxy.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -x0, -y0] }).promise;
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const sonuc = renkleriAyikla(data, cv.width, cv.height, pad);
  cv.width = cv.height = 0;
  return sonuc;
}

/** Piksellerden zemin ve yazı rengini çıkar: zemin = çerçevedeki en sık renk,
 *  yazı = zemine en uzak piksellerin ortalaması (kenar yumuşatması hariç). */
function renkleriAyikla(data, W, H, pad) {
  const inner = (x, y) => x >= pad && y >= pad && x < W - pad && y < H - pad;
  const buckets = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inner(x, y)) continue;
      const i = (y * W + x) * 4;
      const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const bk = buckets.get(k) || [0, 0, 0, 0];
      bk[0]++; bk[1] += data[i]; bk[2] += data[i + 1]; bk[3] += data[i + 2];
      buckets.set(k, bk);
    }
  }
  let bg = [255, 255, 255];
  let best = 0;
  for (const bk of buckets.values()) if (bk[0] > best) { best = bk[0]; bg = [bk[1] / bk[0], bk[2] / bk[0], bk[3] / bk[0]]; }
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  let maxD = 0;
  for (let y = pad; y < H - pad; y++) for (let x = pad; x < W - pad; x++) maxD = Math.max(maxD, dist((y * W + x) * 4));
  let fg = [0, 0, 0];
  if (maxD > 40) {
    const s = [0, 0, 0, 0];
    for (let y = pad; y < H - pad; y++) {
      for (let x = pad; x < W - pad; x++) {
        const i = (y * W + x) * 4;
        if (dist(i) >= 0.8 * maxD) { s[0]++; s[1] += data[i]; s[2] += data[i + 1]; s[3] += data[i + 2]; }
      }
    }
    fg = [s[1] / s[0], s[2] / s[0], s[3] / s[0]];
  }
  return { bg: rgbToHex(bg), fg: rgbToHex(fg) };
}

// ---------------------------------------------------------------- araçlar

function setTool(t) {
  commitTyping();
  ed.tool = t;
  for (const b of document.querySelectorAll('#editor [data-tool]')) {
    b.classList.toggle('active', b.dataset.tool === t);
    b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  }
  $('#ed-page').dataset.tool = t;
  const [a, b] = HINTS[t] || HINTS.select;
  $('#ed-hint').replaceChildren(el('span', {}, a), b ? el('span', { class: b.startsWith('⚠') ? 'warn' : 'muted' }, b) : '');
  $('#ed-hint').dataset.tool = t;
  if (t !== 'select') ed.sel = null;
  if (ed.open) renderOverlays();
  if (t === 'redact' && !ed.seenRedactInfo) {
    ed.seenRedactInfo = true;
    modal({
      title: 'Kalıcı karart nasıl çalışır?',
      body: 'İşaretlediğin yerler siyaha boyanır ve kaydederken BU SAYFA resme çevrilir. ' +
        'Böylece altındaki yazı dosyadan gerçekten silinir; kopyalanamaz, aranamaz, geri getirilemez.\n\n' +
        'Bedeli: bu sayfadaki bütün yazılar resme dönüşür (seçilemez, aranamaz). Diğer sayfalar etkilenmez.',
      buttons: [{ label: 'Anladım', value: true, kind: 'primary' }],
    });
  }
}

function pickImage() {
  commitTyping();
  $('#image-input').click();
}

async function addImageFile(file, at) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (type !== 'jpg' && type !== 'png') {
      await errorModal('Görsel eklenemedi', `“${file.name}” bir JPG ya da PNG görsel değil.`);
      return;
    }
    const asset = await createAsset(bytes, type, file.name);
    // Doğal boyut (96 dpi varsayımıyla), sayfanın %40 genişliğini geçmesin
    let w = asset.width * 0.75;
    let h = asset.height * 0.75;
    const k = Math.min(1, (ed.W * 0.4) / w, (ed.H * 0.4) / h);
    w *= k;
    h *= k;
    const vis = visibleCenter();
    const cx = at ? at.x : vis.x;
    const cy = at ? at.y : vis.y;
    const e = { id: uid('e'), type: 'image', rot: ed.R, asset: asset.id,
      x: clamp(cx - w / 2, 0, ed.W - w), y: clamp(cy - h / 2, 0, ed.H - h), w, h };
    mutate(() => page().edits.push(e));
    setTool('select');
    ed.sel = e.id;
    renderOverlays();
  } catch (err) {
    await errorModal('Görsel eklenemedi', String(err?.message || err));
  }
}

/** Sayfanın şu an ekranda görünen kısmının ortası (nokta cinsinden). */
function visibleCenter() {
  const s = $('#ed-stage').getBoundingClientRect();
  const p = $('#ed-page').getBoundingClientRect();
  const x0 = Math.max(s.left, p.left);
  const x1 = Math.min(s.right, p.right);
  const y0 = Math.max(s.top, p.top);
  const y1 = Math.min(s.bottom, p.bottom);
  if (x1 <= x0 || y1 <= y0) return { x: ed.W / 2, y: ed.H / 2 };
  return { x: ((x0 + x1) / 2 - p.left) / ed.z, y: ((y0 + y1) / 2 - p.top) / ed.z };
}

function deleteSelected() {
  const e = selected();
  if (!e) return;
  mutate(() => {
    const p = page();
    p.edits = p.edits.filter((x) => x.id !== e.id && !(x.role === 'cover' && x.linked === e.id));
  });
  ed.sel = null;
  renderOverlays();
}

// ---------------------------------------------------------------- çizim

function renderOverlays() {
  const p = page();
  if (!p || !ed.proxy) return;
  const z = ed.z;
  const covered = new Set(p.edits.filter((e) => e.runKey != null).map((e) => e.runKey));
  const hits = ed.runs.filter((r) => !covered.has(r.key)).map((r) => {
    const b = mapBox(ed.proxy, r.rot, ed.R, r.box);
    return el('div', {
      class: 'text-hit', 'data-run': r.key, 'data-text': r.text, title: 'Değiştirmek için tıkla',
      role: 'button', 'aria-label': `Değiştir: ${r.text}`,
      style: `left:${b.x * z}px;top:${b.y * z}px;width:${b.w * z}px;height:${b.h * z}px`,
    });
  });
  $('#ed-textlayer').replaceChildren(...hits);
  $('#ed-edits').replaceChildren(...p.edits.map(editNode));
  syncProps();
  updateNav();
}

function editNode(e) {
  const z = ed.z;
  const b = mapBox(ed.proxy, e.rot, ed.R, e);
  const delta = norm(ed.R - e.rot);
  const isSel = e.id === ed.sel;
  const outer = el('div', {
    class: `edit edit-${e.type}${e.role ? ` role-${e.role}` : ''}${isSel ? ' selected' : ''}`,
    'data-edit': e.id,
    style: `left:${b.x * z}px;top:${b.y * z}px;width:${b.w * z}px;height:${b.h * z}px`,
  });
  if (ed.typing?.editId === e.id) outer.style.visibility = 'hidden';
  const inner = el('div', {
    class: 'edit-inner',
    style: `width:${e.w * z}px;height:${e.h * z}px;left:${((b.w - e.w) * z) / 2}px;top:${((b.h - e.h) * z) / 2}px;` +
      (delta ? `transform:rotate(${delta}deg);` : ''),
  });
  if (e.type === 'rect') {
    inner.style.background = e.role === 'redact' ? '#000' : e.color;
    if (e.role === 'redact') inner.append(el('span', { class: 'redact-label' }, 'karartılacak'));
  } else if (e.type === 'image') {
    const a = state.assets.get(e.asset);
    inner.append(el('img', { src: a?.url, alt: '', draggable: 'false' }));
  } else if (e.type === 'text') {
    inner.append(textSpan(e));
  }
  outer.append(inner);
  if (isSel && e.role !== 'cover') {
    outer.append(el('div', { class: 'handle', title: 'Boyutlandır' }));
  }
  return outer;
}

function textSpan(e) {
  const f = fontOf(e);
  const z = ed.z;
  return el('span', {
    class: 'edit-text',
    style: `font-family:${f.cssFamily};font-weight:${f.weight};font-size:${e.size * z}px;` +
      `line-height:${LINE_HEIGHT * e.size * z}px;color:${e.color};top:${(f.asc - f.cssBaseline) * e.size * z}px`,
  }, String(e.text));
}

function syncProps() {
  const e = selected();
  const textMode = e ? e.type === 'text' : ed.tool === 'text' || !!ed.typing;
  const colorMode = e ? e.type === 'text' || (e.type === 'rect' && e.role !== 'redact') : ['text', 'rect'].includes(ed.tool) || !!ed.typing;
  const src = ed.typing?.edit || (e?.type === 'text' ? e : ed.defaults);
  for (const n of document.querySelectorAll('#ed-props .prop-text')) n.classList.toggle('off', !textMode);
  for (const n of document.querySelectorAll('#ed-props .prop-color')) n.classList.toggle('off', !colorMode);
  $('#p-delete').classList.toggle('off', !e);
  if (document.activeElement !== $('#p-size')) $('#p-size').value = String(Math.round(src.size * 10) / 10);
  $('#p-bold').setAttribute('aria-pressed', String(!!src.bold));
  $('#p-bold').classList.toggle('on', !!src.bold);
  $('#p-family').value = src.family === 'serif' ? 'serif' : 'sans';
  const col = ed.typing ? src.color : e ? e.color : ed.tool === 'rect' ? ed.rectColor : src.color;
  if (col && !ed.colorGesture) $('#p-color').value = col;
}

// ---------------------------------------------------------------- fare

function pagePoint(ev) {
  const r = $('#ed-page').getBoundingClientRect();
  return { x: (ev.clientX - r.left) / ed.z, y: (ev.clientY - r.top) / ed.z };
}

function onPointerDown(ev) {
  if (ev.button !== 0) return;
  if (ed.typing) {
    if (ev.target === ed.typing.ta) return;
    commitTyping();
  }
  const node = ev.target.closest('[data-edit]');
  const p = page();
  const e = node && p.edits.find((x) => x.id === node.dataset.edit);
  if (e && e.role !== 'cover') {
    ev.preventDefault();
    const wasSelected = ed.sel === e.id;
    ed.sel = e.id;
    renderOverlays();
    if (ev.target.classList.contains('handle')) startResize(ev, e);
    else startMove(ev, e, wasSelected);
    return;
  }
  const hit = ev.target.closest('.text-hit');
  if (hit && ed.tool === 'select') {
    ev.preventDefault();
    startReplace(ed.runs[Number(hit.dataset.run)]);
    return;
  }
  if (ed.tool === 'select') {
    if (ed.sel) { ed.sel = null; renderOverlays(); }
  } else if (ed.tool === 'text') {
    ev.preventDefault();
    const pt = pagePoint(ev);
    const f = fontOf(ed.defaults);
    startTypingNew({ x: pt.x, y: pt.y - f.asc * ed.defaults.size * 0.7 });
  } else if (ed.tool === 'rect' || ed.tool === 'redact') {
    ev.preventDefault();
    startDrawRect(ev);
  }
}

function track(ev, onMove, onUp) {
  const target = ev.target;
  try { target.setPointerCapture(ev.pointerId); } catch { /* yok */ }
  const move = (m) => onMove(m);
  const up = (u) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onUp(u);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function startMove(ev, e, wasSelected) {
  const g = beginGesture();
  const x0 = ev.clientX;
  const y0 = ev.clientY;
  const orig = mapBox(ed.proxy, e.rot, ed.R, e);
  const node = $(`#ed-edits [data-edit="${e.id}"]`);
  let moved = false;
  track(ev, (m) => {
    const dx = (m.clientX - x0) / ed.z;
    const dy = (m.clientY - y0) / ed.z;
    if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 3) return;
    moved = true;
    const back = mapBox(ed.proxy, ed.R, e.rot, { ...orig, x: orig.x + dx, y: orig.y + dy });
    e.x = back.x;
    e.y = back.y;
    node.style.left = `${(orig.x + dx) * ed.z}px`;
    node.style.top = `${(orig.y + dy) * ed.z}px`;
  }, () => {
    g.end(moved);
    if (!moved && wasSelected && e.type === 'text') startTypingExisting(e);
  });
}

function startResize(ev, e) {
  const g = beginGesture();
  const x0 = ev.clientX;
  const y0 = ev.clientY;
  const ob = mapBox(ed.proxy, e.rot, ed.R, e);
  const origSize = e.size;
  let changed = false;
  track(ev, (m) => {
    changed = true;
    let nw = Math.max(4, ob.w + (m.clientX - x0) / ed.z);
    let nh = Math.max(4, ob.h + (m.clientY - y0) / ed.z);
    if (e.type === 'text') {
      const k = nh / ob.h;
      e.size = clamp(Math.round(origSize * k * 2) / 2, 4, 300);
      measureTextEdit(e);
      const nb = mapBox(ed.proxy, e.rot, ed.R, e);
      const back = mapBox(ed.proxy, ed.R, e.rot, { ...nb, x: ob.x, y: ob.y });
      e.x = back.x;
      e.y = back.y;
    } else {
      if (e.type === 'image' && !m.shiftKey) {
        const k = Math.max(nw / ob.w, nh / ob.h);
        nw = ob.w * k;
        nh = ob.h * k;
      }
      const back = mapBox(ed.proxy, ed.R, e.rot, { x: ob.x, y: ob.y, w: nw, h: nh });
      Object.assign(e, { x: back.x, y: back.y, w: back.w, h: back.h });
    }
    renderOverlays();
  }, () => g.end(changed));
}

function startDrawRect(ev) {
  const role = ed.tool === 'redact' ? 'redact' : 'shape';
  const p0 = pagePoint(ev);
  const preview = el('div', { class: `edit edit-rect role-${role} drawing` });
  const inner = el('div', { class: 'edit-inner', style: `inset:0;background:${role === 'redact' ? '#000' : ed.rectColor}` });
  preview.append(inner);
  $('#ed-edits').append(preview);
  let box = null;
  track(ev, (m) => {
    const p1 = pagePoint(m);
    const x = clamp(Math.min(p0.x, p1.x), 0, ed.W);
    const y = clamp(Math.min(p0.y, p1.y), 0, ed.H);
    box = { x, y, w: clamp(Math.max(p0.x, p1.x), 0, ed.W) - x, h: clamp(Math.max(p0.y, p1.y), 0, ed.H) - y };
    Object.assign(preview.style, {
      left: `${box.x * ed.z}px`, top: `${box.y * ed.z}px`, width: `${box.w * ed.z}px`, height: `${box.h * ed.z}px`,
    });
  }, () => {
    preview.remove();
    if (!box || box.w < 2 || box.h < 2) return;
    const e = { id: uid('e'), type: 'rect', role, rot: ed.R, ...box, color: role === 'redact' ? '#000000' : ed.rectColor };
    mutate(() => page().edits.push(e));
    ed.sel = e.id;
    renderOverlays();
  });
}

// ---------------------------------------------------------------- yazı kutusu

async function startReplace(run) {
  if (!run) return;
  if (!ed.seenReplaceInfo) {
    ed.seenReplaceInfo = true;
    await modal({
      title: 'Önemli: yazı değiştirme nasıl çalışır?',
      body: 'PDF\'teki bir yazıyı değiştirmek, eski yazının üstünü zemin rengiyle örtüp yenisini aynı yere yazmak demektir.\n\n' +
        'Eski yazı görünmez olur ama DOSYANIN İÇİNDE KALIR: kopyala-yapıştırla ya da basit programlarla hâlâ okunabilir.\n\n' +
        'Gizli bir bilgiyi (kimlik no, hesap no, adres…) silmek istiyorsan “Kalıcı karart”ı kullan.',
      buttons: [{ label: 'Anladım', value: true, kind: 'primary' }],
    });
  }
  const { bold, family } = fontInfo(run);
  const { bg, fg } = sampleFromCanvas(run); // hemen: yazı kutusu beklemesin
  const f = fontOf({ bold, family });
  const edit = {
    id: uid('e'), type: 'text', rot: run.rot, text: run.text, size: Math.round(run.size * 100) / 100,
    color: fg, bold, family, runKey: run.key,
    x: run.box.x, y: run.by - f.asc * run.size,
  };
  measureTextEdit(edit);
  const padX = 0.04 * run.size;
  const top = Math.max(run.asc, 0.88) * run.size;
  const bottom = Math.max(run.desc, 0.2) * run.size;
  const cover = {
    id: uid('e'), type: 'rect', role: 'cover', rot: run.rot, color: bg, runKey: run.key, linked: edit.id,
    x: run.box.x - padX, y: run.by - top - 0.02 * run.size, w: run.box.w + 2 * padX, h: top + bottom + 0.04 * run.size,
  };
  openTyping({ mode: 'replace', edit, cover, original: run.text });
  // Renkleri yüksek çözünürlüklü örnekle iyileştir; kullanıcı rengi elle değiştirdiyse dokunma.
  sampleColors(run).then(({ bg: bg2, fg: fg2 }) => {
    const t = ed.typing;
    if (!t || t.edit !== edit) return;
    if (edit.color === fg) edit.color = fg2;
    if (cover.color === bg) {
      cover.color = bg2;
      if (t.coverNode) t.coverNode.style.background = bg2;
    }
    t.initialSig = styleSig(edit);
    styleTextarea();
    syncProps();
  }).catch(() => { /* örnekleme başarısızsa ekrandan alınan renk kalır */ });
}

function startTypingNew(pt) {
  const d = ed.defaults;
  const edit = { id: uid('e'), type: 'text', rot: ed.R, text: '', size: d.size, color: d.color, bold: d.bold, family: d.family,
    x: clamp(pt.x, 0, ed.W - 4), y: clamp(pt.y, 0, ed.H - 4) };
  measureTextEdit(edit);
  openTyping({ mode: 'new', edit });
}

function startTypingExisting(e) {
  openTyping({ mode: 'existing', edit: structuredClone(e), editId: e.id, original: e.text });
}

function openTyping(t) {
  const ta = el('textarea', {
    class: 'ed-typing', spellcheck: 'false', autocomplete: 'off', wrap: 'off', rows: '1',
    'aria-label': 'Yazı', 'data-mode': t.mode,
  });
  ta.value = t.edit.text;
  ed.typing = { ...t, ta, initialSig: styleSig(t.edit) };
  if (t.cover) {
    const b = mapBox(ed.proxy, t.cover.rot, ed.R, t.cover);
    const prev = el('div', { class: 'cover-preview',
      style: `left:${b.x * ed.z}px;top:${b.y * ed.z}px;width:${b.w * ed.z}px;height:${b.h * ed.z}px;background:${t.cover.color}` });
    ed.typing.coverNode = prev;
    $('#ed-page').append(prev);
  }
  $('#ed-page').append(ta);
  renderOverlays(); // düzenlenen öğeyi gizle
  styleTextarea();
  ta.addEventListener('input', () => {
    ed.typing.edit.text = ta.value;
    measureTextEdit(ed.typing.edit);
    styleTextarea();
  });
  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitTyping(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); cancelTyping(); }
  });
  ta.addEventListener('blur', () => setTimeout(() => { if (ed.typing?.ta === ta) commitTyping(); }, 0));
  const odakla = () => {
    if (ed.typing?.ta !== ta || document.activeElement === ta) return;
    ta.focus();
    if (t.mode === 'replace' || t.mode === 'existing') ta.select();
  };
  ta.focus();
  if (t.mode === 'replace' || t.mode === 'existing') ta.select();
  requestAnimationFrame(odakla);   // pencere/çerçeve odağı geç gelirse
  setTimeout(odakla, 60);
  syncProps();
}

function styleTextarea() {
  const t = ed.typing;
  if (!t) return;
  const e = t.edit;
  const f = fontOf(e);
  const z = ed.z;
  const b = mapBox(ed.proxy, e.rot, ed.R, e);
  const upright = norm(ed.R - e.rot) === 0;
  const lines = String(e.text).split('\n').length;
  const w = Math.max(e.w, textWidth(f, 'M', e.size) * 2) * z + 6;
  const h = lines * LINE_HEIGHT * e.size * z;
  // taban çizgisi PDF'tekiyle aynı yerde olsun
  let top = (e.y + f.asc * e.size - f.cssBaseline * e.size) * z;
  let left = e.x * z - 1;
  if (!upright) {
    // Yazı sayfada yan duruyor: kutuyu dik olarak hemen yanında aç, sayfanın dışına taşırma
    top = clamp(b.y * z - h - 8, 0, Math.max(0, ed.H * z - h - 4));
    left = clamp(b.x * z, 0, Math.max(0, ed.W * z - w - 4));
  }
  Object.assign(t.ta.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${w}px`,
    height: `${h + 2}px`,
    fontFamily: f.cssFamily,
    fontWeight: String(f.weight),
    fontSize: `${e.size * z}px`,
    lineHeight: `${LINE_HEIGHT * e.size * z}px`,
    color: e.color,
    background: t.cover ? t.cover.color : 'rgba(255,255,255,.75)',
  });
}

function closeTyping() {
  const t = ed.typing;
  ed.typing = null;
  t.ta.remove();
  t.coverNode?.remove();
  return t;
}

function cancelTyping() {
  if (!ed.typing) return;
  closeTyping();
  renderOverlays();
}

const styleSig = (e) => JSON.stringify([e.text, e.size, e.bold, e.family, e.color]);

export function commitTyping() {
  if (!ed.typing) return;
  const t = closeTyping();
  const text = t.ta.value.replace(/\r/g, '');
  const e = t.edit;
  e.text = text;
  measureTextEdit(e);
  const changed = styleSig(e) !== t.initialSig;
  if (t.mode === 'new') {
    if (text.trim()) {
      mutate(() => page().edits.push(e));
      ed.sel = e.id;
    }
  } else if (t.mode === 'replace') {
    if (changed) {
      mutate(() => {
        const p = page();
        p.edits.push(t.cover);
        if (text.trim()) p.edits.push(e);
      });
      if (text.trim()) ed.sel = e.id;
    }
  } else if (t.mode === 'existing' && changed) {
    mutate(() => {
      const p = page();
      const i = p.edits.findIndex((x) => x.id === t.editId);
      if (i < 0) return;
      const { size, bold, family, color, w, h } = e;
      if (text.trim()) p.edits[i] = { ...p.edits[i], text, size, bold, family, color, w, h };
      else p.edits.splice(i, 1); // değişen yazı boşaltıldıysa örtü kalır: eski yazı gizli kalır
    });
  }
  renderOverlays();
}

// ---------------------------------------------------------------- klavye

export function editorKey(ev) {
  if (!ed.open || ed.typing) return false;
  const e = selected();
  if (ev.key === 'Escape') {
    if (e) { ed.sel = null; renderOverlays(); } else closeEditor();
    return true;
  }
  if (!e) return false;
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    deleteSelected();
    return true;
  }
  const step = ev.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (d) {
    mutate(() => {
      const x = page().edits.find((y) => y.id === e.id);
      const b = mapBox(ed.proxy, x.rot, ed.R, x);
      const back = mapBox(ed.proxy, ed.R, x.rot, { ...b, x: b.x + d[0], y: b.y + d[1] });
      x.x = back.x;
      x.y = back.y;
    });
    return true;
  }
  if (e.type === 'text' && ev.key === 'Enter') {
    startTypingExisting(e);
    return true;
  }
  return false;
}

export function editorAddImage(file) {
  return addImageFile(file);
}
