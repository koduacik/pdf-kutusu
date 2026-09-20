// pdf.js (görüntüleme) ve pdf-lib (yazma) ile dosya açma.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, EncryptedPDFError } from 'pdf-lib';
import { embeddedBytes } from './embedded.js';

export { pdfjsLib };

// pdf.js işçisi (worker) de dosyanın içinde; blob: adresinden klasik işçi olarak başlatılır.
// Başlamazsa (eski/kısıtlı tarayıcı) pdf.js ana iş parçacığında çalışır: daha yavaş ama çalışır.
export async function initPdfjs() {
  const code = embeddedBytes('pdfjs-worker');
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  let worker = null;
  try {
    worker = new Worker(url);
  } catch {
    worker = null;
  }
  const ready = worker && await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 10000);
    worker.addEventListener('message', function onMsg(ev) {
      if (ev.data?.action !== 'ready') return;
      clearTimeout(timer);
      worker.removeEventListener('message', onMsg);
      resolve(true);
    });
    worker.addEventListener('error', () => { clearTimeout(timer); resolve(false); });
  });
  if (ready) {
    pdfjsLib.GlobalWorkerOptions.workerPort = worker;
    return 'worker';
  }
  worker?.terminate();
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; // globalThis.pdfjsWorker tanımlanır; pdf.js onu kullanır
    s.onload = resolve;
    s.onerror = () => reject(new Error('pdf.js başlatılamadı'));
    document.head.append(s);
  });
  return 'main-thread';
}

// pdf.js normalde wasm çözücülerini ve bazı yazı tiplerini ağdan çeker.
// Biz bu isteği yakalayıp gömülü kopyayı veriyoruz.
const EMBEDDED_FILES = {
  'openjpeg.wasm': 'wasm-openjpeg',
  'jbig2.wasm': 'wasm-jbig2',
  'qcms_bg.wasm': 'wasm-qcms',
  'FoxitSymbol.pfb': 'sf-symbol',
  'FoxitDingbats.pfb': 'sf-dingbats',
};
class EmbeddedBinaryDataFactory {
  async fetch({ filename }) {
    const id = EMBEDDED_FILES[filename];
    if (!id) throw new Error(`Bu veri gömülü değil: ${filename}`);
    return embeddedBytes(id).slice();
  }
}

export class OpenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** PDF baytlarını hem pdf.js hem pdf-lib ile açar. Şifreli dosyada OpenError('encrypted') fırlatır. */
export async function openPdfBytes(bytes, name) {
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: bytes.slice(), // pdf.js veriyi işçiye devrediyor; aslını pdf-lib için sakla
      BinaryDataFactory: EmbeddedBinaryDataFactory,
      useWorkerFetch: false,
      useSystemFonts: true,
      enableXfa: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new OpenError('encrypted',
        `“${name}” parola ile şifrelenmiş. PDF Kutusu şifreli dosyaları açamaz.\n\n` +
        `Çözüm: Dosyayı parolasını bildiğin bir programda aç, parolayı kaldırarak yeniden kaydet ve o kopyayı buraya bırak.`);
    }
    throw new OpenError('invalid', `“${name}” PDF olarak okunamadı. Dosya bozuk ya da PDF değil.`);
  }

  let lib = null;
  let libError = null;
  try {
    lib = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof EncryptedPDFError || /encrypt/i.test(String(err?.message))) {
      await pdf.loadingTask.destroy();
      throw new OpenError('encrypted',
        `“${name}” şifreli (düzenleme kısıtlaması konmuş). Açılmak için parola istemese de içeriği şifreli olduğundan PDF Kutusu bu dosyayı düzenleyemez.\n\n` +
        `Çözüm: Dosyayı oluşturan programdan şifresiz bir kopyasını al.`);
    }
    libError = err; // pdf-lib okuyamadı ama pdf.js okudu: kaydederken bu sayfalar resim olarak yazılır
  }
  return { pdf, lib, libError };
}

/** PDF mi, JPG mi, PNG mi? Uzantıya değil dosyanın ilk baytlarına bakar. */
export function sniffType(bytes) {
  const b = bytes;
  // %PDF başlığı ilk 1024 baytta herhangi bir yerde olabilir
  const head = new TextDecoder('latin1').decode(b.subarray(0, 1024));
  if (head.includes('%PDF-')) return 'pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return null;
}
