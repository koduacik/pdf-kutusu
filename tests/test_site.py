"""Online sürüm: editör, reklamların çalıştığı ana sayfadan yalıtılmış mı?

dist/site yerel bir HTTP sunucusundan servis edilir. Dış adreslere (Google reklam betiği dahil)
giden istekler test sırasında kesilir ve kaydedilir.
"""
import functools
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest
from playwright.sync_api import expect

from conftest import DIST, ROOT, SAMPLES, SHOTS, markers, pdf

SITE = ROOT / "dist" / "site"


@pytest.fixture(scope="module")
def server():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(SITE)))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


@pytest.fixture
def site(browser, server):
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1000}, locale="tr-TR")
    blocked = []

    def cut(route):
        blocked.append(route.request.url)
        route.abort()

    ctx.route(re.compile(r"^https?://(?!127\.0\.0\.1)"), cut)
    page = ctx.new_page()
    requests = []
    page.on("request", lambda r: requests.append((r.frame.url if r.frame else "", r.method, r.url)))
    page.goto(f"{server}/index.html")
    frame = page.frame(url=re.compile(r"editor\.html$"))
    frame.wait_for_selector('html[data-ready="1"]', timeout=30000)
    yield page, frame, requests, blocked
    ctx.close()


def test_site_editoru_ayni_dosya():
    assert (SITE / "editor.html").read_bytes() == DIST.read_bytes(), "online editör dağıtım dosyasıyla aynı olmalı"
    assert (SITE / "PDF-Kutusu.html").read_bytes() == DIST.read_bytes()


def test_reklam_sayfasi_editore_erisemez(site):
    page, frame, requests, blocked = site
    sandbox = page.get_attribute("#editor-frame", "sandbox")
    assert set(sandbox.split()) == {"allow-scripts", "allow-downloads"}
    assert "allow-same-origin" not in sandbox

    # Ana sayfadaki (reklam betiklerinin çalıştığı) bir betik çerçevenin içini okumaya çalışıyor
    probe = page.evaluate("""() => {
        const f = document.getElementById('editor-frame');
        const out = { contentDocument: f.contentDocument === null ? 'null' : 'ERİŞTİ' };
        try { out.document = f.contentWindow.document.body.innerHTML.length; } catch (e) { out.document = e.name; }
        try { out.storage = f.contentWindow.localStorage.length; } catch (e) { out.storage = e.name; }
        try { out.fn = typeof f.contentWindow.PDFKutusu; } catch (e) { out.fn = e.name; }
        return out;
    }""")
    assert probe == {"contentDocument": "null", "document": "SecurityError",
                     "storage": "SecurityError", "fn": "SecurityError"}, probe

    # Çerçevenin kökeni opak ("null"): sayfanın kökeniyle aynı değil
    assert frame.evaluate("self.origin") == "null"
    # Çerçeve de dışarıya (ana sayfaya) uzanamaz
    assert frame.evaluate("() => { try { return parent.document.title } catch (e) { return e.name } }") == "SecurityError"

    # Yayıncı kimliği girilmeden Google'ın reklam betiği HİÇ yüklenmez; alanlar gri kutu durur
    assert not [u for u in blocked if "googlesyndication" in u or "doubleclick" in u]
    kutular = page.locator(".ad.bos")
    expect(kutular).to_have_count(2)
    expect(kutular.first).to_have_text("Reklam alanı")
    assert not [r for r in requests if "editor.html" in r[0] and not r[2].startswith(("blob:", "data:"))
                and not r[2].endswith("editor.html")], "editör çerçevesi hiçbir yere istek atmamalı"


def test_online_pdf_tarayicida_islenir_sunucuya_gitmez(site):
    page, frame, requests, blocked = site
    requests.clear()
    blocked.clear()
    frame.set_input_files("#file-input", [str(SAMPLES / "turkce_cok_sayfa.pdf"), str(SAMPLES / "gorselli.pdf")])
    expect(frame.locator("#grid .card[data-id]")).to_have_count(5, timeout=30000)
    frame.locator("#grid .card[data-id]").nth(1).hover()
    frame.locator("#grid .card[data-id]").nth(1).locator('[data-act="del"]').click()
    expect(frame.locator("#grid .card[data-id]")).to_have_count(4)
    page.wait_for_timeout(600)
    page.screenshot(path=str(SHOTS / "20_online_site.png"))
    with page.expect_download(timeout=60000) as dl:
        frame.click("#btn-save")
    d = dl.value
    assert d.suggested_filename == "turkce_cok_sayfa_duzenlendi.pdf"
    path = ROOT / "tests" / "cikti" / "online_duzenlendi.pdf"
    d.save_as(path)
    assert markers(pdf(path)) == ["İŞARET-S1", "İŞARET-S3", "İŞARET-S4", "GÖRSEL-S1"]
    # PDF açılıp kaydedilirken hiçbir ağ isteği yapılmadı (ne sunucuya ne başka yere)
    net = [r for r in requests if not r[2].startswith(("blob:", "data:"))]
    assert not net, f"PDF işlenirken ağ isteği yapıldı: {net}"
    assert not blocked


def test_site_sayfalari(browser, server):
    ctx = browser.new_context(viewport={"width": 1200, "height": 900})
    ctx.route(re.compile(r"^https?://(?!127\.0\.0\.1)"), lambda r: r.abort())
    page = ctx.new_page()
    page.goto(f"{server}/gizlilik.html")
    expect(page.locator("h1")).to_have_text("Gizlilik ve çerezler")
    expect(page.locator("body")).to_contain_text("PDF'leriniz sunucumuza yüklenmez")
    expect(page.locator("body")).to_contain_text("Google AdSense")
    page.screenshot(path=str(SHOTS / "21_gizlilik.png"), full_page=True)
    page.goto(f"{server}/nasil-kullanilir.html")
    expect(page.locator("#guvenlik")).to_be_visible()
    expect(page.locator("body")).to_contain_text("E-imzalı (elektronik imzalı) bir PDF'i düzenlersen imza geçersiz olur")
    page.screenshot(path=str(SHOTS / "22_nasil_kullanilir.png"), full_page=True)
    ctx.close()
