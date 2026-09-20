// Uygulama durumu ve geri al / ileri al.
//
// docs   : açılan kaynak dosyalar (baytlar, pdf.js ve pdf-lib nesneleri) — değişmez
// assets : eklenen görseller — değişmez
// pages  : sayfa listesi — geri alınabilen TEK şey bu; her değişiklikten önce kopyası saklanır
//          { id, doc, index, rot, edits: [...] }

export const state = {
  docs: new Map(),
  assets: new Map(),
  pages: [],
  firstName: null, // çıktı adı bundan türetilir
  dirty: false,
};

let seq = 0;
export const uid = (p) => `${p}${(++seq).toString(36)}`;

const undoStack = [];
const redoStack = [];
const listeners = new Set();
const MAX_HISTORY = 200;

export function onChange(fn) {
  listeners.add(fn);
}
export function emit() {
  for (const fn of listeners) fn();
}

const snapshot = () => structuredClone(state.pages);

function record(snap) {
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

/** Geri alınabilir bir değişiklik yap. */
export function mutate(fn) {
  record(snapshot());
  fn(state.pages);
  state.dirty = true;
  emit();
}

/** Sürükleme gibi çok adımlı işlemler: başta kopya al, sonunda gerçekten değiştiyse kaydet. */
export function beginGesture() {
  const snap = snapshot();
  return {
    end(changed) {
      if (!changed) return;
      record(snap);
      state.dirty = true;
      emit();
    },
  };
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  state.pages = undoStack.pop();
  state.dirty = true;
  emit();
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  state.pages = redoStack.pop();
  state.dirty = true;
  emit();
  return true;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

export const findPage = (id) => state.pages.find((p) => p.id === id);
export const pageIndex = (id) => state.pages.findIndex((p) => p.id === id);

/** Sayfanın pdf.js nesnesi (önbellekli). */
export async function pageProxy(page) {
  const doc = state.docs.get(page.doc);
  doc.proxies ||= new Map();
  let p = doc.proxies.get(page.index);
  if (!p) {
    p = doc.pdf.getPage(page.index + 1);
    doc.proxies.set(page.index, p);
  }
  return p;
}

export async function totalRotation(page) {
  const proxy = await pageProxy(page);
  return (((proxy.rotate + page.rot) % 360) + 360) % 360;
}
