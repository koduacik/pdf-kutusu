"""PDF Kutusu uçtan uca testleri.

Her test arayüzü gerçek bir kullanıcı gibi kullanır (tıkla, sürükle, yaz), çıkan PDF'i indirir ve
PyMuPDF ile yeniden açıp sonucu doğrular. Çalıştır:
    node build.mjs && .venv/bin/python tests/make_samples.py && .venv/bin/python -m pytest -v tests
"""
import base64

import pymupdf
import pytest
from playwright.sync_api import expect

from conftest import SAMPLES, find_span, markers, page_texts, pdf, rgb_of

A4_W, A4_H = 595.28, 841.89
KIRMIZI = "Kırmızı satır: değiştirilecek yazı"
GIZLI = "Gizli Numara: TR00 0000 1111 2222 3333 44"
TR = "ğüşıöçİĞŞ ₺"


# ------------------------------------------------------------------ sayfa işleri

def test_birlestir_ve_cikti_adi(app):
    app.add("turkce_cok_sayfa.pdf", "donmus_sayfa.pdf", "gorselli.pdf", expect_count=8)
    app.shot("01_birlestirilmis_liste")
    path, name = app.save()
    assert name == "turkce_cok_sayfa_duzenlendi.pdf"
    d = pdf(path)
    assert d.page_count == 8
    assert markers(d) == ["İŞARET-S1", "İŞARET-S2", "İŞARET-S3", "İŞARET-S4",
                          "DÖNÜK-S1", "DÖNÜK-S2", "DÖNÜK-S3", "GÖRSEL-S1"]
    assert [p.rotation for p in d] == [0, 0, 0, 0, 0, 90, 0, 0], "kaynağın dönüşü korunmalı"
    assert d[7].get_images(), "görselli sayfadaki resim kaybolmamalı"
    # Türkçe metin bozulmadan taşındı mı?
    assert "Türkçe harfler: ğ ü ş ı ö ç — Ğ Ü Ş İ Ö Ç" in d[0].get_text()


