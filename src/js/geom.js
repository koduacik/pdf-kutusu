// Koordinatlar.
//
// Her eklenen öğe (yazı, görsel, kutu) sayfanın belli bir dönüşteki görünümüne göre saklanır:
//   e.rot  : öğenin DİK göründüğü sayfa dönüşü (0/90/180/270, saat yönünde)
//   e.x, e.y, e.w, e.h : o görünümde, sol üst köşe başlangıçlı, 1 birim = 1 PDF noktası
// Sayfa sonradan döndürülse de öğe sayfayla birlikte döner. Görünümler arasındaki
// dönüşümü pdf.js'in viewport'u yapar (kırpma kutusu ve sayfanın kendi /Rotate'i dahil).

export const norm = (r) => ((Math.round(r) % 360) + 360) % 360;

const cache = new WeakMap();
export function viewport(proxy, rot) {
  rot = norm(rot);
  let m = cache.get(proxy);
  if (!m) cache.set(proxy, (m = {}));
  return (m[rot] ||= proxy.getViewport({ scale: 1, rotation: rot }));
}

export function mapPoint(proxy, from, to, x, y) {
  if (norm(from) === norm(to)) return [x, y];
  const [px, py] = viewport(proxy, from).convertToPdfPoint(x, y);
  return viewport(proxy, to).convertToViewportPoint(px, py);
}

export function mapBox(proxy, from, to, b) {
  const [x1, y1] = mapPoint(proxy, from, to, b.x, b.y);
  const [x2, y2] = mapPoint(proxy, from, to, b.x + b.w, b.y + b.h);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Görünümdeki bir noktayı PDF kullanıcı uzayına çevir. */
export function toPdf(proxy, rot, x, y) {
  return viewport(proxy, rot).convertToPdfPoint(x, y);
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
