# PDF Kutusu

Tarayıcıda çalışan PDF düzenleyici: birleştir, ayır, sayfa sil, döndür, sırala, JPG/PNG'den sayfa;
bir sayfanın içinde yazı değiştir, yazı/imza/kaşe ekle, bir yeri ört, gizli bilgiyi kalıcı olarak karart.
Tek HTML dosyası, kurulum yok, internet kapalıyken de çalışır.

> Bu araç **Bunun Programı Var** kanalının 2. bölümünde sıfırdan yazıldı.
> Program sayfası: https://ozy2.com/programivar/pdf-kutusu/  ·  Kanal: https://youtube.com/@programivar

## İndir ve kullan

1. [Releases](../../releases/latest) sayfasından **`PDF Kutusu.html`** dosyasını indir (yaklaşık 4 MB).
2. Dosyaya **çift tıkla**. Tarayıcında açılır (Chrome, Edge, Firefox ya da Safari).
3. PDF'ini pencereye **sürükle bırak**. Bitince **Kaydet**'e bas.

Kaydedilen dosyanın adı, ilk açtığın dosyanın adının sonuna `_duzenlendi` eklenmiş hâlidir:
`dilekce.pdf` → `dilekce_duzenlendi.pdf`.

## Ne yapar

**Sayfa işleri**
- Birden fazla PDF'i açar; hepsinin sayfaları tek listede birleşir.
- Sayfaların küçük resimlerini gösterir; sayfalar sürükleyerek sıralanır.
- Sayfa siler, döndürür (90° adımlarla), çoğaltır; boş sayfa ekler.
- İki sayfanın arasına başka bir PDF'ten sayfa ekler (istersen yalnızca `2-5` gibi belli sayfaları).
- JPG ya da PNG görseli yeni sayfa olarak ekler. **Telefonla çekilmiş fotoğraflar yan dönmez** (EXIF yönü okunur;
  JPEG yeniden sıkıştırılmadan, kalite kaybı olmadan gömülür).
- **Ayır:** `1-3, 7, 10-son` gibi bir aralığı ayrı bir PDF olarak indirir.

**Düzenleme** (bir sayfaya çift tıkla)
- Sayfadaki mevcut bir yazıya tıkla, yenisini yaz: yeni yazı **aynı yerde, aynı boyda, aynı renkte** durur;
  kalın yazı kalın, tırnaklı (serif) yazı tırnaklı kalır. Renkli zemin üstündeki yazıda örtü zemin renginde olur.
- Yeni yazı kutusu ekler: boyut, renk, kalın, düz/tırnaklı yazı tipi. Çok satırlı yazı olur (Shift+Enter).
- Görsel ekler (imza, kaşe, logo): sürükleyerek taşınır, köşesinden boyutlandırılır. **Şeffaf PNG şeffaf kalır.**
- Bir yeri örtmek için kutu çizer (renk seçilir).
- **Kalıcı karart:** gizli bilgiyi dosyadan gerçekten siler (aşağıya bak).
- Geri al **Ctrl+Z** (Mac: Cmd+Z), ileri al **Ctrl+Shift+Z**. Hem sayfa işlerinde hem düzenleyicide çalışır.

**Diğer**
- Türkçe karakterler (ğ ü ş ı ö ç İ Ğ Ş) ve **₺** yeni yazılarda bozulmaz; kaydedilen PDF'te seçilebilir, aranabilir metin olur.
- Şifreli PDF'te anlaşılır Türkçe hata verir; 100 MB'tan büyük dosyada önce uyarır.
- Hiçbir veriyi internete göndermez; bu tarayıcıya zorla yaptırılır (aşağıda “Gizlilik”).

## Ne yapmaz

- **E-imzalı (elektronik imzalı) bir PDF'i düzenlersen imza GEÇERSİZ olur.** Birleştirme, sayfa silme, döndürme,
  yazı ekleme dahil her değişiklik yeni bir dosya üretir ve eski imzayı bozar. e-Devlet belgesi, e-fatura,
  noter/mahkeme evrakı gibi imzalı belgelerin **aslını sakla**; düzenlenmiş kopyayı resmî yere imzalı belge diye verme.
- **Yazı değiştirmek eski yazıyı silmez.** PDF'te yazı “değiştirmek” teknik olarak eski yazının üstünü zemin rengiyle
  örtüp yenisini aynı yere yazmaktır. Eski yazı görünmez olur ama **dosyanın içinde kalır**: kopyala-yapıştırla ya da
  basit programlarla okunabilir. “Örtü kutusu” da aynıdır. Program bunu kullanıcıya hem ipucu çubuğunda hem ilk
  kullanımda açılan pencerede açıkça söyler. Gizli bilgi için **Kalıcı karart** kullan.