def test_sil_dondur_cogalt_sirala(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.card_action(1, "del")                      # S2'yi sil → S1 S3 S4
    expect(app.cards()).to_have_count(3)
    app.card_action(0, "rotate")                   # S1 → 90°
    app.card_action(2, "dup")                      # S4'ü çoğalt → S1 S3 S4 S4
    expect(app.cards()).to_have_count(4)
    # 3. kartı (S4) en başa sürükle
    first = app.card(0).bounding_box()
    app.card(2).drag_to(app.card(0), target_position={"x": 12, "y": first["height"] / 2})
    app.page.wait_for_timeout(300)
    path, _ = app.save()
    d = pdf(path)
    assert d.page_count == 4
    assert markers(d) == ["İŞARET-S4", "İŞARET-S1", "İŞARET-S3", "İŞARET-S4"]
    assert [p.rotation for p in d] == [0, 90, 0, 0]
    assert "İŞARET-S2" not in "".join(page_texts(d)), "silinen sayfa çıktıda olmamalı"


def test_zaten_donuk_sayfayi_dondur(app):
    app.add("donmus_sayfa.pdf", expect_count=3)
    app.card_action(1, "rotate")   # 90 → 180
    app.card_action(2, "rotate")   # 0 → 90
    app.card_action(2, "rotate")   # 90 → 180
    app.card_action(2, "rotate")   # 180 → 270
    path, _ = app.save()
    assert [p.rotation for p in pdf(path)] == [0, 180, 270]


def test_bos_sayfa_ve_araya_baska_pdften_sayfa(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.page.click("#btn-blank")
    expect(app.cards()).to_have_count(5)
    # 1. ile 2. sayfanın arasına, donmus_sayfa.pdf'in 2-3. sayfalarını ekle
    app.card(1).hover()
    app.card(1).locator(".ins-before").click()
    with app.page.expect_file_chooser() as fc:
        app.modal_click("PDF ya da görsel seç…")
    fc.value.set_files(str(SAMPLES / "donmus_sayfa.pdf"))
    expect(app.modal()).to_contain_text("3 sayfa var")
    app.modal().locator("input").fill("2-3")
    app.modal_click("Ekle")
    expect(app.cards()).to_have_count(7)
    app.wait_idle()
    path, _ = app.save()
    d = pdf(path)
    assert markers(d) == ["İŞARET-S1", "DÖNÜK-S2", "DÖNÜK-S3", "İŞARET-S2", "İŞARET-S3", "İŞARET-S4", ""]
    blank = d[6]
    assert blank.get_text().strip() == ""
    assert abs(blank.rect.width - A4_W) < 0.5 and abs(blank.rect.height - A4_H) < 0.5


def test_ayir_aralik_indir(app):
    app.add("turkce_cok_sayfa.pdf", "gorselli.pdf", expect_count=5)
    app.page.click("#btn-split")
    inp = app.modal().locator("input")
    inp.fill("9")
    expect(app.modal()).to_contain_text("9. sayfa yok")
    app.modal_click("İndir")                       # hatalı aralıkta pencere kapanmamalı
    expect(app.modal()).to_be_visible()
    inp.fill("1-2, 4, son")
    expect(app.modal()).to_contain_text("4 sayfa: 1, 2, 4, 5")
    app.shot("05_ayir_penceresi")
    with app.page.expect_download() as dl:
        app.modal_click("İndir")
    d_ = dl.value
    assert d_.suggested_filename == "turkce_cok_sayfa_sayfa_1-2_4_son.pdf"
    path = SAMPLES.parent / "cikti" / d_.suggested_filename
    d_.save_as(path)
    assert markers(pdf(path)) == ["İŞARET-S1", "İŞARET-S2", "İŞARET-S4", "GÖRSEL-S1"]


def test_telefon_fotografi_yan_donmez(app):
    app.add("telefon_foto.jpg", expect_count=1)
    path, name = app.save()
    assert name == "telefon_foto_duzenlendi.pdf"
    page = pdf(path)[0]
    assert page.rect.height > page.rect.width, "EXIF'e göre dikey sayfa olmalı"
    pix = page.get_pixmap(dpi=40)

    def centroid(pred):
        xs = ys = n = 0
        for y in range(pix.height):
            for x in range(pix.width):
                r, g, b = pix.pixel(x, y)[:3]
                if pred(r, g, b):
                    xs += x; ys += y; n += 1
        return xs / n / pix.width, ys / n / pix.height

    rx, ry = centroid(lambda r, g, b: r > 180 and g < 80 and b < 80)
    bx, by = centroid(lambda r, g, b: b > 180 and r < 80)
    assert rx > 0.5 and ry < 0.5, f"kırmızı kare sağ üstte olmalı ({rx:.2f},{ry:.2f})"
    assert bx < 0.5 and by > 0.5, f"mavi kare sol altta olmalı ({bx:.2f},{by:.2f})"


def test_geri_al_ileri_al(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.card_action(0, "del")
    expect(app.cards()).to_have_count(3)
    app.page.keyboard.press("Control+z")
    expect(app.cards()).to_have_count(4)
    app.page.keyboard.press("Control+Shift+z")
    expect(app.cards()).to_have_count(3)
    app.page.keyboard.press("Control+z")
    path, _ = app.save()
    assert markers(pdf(path))[0] == "İŞARET-S1"


# ------------------------------------------------------------------ düzenleme

def test_mevcut_yaziyi_degistir(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(0)
    app.page.locator(f'.text-hit[data-text="{KIRMIZI}"]').click()
    expect(app.modal()).to_contain_text("DOSYANIN İÇİNDE KALIR")   # kullanıcı açıkça uyarılıyor
    app.shot("06_degistirme_uyarisi")
    app.modal_click("Anladım")
    ta = app.page.locator("textarea.ed-typing")
    expect(ta).to_have_value(KIRMIZI)
    yeni = f"Değişti: ÇĞİÖŞÜ çğıöşü ₺1.250"
    app.page.keyboard.type(yeni)
    app.shot("07_yazi_degisiyor")
    app.page.keyboard.press("Enter")
    expect(ta).to_have_count(0)
    app.page.wait_for_timeout(200)
    app.shot("08_yazi_degisti")
    app.done_editing()
    path, _ = app.save()
    d = pdf(path)
    orig = pdf(SAMPLES / "turkce_cok_sayfa.pdf")[0]
    o_span, _ = find_span(orig, KIRMIZI)
    n_span, _ = find_span(d[0], yeni)
    assert n_span, f"yeni yazı metin olarak okunmalı; sayfa metni: {d[0].get_text()!r}"
    assert n_span["text"].strip() == yeni
    assert abs(n_span["size"] - o_span["size"]) < 0.05, "aynı boy"
    assert all(abs(a - b) <= 10 for a, b in zip(rgb_of(n_span["color"]), rgb_of(o_span["color"]))), \
        f"aynı renk: {rgb_of(n_span['color'])} ≠ {rgb_of(o_span['color'])}"
    assert abs(n_span["origin"][0] - o_span["origin"][0]) < 0.6, "aynı yatay konum"
    assert abs(n_span["origin"][1] - o_span["origin"][1]) < 0.6, "aynı taban çizgisi"
    # Dürüstlük: eski yazı dosyada KALIYOR (kullanıcıya söylenen bu)
    assert KIRMIZI in d[0].get_text()
    # ...ama görünmüyor: eski yazının yeni yazıyla çakışmayan sağ ucunda kırmızı piksel kalmamalı
    pix = d[0].get_pixmap(dpi=150, clip=pymupdf.Rect(o_span["bbox"]))
    new_right = n_span["bbox"][2]
    x_from = max(0, int((new_right + 2 - o_span["bbox"][0]) * 150 / 72))
    reds = sum(1 for y in range(pix.height) for x in range(x_from, pix.width)
               if (lambda c: c[0] > 150 and c[1] < 110 and c[2] < 110)(pix.pixel(x, y)))
    assert reds == 0, f"eski kırmızı yazı görünür kalmış ({reds} piksel)"


def test_yeni_yazi_ve_seffaf_gorsel_ekle(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(1)
    app.page.click('[data-tool="text"]')
    app.page.fill("#p-size", "18")
    app.page.locator("#p-size").dispatch_event("change")
    app.page.fill("#p-color", "#1d4ed8")
    app.page.click("#p-bold")
    app.click_pt(100, 330)
    metin = f"Yeni yazı: {TR} 99,90"
    app.page.keyboard.type(metin)
    app.page.keyboard.press("Enter")
    # şeffaf PNG imza
    app.page.set_input_files("#image-input", str(SAMPLES / "imza.png"))
    img = app.page.locator(".edit-image")
    expect(img).to_have_count(1)
    # sürükle: imzayı yazının altına taşı
    b = img.bounding_box()
    app.page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    app.page.mouse.down()
    z = app.zoom(A4_W)
    app.page.mouse.move(b["x"] + b["width"] / 2 - 50 * z, b["y"] + b["height"] / 2 + 60 * z, steps=6)
    app.page.mouse.up()
    # köşesinden büyüt
    h = app.page.locator(".edit-image .handle").bounding_box()
    app.page.mouse.move(h["x"] + 5, h["y"] + 5)
    app.page.mouse.down()
    app.page.mouse.move(h["x"] + 5 + 40 * z, h["y"] + 5 + 40 * z, steps=5)
    app.page.mouse.up()
    app.shot("09_yazi_ve_imza_eklendi")
    app.done_editing()
    app.shot("10_liste_duzenleme_rozeti")
    path, _ = app.save()
    page = pdf(path)[1]
    span, _ = find_span(page, "Yeni yazı")
    assert span and span["text"] == metin, f"Türkçe harfler ve ₺ bozulmamalı: {span and span['text']!r}"
    assert abs(span["size"] - 18) < 0.05
    assert rgb_of(span["color"]) == (0x1D, 0x4E, 0xD8)
    assert "Bold" in span["font"], span["font"]
    imgs = page.get_images(full=True)
    assert len(imgs) == 1
    assert imgs[0][1] != 0, "PNG'nin şeffaflığı (SMask) korunmalı"
    info = page.get_image_info()[0]
    x0, y0, x1, y1 = info["bbox"]
    assert (x1 - x0) > 250, "görsel büyütülmüş olmalı"
    # Şeffaf köşe: altındaki beyaz sayfa görünmeli (siyah/renkli değil)
    pix = page.get_pixmap(dpi=72, clip=pymupdf.Rect(x0 + 1, y0 + 1, x0 + 6, y0 + 6))
    assert all(c > 245 for c in pix.pixel(2, 2)[:3]), f"şeffaf alan beyaz görünmeli: {pix.pixel(2, 2)}"


def test_kalici_karart(app):
    orig = pdf(SAMPLES / "turkce_cok_sayfa.pdf")
    assert GIZLI in orig[0].get_text(), "örnek dosyada gizli bilgi okunabiliyor olmalı"
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(0)
    top_before = app.page_box()["y"]
    app.page.click('[data-tool="redact"]')
    expect(app.modal()).to_contain_text("resme çevrilir")
    app.modal_click("Anladım")
    assert abs(app.page_box()["y"] - top_before) < 0.5, "araç değişince sayfa yerinden oynamamalı"
    hit = app.page.locator(f'.text-hit[data-text="{GIZLI}"]').bounding_box()
    m = app.page.mouse
    m.move(hit["x"] - 6, hit["y"] - 6)
    m.down()
    m.move(hit["x"] + hit["width"] / 2, hit["y"] + hit["height"] / 2, steps=4)
    m.move(hit["x"] + hit["width"] + 6, hit["y"] + hit["height"] + 6, steps=4)
    m.up()
    expect(app.page.locator(".edit.role-redact")).to_have_count(1)
    app.shot("11_kalici_karart")
    app.done_editing()
    expect(app.card(0).locator(".badge.danger")).to_be_visible()
    path, _ = app.save()
    d = pdf(path)
    assert d.page_count == 4
    assert d[0].get_text().strip() == "", "karartılan sayfada seçilebilir yazı kalmamalı"
    assert not d[0].get_fonts(), "karartılan sayfada yazı tipi (yani metin) olmamalı"
    everything = "".join(page_texts(d))
    assert "TR00 0000 1111" not in everything, "gizli bilgi dosyadan silinmeli"
    raw = path.read_bytes()
    assert b"TR00" not in raw
    assert "İŞARET-S2" in d[1].get_text(), "diğer sayfalar metin olarak kalmalı"
    assert abs(d[0].rect.width - A4_W) < 0.5 and abs(d[0].rect.height - A4_H) < 0.5, "sayfa boyu korunmalı"
    # Karartılan yer siyah
    o_span, _ = find_span(orig[0], GIZLI)
    x0, y0, x1, y1 = o_span["bbox"]
    pix = d[0].get_pixmap(dpi=72, clip=pymupdf.Rect((x0 + x1) / 2 - 2, (y0 + y1) / 2 - 2, (x0 + x1) / 2 + 2, (y0 + y1) / 2 + 2))
    assert all(c < 30 for c in pix.pixel(1, 1)[:3])


def test_donuk_sayfada_yazi_ekle_ve_degistir(app):
    app.add("donmus_sayfa.pdf", expect_count=3)
    app.edit_page(1)  # /Rotate 90: ekranda yatay
    b = app.page_box()
    assert b["width"] > b["height"], "90° dönük sayfa yatay görünmeli"
    # Yeni yazı: ekranda düz okunmalı
    app.page.click('[data-tool="text"]')
    app.click_pt(80, 120, page_width_pt=A4_H)
    app.page.keyboard.type("Dik okunan yeni yazı")
    app.page.keyboard.press("Enter")
    # Mevcut (kağıtta yan duran) yazıyı değiştir: aynı yönde kalmalı
    app.page.click('[data-tool="select"]')
    app.page.locator('.text-hit[data-text="DÖNÜK-S2"]').click()
    app.modal_click("Anladım")
    expect(app.page.locator("textarea.ed-typing")).to_have_value("DÖNÜK-S2")
    app.page.keyboard.type("DÖNÜK-İKİ")
    app.page.keyboard.press("Enter")
    app.shot("12_donuk_sayfa")
    app.done_editing()
    path, _ = app.save()
    page = pdf(path)[1]
    assert page.rotation == 90
    s_new, line_new = find_span(page, "Dik okunan yeni yazı")
    s_rep, line_rep = find_span(page, "DÖNÜK-İKİ")
    assert s_new and s_rep
    # PyMuPDF yönleri döndürülmemiş sayfaya göre verir; /Rotate 90'da ekranda düz okunan yazı (0,-1) yönündedir
    assert tuple(round(v) for v in line_new["dir"]) == (0, -1), line_new["dir"]
    assert tuple(round(v) for v in line_rep["dir"]) == (1, 0), line_rep["dir"]
    o_span, _ = find_span(pdf(SAMPLES / "donmus_sayfa.pdf")[1], "DÖNÜK-S2")
    assert abs(s_rep["origin"][0] - o_span["origin"][0]) < 0.6 and abs(s_rep["origin"][1] - o_span["origin"][1]) < 0.6


def test_duzenleyicide_geri_al(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(0)
    app.page.click('[data-tool="rect"]')
    app.drag_pt(300, 100, 400, 160)
    expect(app.page.locator(".edit.role-shape")).to_have_count(1)
    app.page.keyboard.press("Control+z")
    expect(app.page.locator(".edit.role-shape")).to_have_count(0)
    app.page.keyboard.press("Control+Shift+z")
    expect(app.page.locator(".edit.role-shape")).to_have_count(1)
    app.done_editing()
    path, _ = app.save()
    # örtü kutusu çizildi: sayfada o bölge beyaz bir dikdörtgenle kaplı (çizim olarak)
    drawings = pdf(path)[0].get_drawings()
    assert any(abs(dr["rect"].width - 100) < 1 and abs(dr["rect"].height - 60) < 1 for dr in drawings)


# ------------------------------------------------------------------ hatalar ve uyarılar

def test_sifreli_pdf_anlasilir_hata(app):
    app.add("sifreli.pdf")
    expect(app.modal()).to_contain_text("parola ile şifrelenmiş")
    expect(app.modal().locator("h2")).to_have_text("Şifreli PDF açılamadı")
    app.shot("13_sifreli_hata")
    app.modal_click("Tamam")
    expect(app.cards()).to_have_count(0)
    expect(app.page.locator("#empty")).to_be_visible()
    # Kısıtlı (parola sormayan ama şifreli) dosya
    app.add("kisitli.pdf")
    expect(app.modal()).to_contain_text("şifreli")
    app.modal_click("Tamam")
    # Program çökmedi: normal dosya açılıyor
    app.add("turkce_cok_sayfa.pdf", expect_count=4)


def test_100mbtan_buyuk_dosya_uyarisi(app):
    import make_samples
    big = make_samples.buyuk_dosya()          # diskte gerçek, geçerli, 101 MB'lık PDF
    assert big.stat().st_size > 100 * 1024 * 1024
    app.page.set_input_files("#file-input", str(big))
    expect(app.modal()).to_contain_text("100 MB'tan büyük")
    app.shot("14_buyuk_dosya_uyarisi")
    app.modal_click("Vazgeç")
    expect(app.modal()).to_have_count(0)
    expect(app.cards()).to_have_count(0)
    # Kullanıcı ısrar ederse açılır ve çalışır
    app.page.set_input_files("#file-input", str(big))
    app.modal_click("Yine de aç")
    expect(app.cards()).to_have_count(4, timeout=60000)
    app.wait_idle()


def test_pdf_olmayan_dosya_anlasilir_hata(app, tmp_path):
    f = tmp_path / "not.pdf"
    f.write_text("Bu bir PDF değil, düz yazı.")
    app.page.set_input_files("#file-input", str(f))
    expect(app.modal()).to_contain_text("“not.pdf” açılamadı: PDF, JPG ya da PNG değil.")
    app.modal_click("Tamam")
    expect(app.cards()).to_have_count(0)
    app.add("gorselli.pdf", expect_count=1)


def test_dosyayi_surukle_birak(app):
    data = base64.b64encode((SAMPLES / "gorselli.pdf").read_bytes()).decode()
    app.page.evaluate("""([b64, name]) => {
        const bin = atob(b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const dt = new DataTransfer(); dt.items.add(new File([u], name, { type: 'application/pdf' }));
        const target = document.querySelector('.drop-card');
        target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }""", [data, "gorselli.pdf"])
    expect(app.cards()).to_have_count(1)


# ------------------------------------------------------------------ ağ yasağı

def test_ag_baglantisi_tarayici_tarafindan_engellenir(app):
    """Sayfa bir bağlantı kurmaya kalkarsa tarayıcı (CSP) engeller — kodun iyi niyetine güvenmeden."""
    result = app.page.evaluate("""async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
        const out = {};
        try { await fetch('https://example.com/fetch'); out.fetch = 'GİTTİ'; } catch (e) { out.fetch = 'engellendi'; }
        try { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com/xhr'); x.send(); } catch (e) { /* senkron hata da olabilir */ }
        try { new WebSocket('wss://example.com/ws'); } catch (e) { /* senkron hata da olabilir */ }
        navigator.sendBeacon('https://example.com/beacon', 'x');
        await new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = 'https://example.com/img.png'; });
        try { await import('https://example.com/mod.js'); out.import = 'yüklendi'; } catch (e) { out.import = 'engellendi'; }
        const w = new Worker(URL.createObjectURL(new Blob(["fetch('https://example.com/worker').then(() => postMessage('GİTTİ'), () => postMessage('engellendi'))"])));
        out.worker = await new Promise((r) => { w.onmessage = (e) => r(e.data); w.onerror = () => r('başlamadı'); });
        await new Promise((r) => setTimeout(r, 500));
        out.violations = violations;
        return out;
    }""")
    assert result["fetch"] == "engellendi"
    assert result["import"] == "engellendi"
    assert result["worker"] == "engellendi", "işçi (worker) içinden de bağlanılamamalı"
    joined = " ".join(result["violations"])
    for kind in ("fetch", "xhr", "ws", "beacon", "img.png", "mod.js"):
        assert f"example.com/{kind}" in joined, f"{kind} denemesi CSP ihlali olarak raporlanmalı: {result['violations']}"
    for directive in ("connect-src", "img-src", "script-src"):
        assert directive in joined
    # Ağ katmanında: denenen her istek daha sunucuya gitmeden tarayıcı tarafından durduruldu
    external = [u for u in app.requests if not u.startswith(("file:", "data:", "blob:"))]
    for u in external:
        assert "csp" in (app.failed.get(u) or "").lower(), f"{u} CSP ile engellenmedi: {app.failed.get(u)}"
    app.requests[:] = [u for u in app.requests if u not in external]


def test_internet_kapaliyken_calisir(browser):
    from conftest import TARAYICI
    # Playwright'ın WebKit'inde "offline" kipi file:// açılışını da durduruyor (araç kısıtı);
    # orada ağ, tüm http(s)/ws istekleri kesilerek kapatılır.
    ctx = browser.new_context(accept_downloads=True, offline=TARAYICI != "webkit", viewport={"width": 1360, "height": 900})
    if TARAYICI == "webkit":
        ctx.route(lambda url: not url.startswith(("file:", "data:", "blob:")), lambda r: r.abort())
    page = ctx.new_page()
    from conftest import App
    a = App(page, ctx)
    a.open()
    a.add("turkce_cok_sayfa.pdf", "gorselli.pdf", expect_count=5)
    a.edit_page(0)
    a.page.click('[data-tool="text"]')
    a.click_pt(300, 120)
    a.page.keyboard.type(f"İnternetsiz eklendi {TR}")
    a.page.keyboard.press("Enter")
    a.done_editing()
    a.shot("15_internet_kapali")
    path, _ = a.save()
    d = pdf(path)
    assert d.page_count == 5
    assert f"İnternetsiz eklendi {TR}" in d[0].get_text()
    a.assert_clean()
    ctx.close()


# ------------------------------------------------------------------ zor durumlar

def test_kaydirilmis_sayfa_kutusunda_konumlar_dogru(app):
    """MediaBox (0,0)'dan başlamıyor ve CropBox daha küçük: yazılar yine doğru yere düşmeli."""
    app.add("kaydirilmis_kutu.pdf", expect_count=1)
    app.edit_page(0)
    W = 575.28  # kırpılmış genişlik
    app.page.locator('.text-hit[data-text="Bu satır değiştirilecek."]').click()
    app.modal_click("Anladım")
    expect(app.page.locator("textarea.ed-typing")).to_have_value("Bu satır değiştirilecek.")
    app.page.keyboard.type("Bu satır değişti.")
    app.page.keyboard.press("Enter")
    app.page.click('[data-tool="text"]')
    app.click_pt(50, 200, page_width_pt=W)
    app.page.keyboard.type("Yeni satır")
    app.page.keyboard.press("Enter")
    app.done_editing()
    path, _ = app.save()
    page = pdf(path)[0]
    orig = pdf(SAMPLES / "kaydirilmis_kutu.pdf")[0]
    assert page.cropbox == orig.cropbox and page.mediabox == orig.mediabox
    o, _ = find_span(orig, "Bu satır değiştirilecek.")
    n, _ = find_span(page, "Bu satır değişti.")
    assert n and abs(n["origin"][0] - o["origin"][0]) < 0.6 and abs(n["origin"][1] - o["origin"][1]) < 0.6
    y, _ = find_span(page, "Yeni satır")
    assert y and abs(y["origin"][0] - 50) < 1.0, y["origin"]
    # tıklanan nokta yazının yüksekliğinin ortasına denk gelir; taban çizgisi biraz aşağıda
    assert 200 < y["origin"][1] < 200 + 14, y["origin"]


def test_cogaltilan_sayfaya_yazilan_aslina_sizmaz(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.card_action(0, "dup")
    expect(app.cards()).to_have_count(5)
    app.edit_page(1)                       # kopya
    app.page.click('[data-tool="text"]')
    app.click_pt(300, 100)
    app.page.keyboard.type("Yalnız kopyada")
    app.page.keyboard.press("Enter")
    app.done_editing()
    path, _ = app.save()
    d = pdf(path)
    assert markers(d)[:2] == ["İŞARET-S1", "İŞARET-S1"]
    assert "Yalnız kopyada" not in d[0].get_text()
    assert "Yalnız kopyada" in d[1].get_text()


def test_renkli_zemindeki_kalin_yaziyi_degistir(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(0)
    app.page.locator('.text-hit[data-text="Mavi zemin üstünde kalın yazı"]').click()
    app.modal_click("Anladım")
    expect(app.page.locator("textarea.ed-typing")).to_have_value("Mavi zemin üstünde kalın yazı")
    app.page.keyboard.type("Kısa")
    app.page.keyboard.press("Enter")
    app.done_editing()
    path, _ = app.save()
    page = pdf(path)[0]
    orig = pdf(SAMPLES / "turkce_cok_sayfa.pdf")[0]
    o, _ = find_span(orig, "Mavi zemin")
    n, _ = find_span(page, "Kısa")
    assert "Bold" in n["font"], "kalın yazı kalın kalmalı"
    assert all(abs(a - b) <= 10 for a, b in zip(rgb_of(n["color"]), rgb_of(o["color"])))
    # eski yazının artık boş kalan sağ tarafı mavi zeminle örtülmeli (beyaz delik olmamalı)
    x = (n["bbox"][2] + o["bbox"][2]) / 2
    ymid = (o["bbox"][1] + o["bbox"][3]) / 2
    r, g, b = page.get_pixmap(dpi=72, clip=pymupdf.Rect(x - 1, ymid - 1, x + 1, ymid + 1)).pixel(0, 0)[:3]
    assert (abs(r - 217) < 8 and abs(g - 237) < 8 and abs(b - 255) < 8), f"örtü zemin renginde olmalı: {(r, g, b)}"


def test_duzenleyicide_telefon_fotografi_yan_donmez(app):
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(2)
    app.page.set_input_files("#image-input", str(SAMPLES / "telefon_foto.jpg"))
    expect(app.page.locator(".edit-image")).to_have_count(1)
    app.done_editing()
    path, _ = app.save()
    page = pdf(path)[2]
    x0, y0, x1, y1 = page.get_image_info()[0]["bbox"]
    assert (y1 - y0) > (x1 - x0), "fotoğraf dik durmalı"
    pix = page.get_pixmap(dpi=72, clip=pymupdf.Rect(x0, y0, x1, y1))
    tr = pix.pixel(pix.width - 4, 4)[:3]      # sağ üst
    bl = pix.pixel(4, pix.height - 4)[:3]     # sol alt
    assert tr[0] > 180 and tr[2] < 90, f"sağ üst kırmızı olmalı: {tr}"
    assert bl[2] > 180 and bl[0] < 90, f"sol alt mavi olmalı: {bl}"
    assert page.get_images(full=True)[0][8] == "DCTDecode", "JPEG yeniden sıkıştırılmadan (kayıpsız) gömülmeli"


def test_uyari_kapanir_kapanmaz_yazmak(app):
    """Gerçek kullanımda çıktı: uyarıyı kapatıp hemen yazmaya başlayınca tuşlar kaybolmamalı.
    (Yazı kutusu, renk örneklemesi beklenmeden açılır.)"""
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.edit_page(0)
    app.page.locator(f'.text-hit[data-text="{KIRMIZI}"]').click()
    app.modal_click("Anladım")
    app.page.keyboard.type("Hemen yazdım")        # beklemeden
    ta = app.page.locator("textarea.ed-typing")
    expect(ta).to_have_value("Hemen yazdım")
    app.page.keyboard.press("Enter")
    expect(ta).to_have_count(0)
    app.done_editing()
    path, _ = app.save()
    page = pdf(path)[0]
    span, _ = find_span(page, "Hemen yazdım")
    orig, _ = find_span(pdf(SAMPLES / "turkce_cok_sayfa.pdf")[0], KIRMIZI)
    assert span, d_text if (d_text := page.get_text()) else "yazı yok"
    # renk örneklemesi sonradan gelse de eski yazının rengine oturmuş olmalı
    assert all(abs(a - b) <= 12 for a, b in zip(rgb_of(span["color"]), rgb_of(orig["color"]))), rgb_of(span["color"])


def test_ayir_yazarken_kizmaz(app):
    """Gerçek kullanımda çıktı: '1-' yazarken hata gösterilmemeli, İndir'e basınca gösterilmeli."""
    app.add("turkce_cok_sayfa.pdf", expect_count=4)
    app.page.click("#btn-split")
    inp = app.modal().locator("input")
    inp.fill("1-")
    expect(app.modal().locator(".error-text")).to_have_count(0)
    expect(app.modal()).to_contain_text("Örnek: 1-3, 7, 10-son")
    app.modal_click("İndir")
    expect(app.modal().locator(".error-text")).to_have_count(1)   # şimdi uyarır
    expect(app.modal()).to_be_visible()
    inp.fill("1-2")
    expect(app.modal()).to_contain_text("2 sayfa: 1, 2")
    with app.page.expect_download() as dl:
        app.modal_click("İndir")
    assert dl.value.suggested_filename.endswith("_sayfa_1-2.pdf")
