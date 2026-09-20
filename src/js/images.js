// JPG/PNG görseller: telefon fotoğraflarının yan dönmemesi için EXIF yönünü okuyup uygular.
import { PDFDocument, degrees } from 'pdf-lib';
import { norm } from './geom.js';
import { state, uid } from './state.js';

/** JPEG'in EXIF "Orientation" etiketini oku (1-8). Yoksa 1. */
export function jpegOrientation(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint16(0) !== 0xffd8) return 1;
    let off = 2;
    while (off + 4 <= dv.byteLength) {
      const marker = dv.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; // görüntü verisi başladı
      const len = dv.getUint16(off + 2);
      if (marker === 0xffe1 && dv.getUint32(off + 4) === 0x45786966 && dv.getUint16(off + 8) === 0) {
        const tiff = off + 10;
        const le = dv.getUint16(tiff) === 0x4949;
        const ifd = tiff + dv.getUint32(tiff + 4, le);
        const n = dv.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const ent = ifd + 2 + i * 12;
          if (dv.getUint16(ent, le) === 0x0112) {
            const v = dv.getUint16(ent + 8, le);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
      off += 2 + len;
    }
  } catch {
    /* bozuk EXIF: yok say */
  }
  return 1;
}

// Yalnızca döndürme olan yönler kayıpsız uygulanır (JPEG baytları aynen gömülür).
const ROTATION_OF = { 1: 0, 3: 180, 6: 90, 8: 270 };

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('görsel çözülemedi'));
    img.src = url;
  });
}

/** Görsel dosyasından bir "varlık" üret: baytlar + ekranda çizmek için <img>. */
export async function createAsset(bytes, type, name) {
  let kind = type;
  let data = bytes;
  let orientation = type === 'jpg' ? jpegOrientation(bytes) : 1;
  const mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
  let url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  let img;
  try {
    img = await loadImg(url); // tarayıcı EXIF yönünü kendisi uygular
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`“${name}” görseli açılamadı. Dosya bozuk olabilir.`);
  }

  if (!(orientation in ROTATION_OF)) {
    // Aynalı yönler (2,4,5,7) nadirdir: tarayıcının düz çizdiği hâli yeniden JPEG yap.
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    data = new Uint8Array(await blob.arrayBuffer());
    kind = 'jpg';
    orientation = 1;
    URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    img = await loadImg(url);
  }

  const asset = {
    id: uid('a'), name, bytes: data, kind, orientation,
    width: img.naturalWidth, height: img.naturalHeight, // dik (yönü uygulanmış) boyutlar
    img, url,
  };
  state.assets.set(asset.id, asset);
  return asset;
}

/**
 * Görseli pdf-lib sayfasına çiz.
 * box: görselin dik göründüğü görünümdeki kutu; toPdf: o görünümden PDF noktasına dönüşüm.
 * rot: o görünümün dönüşü. EXIF dönüşü de burada, kayıpsız, eklenir.
 */
export function drawAsset(pdfPage, embedded, asset, box, rot, toPdf) {
  const phi = ROTATION_OF[asset.orientation] ?? 0;
  const { x, y, w, h } = box;
  // Diskteki (döndürülmemiş) resmin sol-alt köşesi görünümde nereye düşüyor?
  const corner = { 0: [x, y + h], 90: [x, y], 180: [x + w, y], 270: [x + w, y + h] }[phi];
  const [px, py] = toPdf(corner[0], corner[1]);
  const upright = phi % 180 === 0;
  pdfPage.drawImage(embedded, {
    x: px, y: py,
    width: upright ? w : h,
    height: upright ? h : w,
    rotate: degrees(norm(rot - phi)),
  });
}

export async function embedAsset(pdfDoc, asset) {
  return asset.kind === 'png' ? pdfDoc.embedPng(asset.bytes) : pdfDoc.embedJpg(asset.bytes);
}

const A4 = [595.28, 841.89];

/** Görseli A4 bir sayfaya (görselin yönünde) sığdırıp tek sayfalık PDF baytı üret. */
export async function imagePagePdf(asset) {
  const d = await PDFDocument.create();
  const landscape = asset.width > asset.height;
  const [PW, PH] = landscape ? [A4[1], A4[0]] : A4;
  const s = Math.min(PW / asset.width, PH / asset.height);
  const w = asset.width * s;
  const h = asset.height * s;
  const box = { x: (PW - w) / 2, y: (PH - h) / 2, w, h };
  const page = d.addPage([PW, PH]);
  const emb = await embedAsset(d, asset);
  drawAsset(page, emb, asset, box, 0, (x, y) => [x, PH - y]);
  return d.save();
}

export async function blankPagePdf(w = A4[0], h = A4[1]) {
  const d = await PDFDocument.create();
  d.addPage([w, h]);
  return d.save();
}
