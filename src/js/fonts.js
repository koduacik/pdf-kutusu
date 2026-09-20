// Yeni yazılar için gömülü DejaVu yazı tipleri. Türkçe harflerin hepsi ve ₺ işareti var.
// Aynı dosya hem ekranda (CSS FontFace) hem PDF'e yazarken (pdf-lib + fontkit) kullanılır;
// böylece ekranda gördüğün genişlik PDF'teki genişlikle aynı olur.
import fontkit from '@pdf-lib/fontkit';
import { embeddedBytes } from './embedded.js';

export { fontkit };
export const LINE_HEIGHT = 1.25; // satır aralığı = boy × 1.25
export const FONT_FEATURES = { liga: false }; // "fi" bitişik harfleri Türkçede ı/i karışıklığı yaratır

const FILES = {
  'sans-400': 'font-sans',
  'sans-700': 'font-sans-bold',
  'serif-400': 'font-serif',
  'serif-700': 'font-serif-bold',
};
const fonts = {};

export async function loadFonts() {
  for (const [key, id] of Object.entries(FILES)) {
    const bytes = embeddedBytes(id);
    const fk = fontkit.create(bytes);
    const [family, weight] = key.split('-');
    const cssFamily = family === 'serif' ? 'PKSerif' : 'PKSans';
    const face = new FontFace(cssFamily, bytes.slice().buffer, { weight });
    await face.load();
    document.fonts.add(face);
    fonts[key] = {
      key, bytes, fk, cssFamily, weight: Number(weight),
      asc: fk.ascent / fk.unitsPerEm,
      desc: -fk.descent / fk.unitsPerEm,
      cssBaseline: 0,
    };
  }
  for (const f of Object.values(fonts)) f.cssBaseline = measureCssBaseline(f);
}

// Tarayıcının bu yazı tipinde taban çizgisini (baseline) satır kutusunun neresine koyduğunu ölç.
function measureCssBaseline(f) {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;` +
    `font-family:${f.cssFamily};font-weight:${f.weight};font-size:100px;line-height:${LINE_HEIGHT * 100}px;`;
  box.innerHTML = 'Hğ<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
  document.body.append(box);
  const probe = box.querySelector('span');
  const v = (probe.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100;
  box.remove();
  return v;
}

export function fontOf(e) {
  return fonts[`${e.family === 'serif' ? 'serif' : 'sans'}-${e.bold ? 700 : 400}`];
}

export function fontBytes(key) {
  return fonts[key].bytes;
}

/** pdf-lib'in yaptığı gibi ölç: glif ilerlemelerinin toplamı (aralık/kerning yok). */
export function textWidth(f, line, size) {
  if (!line) return 0;
  const run = f.fk.layout(line, FONT_FEATURES);
  let w = 0;
  for (const g of run.glyphs) w += g.advanceWidth;
  return (w / f.fk.unitsPerEm) * size;
}

/** Yazı öğesinin kutusunu (w, h) metnine göre güncelle. */
export function measureTextEdit(e) {
  const f = fontOf(e);
  const lines = String(e.text ?? '').split('\n');
  let w = 0;
  for (const ln of lines) w = Math.max(w, textWidth(f, ln, e.size));
  e.w = Math.max(w, e.size * 0.3);
  e.h = (lines.length - 1) * LINE_HEIGHT * e.size + (f.asc + f.desc) * e.size;
  return e;
}
