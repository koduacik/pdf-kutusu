// HTML dosyasının içine gömülü ikili veriler (yazı tipleri, pdf.js işçisi, wasm çözücüler).
// Hepsi <script type="application/octet-stream" id="bin-…" data-enc="gzip"> blokları içinde
// base64 olarak durur; ağdan hiçbir şey indirilmez.
import { gunzipSync } from 'fflate';

const cache = new Map();

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Gömülü veriyi Uint8Array olarak döndürür. Dönen diziyi DEĞİŞTİRME; gerekirse .slice() al. */
export function embeddedBytes(id) {
  let bytes = cache.get(id);
  if (bytes) return bytes;
  const el = document.getElementById(`bin-${id}`);
  if (!el) throw new Error(`Gömülü veri bulunamadı: ${id}`);
  bytes = base64ToBytes(el.textContent.trim());
  if (el.dataset.enc === 'gzip') bytes = gunzipSync(bytes);
  el.textContent = ''; // belleği boşalt
  cache.set(id, bytes);
  return bytes;
}
