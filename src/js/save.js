// Sayfa listesinden yeni bir PDF üretir (pdf-lib).
import {
  PDFDocument, PDFName, PDFArray, rgb, degrees, pushGraphicsState, popGraphicsState,
} from 'pdf-lib';
import { state, pageProxy, totalRotation } from './state.js';
import { fontkit, fontBytes, FONT_FEATURES, LINE_HEIGHT, fontOf } from './fonts.js';
import { viewport, hexToRgb } from './geom.js';
import { drawAsset, embedAsset } from './images.js';
import { rasterizePage } from './paint.js';

const color = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
};

export const needsRaster = (page) =>
  page.edits.some((e) => e.role === 'redact') || !!state.docs.get(page.doc)?.libError;

/**
 * Sayfanın mevcut içeriğini q … Q arasına al. Böylece kaynak PDF'in içerik akışı
 * grafik durumunu (koordinat dönüşümü, renk) değiştirip bıraksa bile bizim eklediklerimiz kaymaz.
 * Aynı zamanda /Contents dizisini sayfaya özel kopyalar: çoğaltılmış sayfaya yazılan yazı
 * aslına sızmaz.
 */
function isolatePage(outDoc, page) {
  const ctx = outDoc.context;
  const node = page.node;
  const contents = node.get(PDFName.of('Contents'));
  const resolved = contents ? ctx.lookup(contents) : null;
  const list = [];
  if (resolved instanceof PDFArray) list.push(...resolved.asArray());
  else if (contents) list.push(contents);
  const q = ctx.register(ctx.contentStream([pushGraphicsState()]));
  const Q = ctx.register(ctx.contentStream([popGraphicsState()]));
  node.set(PDFName.of('Contents'), ctx.obj([q, ...list, Q]));
}

async function drawEdits(outDoc, pdfPage, page, proxy, fontsCache, imgCache) {
  for (const e of page.edits) {
    const vp = viewport(proxy, e.rot);
    const toPdf = (x, y) => vp.convertToPdfPoint(x, y);
    if (e.type === 'rect') {
      const [x, y] = toPdf(e.x, e.y + e.h); // kutunun görünümdeki sol-alt köşesi
      pdfPage.drawRectangle({
        x, y, width: e.w, height: e.h,
        color: color(e.role === 'redact' ? '#000000' : e.color),
        borderWidth: 0,
        rotate: degrees(e.rot),
      });
    } else if (e.type === 'image') {
      const asset = state.assets.get(e.asset);
      let emb = imgCache.get(asset.id);
      if (!emb) imgCache.set(asset.id, (emb = await embedAsset(outDoc, asset)));
      drawAsset(pdfPage, emb, asset, e, e.rot, toPdf);
    } else if (e.type === 'text') {
      if (!String(e.text).length) continue;
      const f = fontOf(e);
      let font = fontsCache.get(f.key);
      if (!font) {
        font = await outDoc.embedFont(fontBytes(f.key), { subset: true, features: FONT_FEATURES });
        fontsCache.set(f.key, font);
      }
      const [x, y] = toPdf(e.x, e.y + f.asc * e.size); // ilk satırın taban çizgisi
      pdfPage.drawText(String(e.text), {
        x, y, size: e.size, font,
        color: color(e.color),
        lineHeight: LINE_HEIGHT * e.size,
        rotate: degrees(e.rot),
      });
    }
  }
}

/**
 * pages: çıktıya girecek sayfalar (sırasıyla). onProgress(i, n) ilerleme bildirir.
 * Uint8Array döndürür.
 */
export async function buildPdf(pages, onProgress = () => {}) {
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setProducer('PDF Kutusu');
  out.setCreator('PDF Kutusu');

  // Aynı kaynaktan gelen sayfaları TEK seferde kopyala: ortak yazı tipleri/görseller bir kez yazılır.
  const want = new Map(); // docId → [index, ...]
  for (const p of pages) {
    if (needsRaster(p)) continue;
    if (!want.has(p.doc)) want.set(p.doc, []);
    want.get(p.doc).push(p.index);
  }
  const copied = new Map(); // docId → kopyalanmış sayfalar (want sırasıyla)
  for (const [docId, indices] of want) {
    const doc = state.docs.get(docId);
    copied.set(docId, await out.copyPages(doc.lib, indices));
  }
  const cursor = new Map();

  const fontsCache = new Map();
  const imgCache = new Map();
  let i = 0;
  for (const p of pages) {
    onProgress(++i, pages.length);
    if (needsRaster(p)) {
      const r = await rasterizePage(p);
      const pg = out.addPage([r.width, r.height]);
      const img = await out.embedJpg(r.bytes);
      pg.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
      continue;
    }
    const k = cursor.get(p.doc) ?? 0;
    cursor.set(p.doc, k + 1);
    const pdfPage = copied.get(p.doc)[k];
    out.addPage(pdfPage);
    const proxy = await pageProxy(p);
    pdfPage.setRotation(degrees(await totalRotation(p)));
    if (p.edits.length) {
      isolatePage(out, pdfPage);
      await drawEdits(out, pdfPage, p, proxy, fontsCache, imgCache);
    }
  }
  return out.save({ useObjectStreams: true });
}

export function outputName(suffix = '_duzenlendi') {
  const base = (state.firstName || 'belge').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'belge';
  return `${base}${suffix}.pdf`;
}

export function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
