// Sayfayı (ve üstüne eklenenleri) bir <canvas>'a çizer.
// Küçük resimler ve "kalıcı karart" (sayfayı resme çevirme) bunu kullanır.
import { state, pageProxy, totalRotation } from './state.js';
import { mapBox, norm } from './geom.js';
import { fontOf, LINE_HEIGHT } from './fonts.js';

export async function renderBase(proxy, canvas, rot, scale) {
  const vp = proxy.getViewport({ scale, rotation: rot });
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = proxy.render({ canvasContext: ctx, viewport: vp });
  await task.promise;
  return ctx;
}

/** Eklenen öğeleri çiz. R: sayfanın ekrandaki toplam dönüşü, scale: nokta→piksel. */
export function paintEdits(ctx, page, proxy, R, scale) {
  for (const e of page.edits) {
    const b = mapBox(proxy, e.rot, R, e);
    const delta = norm(R - e.rot);
    ctx.save();
    ctx.translate((b.x + b.w / 2) * scale, (b.y + b.h / 2) * scale);
    ctx.rotate((delta * Math.PI) / 180);
    ctx.scale(scale, scale);
    const x0 = -e.w / 2;
    const y0 = -e.h / 2;
    if (e.type === 'rect') {
      ctx.fillStyle = e.role === 'redact' ? '#000' : e.color;
      ctx.fillRect(x0, y0, e.w, e.h);
    } else if (e.type === 'image') {
      const a = state.assets.get(e.asset);
      if (a) ctx.drawImage(a.img, x0, y0, e.w, e.h);
    } else if (e.type === 'text') {
      const f = fontOf(e);
      ctx.fillStyle = e.color;
      ctx.font = `${f.weight} ${e.size}px ${f.cssFamily}`;
      ctx.textBaseline = 'alphabetic';
      if ('fontKerning' in ctx) ctx.fontKerning = 'none';
      String(e.text).split('\n').forEach((ln, i) => {
        ctx.fillText(ln, x0, y0 + f.asc * e.size + i * LINE_HEIGHT * e.size);
      });
    }
    ctx.restore();
  }
}

/** Sayfanın tamamını (eklenenlerle birlikte) resme çevir. Kalıcı karart bunu kullanır. */
export async function rasterizePage(page, dpi = 200) {
  const proxy = await pageProxy(page);
  const R = await totalRotation(page);
  const base = proxy.getViewport({ scale: 1, rotation: R });
  let scale = dpi / 72;
  const maxSide = 5000; // tarayıcı canvas sınırının altında kal
  scale = Math.min(scale, maxSide / Math.max(base.width, base.height));
  const canvas = document.createElement('canvas');
  const ctx = await renderBase(proxy, canvas, R, scale);
  paintEdits(ctx, page, proxy, R, scale);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = canvas.height = 0;
  return { bytes, width: base.width, height: base.height };
}