- Şifreli PDF'leri açmaz — ne parolalı olanları ne de parola sormadan açılan ama düzenleme kısıtlaması konmuş olanları.
- Taranmış belgedeki yazıyı tanımaz (OCR yok); taranmış sayfada “yazıya tıkla, değiştir” çalışmaz (yazı ekleme, örtme,
  karartma çalışır).
- Doldurulabilir form alanları, yer imleri (içindekiler) ve belge içi bağlantılar yeni dosyaya taşınmayabilir;
  sayfanın görüntüsü korunur.
- Eğik (90°'nin katı olmayan açıyla yazılmış) yazıları değiştiremez.

### Kalıcı karart nasıl çalışır?

Karartmak istediğin yeri işaretlersin. Kaydederken **o sayfa, eklediğin her şeyle birlikte 200 dpi bir resme çevrilir**
ve işaretli yerler siyaha boyanır. Yeni dosyada o sayfada artık metin katmanı yoktur: altındaki yazı dosyadan gerçekten
silinmiştir. Bedeli: o sayfadaki bütün yazılar seçilemez/aranamaz olur ve sayfadaki bağlantılar/form alanları kaybolur.
Diğer sayfalar etkilenmez.

## Gizlilik: “internet kullanmaz” nasıl zorlanıyor?

`PDF Kutusu.html` dosyasının en başında bir **Content-Security-Policy** kuralı var:

```
default-src 'none'; connect-src 'none'; img-src data: blob:; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; …
```

Bu kural tarayıcıya “bu sayfa hiçbir sunucuya istek atamaz” der. Kodda bir hata olsa, hatta biri koda bağlantı kuran bir
satır eklese bile tarayıcı isteği **daha ağa çıkmadan** durdurur. Yalnızca sayfanın kendi içindeki kod ve `blob:`/`data:`
adresleri (bilgisayarın belleğindeki veriler) serbesttir. Kütüphaneler (pdf.js, pdf-lib), yazı tipleri ve pdf.js'in
yardımcı dosyaları dosyanın içine gömülüdür; hiçbir şey bir CDN'den çekilmez.

Kendin doğrulamak için: dosyayı aç, tarayıcıda geliştirici araçlarının **Ağ (Network)** sekmesine bak — PDF açıp
kaydederken tek bir istek görmezsin. Testlerde bu otomatik denetleniyor (aşağıda).

## Online sürüm (reklamlı site)

`dist/site/` klasörü aynı editörün web sitesi hâlidir: `index.html` (reklam alanları + editör), `gizlilik.html`,
`nasil-kullanilir.html`. Editör dosyası (`editor.html`) **dağıtım sürümüyle bayt bayt aynıdır**; testler bunu denetler.
PDF burada da sunucuya yüklenmez.

### Online sürüm neden güvenli? Reklam betikleri PDF'e neden erişemez?

Sayfada Google AdSense betiği çalışır. Bu betik ve gösterdiği reklamlar kullanıcının PDF'ine erişemez, çünkü:

1. **Editör yalıtılmış bir çerçevede (iframe) çalışır:**
   `<iframe src="editor.html" sandbox="allow-scripts allow-downloads">`. `allow-same-origin` **bilerek verilmez**.
   Bu durumda tarayıcı çerçeveye opak, “kimsesiz” bir köken (`null`) atar. Ana sayfa ile çerçeve artık farklı kökenlidir
   ve tarayıcının en temel güvenlik kuralı olan **aynı köken ilkesi** gereği ana sayfadaki hiçbir betik — reklam betiği
   dahil — çerçevenin belgesini, değişkenlerini, belleğini ya da açılan dosyaları okuyamaz. Deneyen `SecurityError` alır.
2. **Dosya yalnızca çerçevenin içinde açılır.** Dosya seçme düğmesi ve sürükle-bırak alanı çerçevenin içindedir;
   ana sayfa dosyaya hiç dokunmaz.
3. **Çerçevedeki editör de internete bağlanamaz.** Yukarıdaki CSP kuralı editör dosyasının içinde olduğundan çerçeve
   içinde de geçerlidir: PDF editörün içinden dışarı gönderilemez.
4. **Çerçeve ile sayfa konuşmaz.** Editör `postMessage` ile hiçbir şey göndermez, gelen mesajları da dinlemez.
5. **Reklamların kendisi** (reklam görselleri, tıklama sayfaları) Google'ın kendi alan adlarından, kendi çerçevelerinde
   gösterilir; onlar da ne ana sayfanın ne editörün içine erişebilir.

Kalan risk (dürüstçe): Ana sayfanın kendisi (ya da sitenin sunucusu) ele geçirilirse, saldırgan gerçek editör yerine
sahte bir editör gösterebilir. Bu, her web sitesi için geçerli olan bir risktir. Hiç risk istemeyen kullanıcı için
sitede **“İnternetsiz sürümü indir”** bağlantısı var: reklamsız, tek dosya, internetsiz.

Testler bu yalıtımı gerçek tarayıcıda denetler: ana sayfadan çerçeveye erişim `SecurityError` veriyor, çerçevenin
kökeni `null`, PDF açılıp kaydedilirken sıfır ağ isteği.

### Yayına almadan önce doldurulacak yer tutucular

| Yer tutucu | Nerede | Ne yazılacak |
|---|---|---|
| `ca-pub-XXXXXXXXXXXXXXXX` | `site/index.html` (3 yerde), `site/ads.txt` (`pub-…`) | AdSense yayıncı kimliği |
| `YYYYYYYYYY`, `ZZZZZZZZZZ` | `site/index.html` | Üst ve yan reklam birimi numaraları |
| `ALAN_ADI` | tüm site sayfaları, `robots.txt`, `sitemap.xml` | Sitenin alan adı (ör. `pdfkutusu.com.tr`) |
| `[VERİ SORUMLUSU]`, `[İLETİŞİM E-POSTASI]`, `[TARİH]`, `[SÜRE]` | `site/gizlilik.html` | KVKK bilgileri |

Toplu değiştirmek için (örnek):

```bash
grep -rl 'ALAN_ADI' site | xargs sed -i '' 's/ALAN_ADI/pdfkutusu.com.tr/g'
grep -rl 'XXXXXXXXXXXXXXXX' site | xargs sed -i '' 's/XXXXXXXXXXXXXXXX/1234567890123456/g'
```

AB/Birleşik Krallık ziyaretçileri için AdSense panelinden Google sertifikalı izin mesajını (CMP) açmayı unutma.

Önerilen sunucu başlıkları (nginx):

```nginx
location = /editor.html {
    # Doğrudan açılsa bile yalıtılmış olsun; yalnız kendi sitemiz çerçeveleyebilsin
    add_header Content-Security-Policy "sandbox allow-scripts allow-downloads; frame-ancestors 'self'" always;
    add_header X-Content-Type-Options nosniff always;
}
location / {
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

## Geliştirme

Gerekenler: Node.js 18+, Python 3.10+ (yalnız testler için).

```bash
npm install
node build.mjs                 # → dist/PDF Kutusu.html  +  dist/site/
```

Kaynaklar `src/` altında: `editor.html` (iskelet), `style.css`, `js/` (modüller). `build.mjs`, esbuild ile JavaScript'i
paketler; pdf.js işçisini, wasm çözücüleri ve yazı tiplerini gzip+base64 olarak HTML'in içine gömer.

| Dosya | Görev |
|---|---|
| `src/js/main.js` | Dosya açma, 100 MB uyarısı, ayır, kaydet, klavye |
| `src/js/grid.js` | Küçük resimler, sürükle-bırak sıralama, sil/döndür/çoğalt |
| `src/js/pageeditor.js` | Sayfa düzenleyici: yazı değiştir, yazı/görsel/kutu ekle, kalıcı karart |
| `src/js/save.js` | pdf-lib ile çıktı PDF'i üretir |
| `src/js/paint.js` | Küçük resim çizimi ve kalıcı karartta sayfayı resme çevirme |
| `src/js/images.js` | JPG/PNG, EXIF yönü, görselden sayfa |
| `src/js/geom.js` | Döndürülmüş/kırpılmış sayfalarda koordinat dönüşümü |
| `src/js/state.js` | Durum, geri al/ileri al |

### Testler

```bash
python3 -m venv .venv && .venv/bin/pip install playwright pytest pypdf pymupdf reportlab pikepdf pillow
.venv/bin/python tests/make_samples.py          # örnek PDF'ler (kurgusal içerik)
.venv/bin/python -m pytest -v tests             # bilgisayardaki Google Chrome ile
TARAYICI=firefox .venv/bin/python -m pytest tests   # (önce: .venv/bin/python -m playwright install firefox webkit)
TARAYICI=webkit  .venv/bin/python -m pytest tests   # Safari motoru
```

Testler arayüzü gerçek bir kullanıcı gibi kullanır (tıkla, sürükle, yaz), çıkan PDF'i indirir ve PyMuPDF ile yeniden
açıp doğrular. Her testin sonunda sayfanın **hiç ağ isteği yapmadığı** ve JavaScript hatası olmadığı da denetlenir.

| Test | Doğrulanan |
|---|---|
| birleştir | 3 dosya → 8 sayfa, sıra, kaynak dönüşü korunuyor, çıktı adı `…_duzenlendi.pdf` |
| sil / döndür / çoğalt / sırala | sayfa sayısı, `/Rotate` değerleri, sürükle-bırak sonrası sıra |
| boş sayfa + araya ekle | başka PDF'in `2-3` sayfaları doğru yere, boş sayfa A4 ve metinsiz |
| ayır | `1-2, 4, son` → doğru sayfalar; hatalı aralıkta Türkçe uyarı |
| yazı değiştir | yeni yazı metin olarak okunuyor; aynı boy, renk, konum, taban çizgisi; eski yazı görünmüyor ama dosyada kalıyor (söylendiği gibi) |
| yazı + görsel ekle | `ğüşıöçİĞŞ ₺` birebir okunuyor; boy/renk/kalın doğru; PNG şeffaflığı (SMask) korunuyor; taşıma ve boyutlandırma |
| kalıcı karart | karartılan sayfada metin ve yazı tipi yok; gizli numara dosyanın hiçbir yerinde yok; karartılan yer siyah; diğer sayfalar metin |
| dönük / kırpılmış sayfa | 90° dönük sayfada yeni yazı ekranda dik, değiştirilen yazı eski yönünde; (0,0)'dan başlamayan sayfa kutusunda konumlar doğru |
| telefon fotoğrafı | EXIF 6 fotoğraf hem yeni sayfa olarak hem düzenleyicide dik; JPEG kayıpsız |
| şifreli / bozuk / büyük | Türkçe hata; program çökmeden çalışmaya devam ediyor; 101 MB'lık gerçek PDF'te uyarı, “Yine de aç” ile açılıyor |
| ağ yasağı | `fetch`, XHR, WebSocket, `sendBeacon`, resim, betik, işçi içinden istek: hepsi tarayıcı tarafından engelleniyor |
| internet kapalı | ağ kapalı tarayıcıda dosya aç, düzenle, kaydet |
| online site | editör dağıtım dosyasıyla aynı; ana sayfa çerçeveye erişemiyor; PDF işlenirken sıfır istek |

## Lisanslar

PDF Kutusu **MIT** lisanslıdır — bkz. [LICENSE](LICENSE). İçine gömülen üçüncü taraf bileşenlerin hepsi MIT lisanslı
bir projeyle birlikte dağıtılmaya uygundur. Lisans metinlerinin tamamı [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)
dosyasında ve programın içinde (**? → Lisans metinlerini göster**) bulunur; tek dosya kopyalandığında lisanslar da
onunla birlikte gider.

| Bileşen | Sürüm | Lisans | Not |
|---|---|---|---|
| pdf.js (`pdfjs-dist`) | 6.3.289 | Apache-2.0 | MIT projeye gömülebilir; lisans ve telif bildirimi dağıtımla verilmeli (veriliyor). pdf.js kodu Apache-2.0 olarak kalır. |
| pdf.js wasm: OpenJPEG | — | BSD-2-Clause | JPEG 2000 görüntüler için |
| pdf.js wasm: JBIG2 (PDFium) | — | BSD-3-Clause + Apache-2.0 sarmalayıcı | Taranmış belgelerdeki JBIG2 görüntüler için |
| pdf.js wasm: qcms | — | MIT | Renk profilleri için |
| Foxit Symbol / Dingbats yazı tipleri (pdf.js ile gelir) | — | BSD-3-Clause (PDFium) | Yalnız sembol yazı tipi gömülü olmayan PDF'leri göstermek için |
| pdf-lib | 1.17.1 | MIT | PDF yazma |
| @pdf-lib/fontkit | 1.1.1 | MIT | Yazı tipi gömme |
| fflate | 0.8.3 | MIT | Gömülü verilerin açılması |
| DejaVu Sans, Sans Bold, Serif, Serif Bold | 2.37 | Bitstream Vera lisansı (DejaVu değişiklikleri kamu malı) | Yazılımla birlikte dağıtılabilir; yazı tipi tek başına satılamaz; değiştirilirse adı değişmeli (değiştirilmiyor). Türkçe harflerin hepsi ve ₺ var. |

Neden DejaVu? Liberation (Arial ölçülü) yazı tiplerinde ₺ işareti yok; DejaVu'da Türkçe'nin tüm harfleri ve ₺ var ve
lisansı gömmeye uygun.

## Destek

Destek sözü vermiyorum. Kod açık — hata bulursan issue aç, düzeltirsen pull request gönder,
kendi ihtiyacına göre değiştirmek istersen çekinme.
