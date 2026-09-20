// PDF Kutusu — giriş noktası.
import { state, mutate, onChange, uid, undo, redo, canUndo, canRedo, pageProxy, totalRotation } from './state.js';
import { initPdfjs, openPdfBytes, sniffType, OpenError } from './pdfengine.js';
import { loadFonts } from './fonts.js';
import { createAsset, imagePagePdf, blankPagePdf } from './images.js';
import { parseRanges } from './ranges.js';
import { buildPdf, outputName, downloadBytes } from './save.js';
import { initGrid, renderGrid } from './grid.js';
import { initEditor, openEditor, editorIsOpen, editorKey, editorAddImage, commitTyping } from './pageeditor.js';
import { viewport } from './geom.js';
import { $, el, toast, setStatus, busy, modal, errorModal, confirmModal, formatMB } from './ui.js';

const BIG_FILE = 100 * 1024 * 1024;
const DOC_COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#be185d', '#4d7c0f', '#a16207', '#475569'];
let colorIdx = 0;

// ---------------------------------------------------------------- dosya açma

async function addDoc(bytes, name, kind) {
  const { pdf, lib, libError } = await openPdfBytes(bytes, name);
  const doc = {
    id: uid('d'), name, kind, bytes, pdf, lib, libError, pageCount: pdf.numPages,
    color: kind === 'blank' ? '#94a3b8' : DOC_COLORS[colorIdx++ % DOC_COLORS.length],
    label: kind === 'blank' ? 'Boş sayfa' : name,
  };
  state.docs.set(doc.id, doc);
  if (libError) toast(`“${name}” tam okunamadı; kaydederken sayfaları resim olarak yazılacak.`, 'warn', 7000);
  return doc;
}

const newPage = (doc, index) => ({ id: uid('p'), doc: doc.id, index, rot: 0, edits: [] });

/**
 * Dosyaları aç ve sayfalarını listeye ekle.
 * at: eklenecek konum (null = sona). askRange: çok sayfalı PDF'te hangi sayfaların ekleneceğini sor.
 */
async function openFiles(fileList, at = null, askRange = false) {
  const files = [...fileList];
  if (!files.length) return;

  const accepted = [];
  for (const f of files) {
    if (f.size > BIG_FILE) {
      const ok = await confirmModal('Çok büyük dosya',
        `“${f.name}” ${formatMB(f.size)}. 100 MB'tan büyük dosyalar tarayıcıyı çok yavaşlatabilir, ` +
        `bilgisayarın belleği yetmezse sayfa kapanabilir.\n\nYine de açılsın mı?`, 'Yine de aç', 'Vazgeç');
      if (!ok) continue;
    }
    accepted.push(f);
  }
  if (!accepted.length) return;

  const added = [];
  const errors = [];
  const b = busy('Açılıyor…');
  try {
    for (const [i, file] of accepted.entries()) {
      b.update(accepted.length > 1 ? `Açılıyor… (${i + 1}/${accepted.length}) ${file.name}` : `Açılıyor… ${file.name}`);
      try {
        let bytes;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
        } catch {
          throw new OpenError('read', `“${file.name}” okunamadı. Dosya çok büyük olabilir (bilgisayarın belleği yetmemiş olabilir) ` +
            `ya da dosyaya şu an erişilemiyor. Başka programlarda açıksa kapatıp yeniden dene.`);
        }
        const type = sniffType(bytes);
        let pages;
        if (type === 'pdf') {
          const doc = await addDoc(bytes, file.name, 'pdf');
          let indices = [...Array(doc.pageCount).keys()];
          if (askRange && doc.pageCount > 1) {
            b.done();
            indices = await askPages(doc);
            busy('Açılıyor…');
            if (!indices) continue;
          }
          pages = indices.map((ix) => newPage(doc, ix));
        } else if (type === 'jpg' || type === 'png') {
          const asset = await createAsset(bytes, type, file.name);
          const doc = await addDoc(await imagePagePdf(asset), file.name, 'image');
          pages = [newPage(doc, 0)];
        } else {
          throw new OpenError('type', `“${file.name}” açılamadı: PDF, JPG ya da PNG değil.`);
        }
        if (!state.pages.length && !added.length) state.firstName = file.name;
        added.push(...pages);
      } catch (err) {
        console.error(err);
        errors.push(err);
      }
    }
    if (added.length) {
      mutate((pages) => pages.splice(at ?? pages.length, 0, ...added));
      toast(`${added.length} sayfa eklendi.`);
    }
  } finally {
    b.done();
  }
  for (const err of errors) {
    const encrypted = err instanceof OpenError && err.code === 'encrypted';
    await errorModal(encrypted ? 'Şifreli PDF açılamadı' : 'Dosya açılamadı',
      err instanceof OpenError ? err.message : `Beklenmeyen bir hata oldu: ${err?.message || err}`);
  }
}

