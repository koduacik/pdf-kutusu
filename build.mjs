// PDF Kutusu derleyicisi.
// src/ altındaki editörü, kütüphaneleri ve yazı tiplerini TEK bir HTML dosyasına gömer:
//   dist/PDF Kutusu.html      → dağıtım sürümü (internetsiz)
//   dist/site/editor.html     → aynı dosya, online sitenin yalıtılmış çerçevesinde
//   dist/site/*               → site sayfaları (reklam alanlı çerçeve, gizlilik, nasıl kullanılır)
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const NM = join(ROOT, 'node_modules');
const read = (p) => readFileSync(p);
const readText = (p) => readFileSync(p, 'utf8');

// Gömülü ikili veriler: <script type="application/octet-stream" id="bin-…"> içinde gzip+base64.
const BINARIES = {
  'wasm-openjpeg': join(NM, 'pdfjs-dist/wasm/openjpeg.wasm'),
  'wasm-jbig2': join(NM, 'pdfjs-dist/wasm/jbig2.wasm'),
  'wasm-qcms': join(NM, 'pdfjs-dist/wasm/qcms_bg.wasm'),
  'sf-symbol': join(NM, 'pdfjs-dist/standard_fonts/FoxitSymbol.pfb'),
  'sf-dingbats': join(NM, 'pdfjs-dist/standard_fonts/FoxitDingbats.pfb'),
  'font-sans': join(NM, 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
  'font-sans-bold': join(NM, 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
  'font-serif': join(NM, 'dejavu-fonts-ttf/ttf/DejaVuSerif.ttf'),
  'font-serif-bold': join(NM, 'dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf'),
};

// Üçüncü taraf lisansları: hem depoya (THIRD_PARTY_LICENSES.txt) hem HTML'in içine gömülür.
const LICENSES = [
  ['pdf.js (pdfjs-dist) — Apache License 2.0 — Mozilla Foundation', join(NM, 'pdfjs-dist/LICENSE')],
  ['pdf.js wasm: OpenJPEG — BSD 2-Clause', join(NM, 'pdfjs-dist/wasm/LICENSE_OPENJPEG')],
  ['pdf.js wasm: OpenJPEG sarmalayıcı — BSD 2-Clause', join(NM, 'pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG')],
  ['pdf.js wasm: JBIG2 (PDFium) — BSD 3-Clause', join(NM, 'pdfjs-dist/wasm/LICENSE_JBIG2')],
  ['pdf.js wasm: JBIG2 sarmalayıcı — Apache License 2.0', join(NM, 'pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2')],
  ['pdf.js wasm: qcms — MIT', join(NM, 'pdfjs-dist/wasm/LICENSE_QCMS')],
  ['pdf.js wasm: qcms sarmalayıcı — MIT', join(NM, 'pdfjs-dist/wasm/LICENSE_PDFJS_QCMS')],
  ['pdf.js standart yazı tipleri (FoxitSymbol, FoxitDingbats) — BSD tarzı', join(NM, 'pdfjs-dist/standard_fonts/LICENSE_FOXIT')],
  ['pdf-lib — MIT', join(NM, 'pdf-lib/LICENSE.md')],
  ['@pdf-lib/fontkit — MIT', null, `MIT License

Copyright (c) 2014 Devon Govett (fontkit)
Copyright (c) 2020 Andrew Dillon (@pdf-lib/fontkit)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`],
  ['fflate — MIT', join(NM, 'fflate/LICENSE')],
  ['DejaVu yazı tipleri (Sans, Sans Bold, Serif, Serif Bold) — Bitstream Vera lisansı + kamu malı', join(NM, 'dejavu-fonts-ttf/LICENSE')],
];

function licensesText() {
  const parts = LICENSES.map(([title, path, inline]) => {
    const body = inline ?? readText(path);
    return `==============================================================================\n${title}\n==============================================================================\n\n${body.trim()}\n`;
  });
  return `PDF Kutusu içinde gömülü olarak dağıtılan üçüncü taraf yazılım ve yazı tipleri\n\n` + parts.join('\n');
}

function b64gz(buf) {
  return gzipSync(buf, { level: 9 }).toString('base64');
}

// HTML içinde <script> bloğunu erken kapatabilecek dizileri etkisizleştir (yalnızca JS için).
function safeInlineJs(js) {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

async function bundle(entry, globalName) {
  const res = await build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    format: 'iife',
    globalName,
    minify: true,
    target: ['es2020', 'chrome92', 'firefox90', 'safari15'],
    write: false,
    legalComments: 'none', // lisans metinlerinin tamamı ayrıca gömülüyor
    logLevel: 'warning',
    supported: { 'top-level-await': false },
  });
  return res.outputFiles[0].text;
}
const bundleApp = () => bundle('src/js/main.js');

async function main() {
  const t0 = Date.now();
  const appJs = safeInlineJs(await bundleApp());
  const css = readText(join(ROOT, 'src/style.css'));
  const lic = licensesText();
  if (/<\/script|<!--/i.test(lic)) throw new Error('lisans metni <script> içine ham olarak konamıyor');

  const worker = Buffer.from(await bundle('src/js/pdfworker-entry.js', 'pdfjsWorker'));
  const bins = [['pdfjs-worker', worker], ...Object.entries(BINARIES).map(([id, path]) => [id, read(path)])]
    .map(([id, buf]) => `<script type="application/octet-stream" id="bin-${id}" data-enc="gzip">${b64gz(buf)}</script>`)
    .join('\n');

  const version = JSON.parse(readText(join(ROOT, 'package.json'))).version;
  let html = readText(join(ROOT, 'src/editor.html'));
  const put = (marker, value) => {
    if (!html.includes(marker)) throw new Error(`şablonda ${marker} yok`);
    html = html.split(marker).join(value);
  };
  put('/*@CSS@*/', css);
  put('<!--@DATA@-->', `${bins}\n<script type="text/plain" id="licenses">${lic}</script>`);
  put('/*@APP@*/', appJs);
  put('@VERSION@', version);

  rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
  mkdirSync(join(ROOT, 'dist/site'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/PDF Kutusu.html'), html);
  writeFileSync(join(ROOT, 'THIRD_PARTY_LICENSES.txt'), lic);

  // Online site: aynı editör dosyası + site sayfaları
  cpSync(join(ROOT, 'site'), join(ROOT, 'dist/site'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/site/editor.html'), html);
  writeFileSync(join(ROOT, 'dist/site/PDF-Kutusu.html'), html); // "internetsiz sürümü indir" bağlantısı
  for (const f of readdirSync(join(ROOT, 'dist/site'))) {
    if (!f.endsWith('.html')) continue;
    const p = join(ROOT, 'dist/site', f);
    writeFileSync(p, readText(p).split('@VERSION@').join(version));
  }

  const sha = createHash('sha256').update(html).digest('hex');
  const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
  console.log(`dist/PDF Kutusu.html  ${mb} MB  sha256 ${sha.slice(0, 16)}…  (${Date.now() - t0} ms)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
