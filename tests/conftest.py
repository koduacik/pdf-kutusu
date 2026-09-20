"""Ortak test düzeneği: gerçek Chrome'da (Playwright) dist/PDF Kutusu.html'i açar.

Her test sonunda iki şey kendiliğinden denetlenir:
  * sayfa hiçbir ağ isteği atmadı (file:, data:, blob: dışında istek = test başarısız)
  * sayfada yakalanmamış JavaScript hatası olmadı
"""
import os
import re
from pathlib import Path

import pymupdf
import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "PDF Kutusu.html"
SAMPLES = ROOT / "tests" / "ornekler"
OUT = ROOT / "tests" / "cikti"
SHOTS = ROOT / "tests" / "ekran"
LOCAL = ("file:", "data:", "blob:")

OUT.mkdir(exist_ok=True)
SHOTS.mkdir(exist_ok=True)


# Tarayıcı seçimi: TARAYICI=chrome (varsayılan, bilgisayardaki Google Chrome) | firefox | webkit (Safari motoru)
TARAYICI = os.environ.get("TARAYICI", "chrome")


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        # HEADED=1 → pencere görünür; YAVAS=250 → her adım arasında 250 ms (gösterim için)
        opts = {"headless": os.environ.get("HEADED") != "1", "slow_mo": int(os.environ.get("YAVAS", "0"))}
        if TARAYICI == "chrome":
            b = p.chromium.launch(channel="chrome", **opts)
        else:
            b = getattr(p, TARAYICI).launch(**opts)
        yield b
        b.close()


class App:
    def __init__(self, page, context):
        self.page = page
        self.context = context
        self.requests = []
        self.errors = []
        self.console_errors = []
        self.failed = {}
        page.on("request", lambda r: self.requests.append(r.url))
        page.on("requestfailed", lambda r: self.failed.__setitem__(r.url, r.failure))
        page.on("pageerror", lambda e: self.errors.append(str(e)))
        page.on("console", lambda m: self.console_errors.append(m.text) if m.type == "error" else None)

    # --- gezinme
    def open(self):
        self.page.goto(DIST.as_uri())
        self.page.wait_for_selector('html[data-ready="1"]', timeout=30000)
        return self

    def cards(self):
        return self.page.locator("#grid .card[data-id]")

    def add(self, *names, expect_count=None):
        self.page.set_input_files("#file-input", [str(SAMPLES / n) for n in names])
        if expect_count is not None:
            expect(self.cards()).to_have_count(expect_count, timeout=30000)
        self.wait_idle()

    def wait_idle(self):
        expect(self.page.locator("#busy")).to_be_hidden(timeout=60000)

    def card(self, i):
        return self.cards().nth(i)

    def card_action(self, i, act):
        c = self.card(i)
        c.hover()
        c.locator(f'[data-act="{act}"]').click()

    def modal(self):
        return self.page.locator(".modal")

    def modal_click(self, label):
        self.modal().get_by_role("button", name=label, exact=True).click()

    # --- kaydetme
    def save(self, button="#btn-save"):
        with self.page.expect_download(timeout=60000) as dl:
            self.page.click(button)
        d = dl.value
        path = OUT / d.suggested_filename
        d.save_as(path)
        self.wait_idle()
        return path, d.suggested_filename

    # --- düzenleyici
    def edit_page(self, i):
        self.card(i).dblclick()
        expect(self.page.locator("#editor")).to_be_visible()
        self.page.wait_for_timeout(400)

    def page_box(self):
        return self.page.locator("#ed-page").bounding_box()

    def zoom(self, page_width_pt):
        return self.page_box()["width"] / page_width_pt

    def click_pt(self, x, y, page_width_pt=595.28):
        b = self.page_box()
        z = b["width"] / page_width_pt
        self.page.mouse.click(b["x"] + x * z, b["y"] + y * z)

    def drag_pt(self, x0, y0, x1, y1, page_width_pt=595.28):
        b = self.page_box()
        z = b["width"] / page_width_pt
        m = self.page.mouse
        m.move(b["x"] + x0 * z, b["y"] + y0 * z)
        m.down()
        m.move(b["x"] + (x0 + x1) / 2 * z, b["y"] + (y0 + y1) / 2 * z, steps=4)
        m.move(b["x"] + x1 * z, b["y"] + y1 * z, steps=4)
        m.up()

    def done_editing(self):
        self.page.click("#ed-done")
        expect(self.page.locator("#editor")).to_be_hidden()

    def shot(self, name, full=False):
        suffix = "" if TARAYICI == "chrome" else f"_{TARAYICI}"
        self.page.screenshot(path=str(SHOTS / f"{name}{suffix}.png"), full_page=full)

    # --- denetim
    def assert_clean(self):
        external = [u for u in self.requests if not u.startswith(LOCAL)]
        assert not external, f"Ağ isteği yapılmamalıydı: {external}"
        assert not self.errors, f"Sayfa hatası: {self.errors}"


@pytest.fixture
def app(browser):
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1360, "height": 900}, locale="tr-TR")
    page = ctx.new_page()
    a = App(page, ctx)
    a.open()
    yield a
    a.assert_clean()
    ctx.close()


# --------------------------------------------------------------- PDF denetim yardımcıları

def pdf(path):
    return pymupdf.open(str(path))


def page_texts(doc):
    return [p.get_text() for p in doc]


def markers(doc):
    """Her sayfadaki İŞARET-S#, DÖNÜK-S#, GÖRSEL-S# işaretini sırayla döndür ('' = boş sayfa)."""
    out = []
    for t in page_texts(doc):
        m = re.search(r"(İŞARET|DÖNÜK|GÖRSEL)-S\d", t)
        out.append(m.group(0) if m else "")
    return out


def find_span(page, needle):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if needle in span["text"]:
                    return span, line
    return None, None


def rgb_of(color_int):
    return ((color_int >> 16) & 255, (color_int >> 8) & 255, color_int & 255)