async function askPages(doc) {
  const input = el('input', { type: 'text', class: 'text-input', placeholder: 'hepsi', 'aria-label': 'Sayfalar' });
  const msg = el('p', { class: 'muted' }, `Boş bırakırsan ${doc.pageCount} sayfanın hepsi eklenir.`);
  let result = null;
  const ok = await modal({
    title: 'Hangi sayfalar eklensin?',
    body: el('div', {}, el('p', {}, `“${doc.name}” dosyasında ${doc.pageCount} sayfa var.`), input,
      el('p', { class: 'muted' }, 'Örnek: 1-3, 7, 10-son'), msg),
    buttons: [{ label: 'Vazgeç', value: false }, { label: 'Ekle', value: true, kind: 'primary' }],
    onOpen: (box, close) => {
      box.querySelector('[data-value="true"]').addEventListener('click', (ev) => {
        try {
          result = input.value.trim() ? parseRanges(input.value, doc.pageCount) : [...Array(doc.pageCount).keys()];
        } catch (err) {
          ev.stopImmediatePropagation();
          msg.textContent = err.message;
          msg.className = 'error-text';
        }
      }, { capture: true });
    },
  });
  return ok ? result : null;
}

// ---------------------------------------------------------------- sayfa ekleme

async function insertBlank(at) {
  // komşu sayfanın ekrandaki boyunda boş sayfa
  const ref = state.pages[Math.max(0, Math.min(at - 1, state.pages.length - 1))];
  let w = 595.28;
  let h = 841.89;
  if (ref) {
    const vp = viewport(await pageProxy(ref), await totalRotation(ref));
    w = vp.width;
    h = vp.height;
  }
  const doc = await addDoc(await blankPagePdf(w, h), 'Boş sayfa', 'blank');
  mutate((pages) => pages.splice(at, 0, newPage(doc, 0)));
}

let pendingInsert = null;
async function onInsert(at) {
  const choice = await modal({
    title: `Buraya sayfa ekle (${at + 1}. sıraya)`,
    body: 'Başka bir PDF\'ten sayfa, bir JPG/PNG görsel ya da boş bir sayfa ekleyebilirsin.',
    buttons: [
      { label: 'Vazgeç', value: null },
      { label: 'Boş sayfa', value: 'blank' },
      { label: 'PDF ya da görsel seç…', value: 'file', kind: 'primary' },
    ],
  });
  if (choice === 'blank') await insertBlank(at);
  else if (choice === 'file') {
    pendingInsert = { at, askRange: true };
    $('#file-input').click();
  }
}

// ---------------------------------------------------------------- kaydet / ayır

async function save() {
  if (!state.pages.length) return;
  commitTyping();
  const name = outputName();
  const b = busy('Kaydediliyor…');
  try {
    const bytes = await buildPdf(state.pages, (i, n) => b.update(`Kaydediliyor… ${i}/${n}`));
    downloadBytes(bytes, name);
    state.dirty = false;
    setStatus(`Kaydedildi: ${name} (${formatMB(bytes.length)})`);
    toast(`“${name}” indirildi.`, 'ok');
  } catch (err) {
    console.error(err);
    await errorModal('Kaydedilemedi', `PDF oluşturulurken bir hata oldu:\n${err?.message || err}`);
  } finally {
    b.done();
  }
}

async function split() {
  if (!state.pages.length) return;
  commitTyping();
  const n = state.pages.length;
  const input = el('input', { type: 'text', class: 'text-input', value: `1-${Math.min(n, 3)}`, 'aria-label': 'Sayfa aralığı' });
  const info = el('p', { class: 'muted' });
  const check = (yazarken = false) => {
    // Yazarken kızma: "1-" gibi yarım ifadede hata gösterme, örnekle yol göster.
    if (yazarken && (!input.value.trim() || /[-–—,;]\s*$/.test(input.value))) {
      info.textContent = 'Örnek: 1-3, 7, 10-son';
      info.className = 'muted';
      return null;
    }
    try {
      const idx = parseRanges(input.value, n);
      const shown = idx.slice(0, 12).map((i) => i + 1).join(', ') + (idx.length > 12 ? ', …' : '');
      info.textContent = `${idx.length} sayfa: ${shown}`;
      info.className = 'muted';
      return idx;
    } catch (err) {
      info.textContent = err.message;
      info.className = 'error-text';
      return null;
    }
  };
  input.addEventListener('input', () => check(true));
  check();
  let indices = null;
  const ok = await modal({
    title: 'Ayır: seçtiğin sayfaları ayrı PDF olarak indir',
    body: el('div', {},
      el('p', {}, `Listede ${n} sayfa var. Hangi sayfalar ayrı bir PDF olsun?`),
      input,
      el('p', { class: 'muted' }, 'Örnek: 1-3, 7, 10-son · “son” son sayfa demek'),
      info),
    buttons: [{ label: 'Vazgeç', value: false }, { label: 'İndir', value: true, kind: 'primary' }],
    onOpen: (box) => {
      input.select();
      box.querySelector('[data-value="true"]').addEventListener('click', (ev) => {
        indices = check();
        if (!indices) ev.stopImmediatePropagation();
      }, { capture: true });
    },
  });
  if (!ok || !indices) return;
  const expr = input.value.trim().toLocaleLowerCase('tr').replace(/\s+/g, '').replace(/[,;]+/g, '_').replace(/[–—]/g, '-');
  const name = outputName(`_sayfa_${expr}`.slice(0, 60));
  const b = busy('Hazırlanıyor…');
  try {
    const bytes = await buildPdf(indices.map((i) => state.pages[i]), (i, m) => b.update(`Hazırlanıyor… ${i}/${m}`));
    downloadBytes(bytes, name);
    toast(`“${name}” indirildi (${indices.length} sayfa).`, 'ok');
  } catch (err) {
    console.error(err);
    await errorModal('Ayrılamadı', String(err?.message || err));
  } finally {
    b.done();
  }
}

// ---------------------------------------------------------------- yardım

function help() {
  const lic = el('pre', { class: 'licenses', hidden: true }, $('#licenses')?.textContent || '');
  const body = el('div', { class: 'help' },
    el('h3', {}, 'Nasıl kullanılır?'),
    el('ol', {},
      el('li', {}, 'PDF\'ini (ya da birkaçını) pencereye sürükle bırak. JPG/PNG görseller de sayfa olur.'),
      el('li', {}, 'Sayfaları sürükleyerek sırala. Üzerine gelince çıkan düğmelerle döndür, çoğalt, sil.'),
      el('li', {}, 'İki sayfanın arasındaki + ile araya başka bir PDF\'ten sayfa, görsel ya da boş sayfa ekle.'),
      el('li', {}, 'Bir sayfaya çift tıkla: yazı değiştir, yazı/görsel ekle, bir yeri ört ya da kalıcı kararat.'),
      el('li', {}, '“Kaydet” ile hepsini tek PDF olarak indir. “Ayır” ile yalnızca bazı sayfaları indir.')),
    el('h3', {}, 'Bilmen gerekenler'),
    el('ul', {},
      el('li', {}, 'Yazı değiştirmek ve “Örtü kutusu”, eski yazının yalnızca üstünü kapatır; eski yazı dosyanın içinde kalır. Gizli bilgi için “Kalıcı karart” kullan: o sayfa resme çevrilir ve bilgi gerçekten silinir.'),
      el('li', {}, 'E-imzalı (elektronik imzalı) bir PDF\'i düzenlersen imza geçersiz olur.'),
      el('li', {}, 'Şifreli PDF\'ler açılmaz.')),
    el('h3', {}, 'Gizlilik'),
    el('p', {}, 'Dosyaların bilgisayarından çıkmaz; her şey bu tarayıcı penceresinde olur. Bu sayfanın internete bağlanması tarayıcı kuralıyla (Content-Security-Policy) yasaklanmıştır.'),
    el('p', { class: 'muted' }, 'PDF Kutusu — MIT lisanslı, kodu açık. İçinde gömülü: pdf.js (Apache 2.0), pdf-lib (MIT), fontkit (MIT), fflate (MIT), DejaVu yazı tipleri (Bitstream Vera lisansı).'),
    el('button', { class: 'btn', onclick: () => { lic.hidden = !lic.hidden; } }, 'Lisans metinlerini göster'),
    lic);
  modal({ title: 'PDF Kutusu', body, buttons: [{ label: 'Kapat', value: true, kind: 'primary' }] });
}

// ---------------------------------------------------------------- arayüz

function refreshChrome() {
  const has = state.pages.length > 0;
  $('#empty').hidden = has;
  $('#pages-view').hidden = !has;
  $('#app').dataset.state = has ? 'pages' : 'empty';
  for (const b of document.querySelectorAll('.needs-pages')) b.disabled = !has;
  $('#btn-undo').disabled = !canUndo();
  $('#btn-redo').disabled = !canRedo();
  const files = new Set(state.pages.map((p) => p.doc).filter((d) => state.docs.get(d)?.kind === 'pdf')).size;
  $('#pages-count').textContent = `${state.pages.length} sayfa${files > 1 ? ` · ${files} dosyadan` : ''}`;
  if (has) setStatus(`${state.pages.length} sayfa · kaydedince adı: ${outputName()}`);
  else setStatus('Hazır. PDF\'ini sürükle bırak ya da “Dosya ekle”ye tıkla.');
}

const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

function wire() {
  $('#btn-open').addEventListener('click', () => { pendingInsert = null; $('#file-input').click(); });
  $('#btn-open-big').addEventListener('click', () => { pendingInsert = null; $('#file-input').click(); });
  $('#file-input').addEventListener('change', (ev) => {
    const files = [...ev.target.files];
    ev.target.value = '';
    const p = pendingInsert;
    pendingInsert = null;
    openFiles(files, p?.at ?? null, p?.askRange ?? false);
  });
  $('#btn-blank').addEventListener('click', () => insertBlank(state.pages.length));
  $('#btn-split').addEventListener('click', split);
  $('#btn-save').addEventListener('click', save);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-help').addEventListener('click', help);

  // Dosya bırakma: pencerenin herhangi bir yerine
  const app = $('#app');
  document.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types?.includes('Files')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    app.classList.add('dragging-files');
  });
  document.addEventListener('dragleave', (ev) => {
    if (!ev.relatedTarget) app.classList.remove('dragging-files');
  });
  document.addEventListener('drop', (ev) => {
    app.classList.remove('dragging-files');
    if (!ev.dataTransfer?.files?.length) return;
    ev.preventDefault();
    if (editorIsOpen()) {
      editorAddImage(ev.dataTransfer.files[0]);
      return;
    }
    openFiles(ev.dataTransfer.files);
  });

  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('.modal-overlay') || !$('#busy').hidden) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod && k === 's') { ev.preventDefault(); save(); return; }
    if (mod && k === 'o') { ev.preventDefault(); $('#file-input').click(); return; }
    if (isTyping(ev.target)) return;
    if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { ev.preventDefault(); redo(); return; }
    if (editorIsOpen() && editorKey(ev)) ev.preventDefault();
  });

  window.addEventListener('beforeunload', (ev) => {
    if (state.dirty && state.pages.length) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
  window.addEventListener('unhandledrejection', (ev) => {
    console.error(ev.reason);
    toast(`Beklenmeyen hata: ${ev.reason?.message || ev.reason}`, 'error', 8000);
  });
}

async function start() {
  const b = busy('Hazırlanıyor…');
  try {
    const mode = await initPdfjs();
    document.documentElement.dataset.pdfjs = mode;
    await loadFonts();
    initGrid({ onEdit: openEditor, onInsert, onFilesDropped: (files, at) => openFiles(files, at) });
    initEditor({ onClose: () => renderGrid() });
    onChange(() => { renderGrid(); refreshChrome(); });
    wire();
    refreshChrome();
    document.documentElement.dataset.ready = '1';
  } catch (err) {
    console.error(err);
    setStatus('Başlatılamadı');
    await errorModal('PDF Kutusu başlatılamadı',
      `Tarayıcın bu programın ihtiyaç duyduğu bir özelliği desteklemiyor olabilir. Chrome, Edge, Firefox ya da Safari'nin güncel sürümünü dene.\n\n(${err?.message || err})`);
  } finally {
    b.done();
  }
}

start();
