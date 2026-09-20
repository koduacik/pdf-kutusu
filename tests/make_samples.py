"""Test için örnek dosyalar üretir (tests/ornekler/).

İçerikler kurgusaldır; gerçek kişi ya da kurum adı yoktur.
Çalıştır:  .venv/bin/python tests/make_samples.py
"""
from pathlib import Path

import pikepdf
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "ornekler"
FONTS = ROOT / "node_modules" / "dejavu-fonts-ttf" / "ttf"

pdfmetrics.registerFont(TTFont("DV", str(FONTS / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DVB", str(FONTS / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("DVS", str(FONTS / "DejaVuSerif.ttf")))

PARAGRAF = [
    "Bu belge PDF Kutusu için hazırlanmış kurgusal bir örnektir.",
    "Türkçe harfler: ğ ü ş ı ö ç — Ğ Ü Ş İ Ö Ç. Işık ılık, iğne içinde.",
    "Çarşamba günü şöyle bir öğüt verildi: özenle çalış, ağır ol.",
]

# Test sabitleri (testler bunları arar)
KIRMIZI_YAZI = "Kırmızı satır: değiştirilecek yazı"
KIRMIZI_RENK = (0xC0 / 255, 0x39 / 255, 0x2B / 255)
KIRMIZI_BOY = 14
GIZLI = "Gizli Numara: TR00 0000 1111 2222 3333 44"


def turkce_cok_sayfa():
    p = OUT / "turkce_cok_sayfa.pdf"
    c = canvas.Canvas(str(p), pagesize=A4)
    c.setTitle("Örnek Belge")
    for n in range(1, 5):
        c.setFont("DVB", 20)
        c.drawString(72, 780, f"Örnek Belge — Sayfa {n}")
        c.setFont("DV", 11)
        y = 740
        for line in PARAGRAF:
            c.drawString(72, y, line)
            y -= 18
        c.drawString(72, y, f"Tutar: {n * 1250:,}".replace(",", ".") + ",00 ₺")
        y -= 18
        c.setFont("DVB", 12)
        c.drawString(72, y - 10, f"İŞARET-S{n}")
        if n == 1:
            c.setFillColorRGB(*KIRMIZI_RENK)
            c.setFont("DV", KIRMIZI_BOY)
            c.drawString(72, 600, KIRMIZI_YAZI)
            c.setFillColorRGB(0, 0, 0)
            c.setFont("DV", 12)
            c.drawString(72, 560, GIZLI)
            c.setFont("DVS", 12)
            c.drawString(72, 520, "Tırnaklı yazı tipiyle bir satır (serif).")
            c.setFont("Helvetica", 12)  # gömülü olmayan standart yazı tipi
            c.drawString(72, 490, "Standard Helvetica line (not embedded).")
            # renkli zemin üstünde yazı
            c.setFillColorRGB(0.85, 0.93, 1.0)
            c.rect(66, 440, 300, 26, stroke=0, fill=1)
            c.setFillColorRGB(0.05, 0.2, 0.5)
            c.setFont("DVB", 13)
            c.drawString(72, 448, "Mavi zemin üstünde kalın yazı")
            c.setFillColorRGB(0, 0, 0)
        c.showPage()
    c.save()
    return p


def donmus_sayfa():
    p = OUT / "donmus_sayfa.pdf"
    c = canvas.Canvas(str(p), pagesize=A4)
    for n in range(1, 4):
        c.setFont("DVB", 18)
        c.drawString(72, 780, f"DÖNÜK-S{n}")
        c.setFont("DV", 11)
        c.drawString(72, 750, "Bu sayfa döndürme testi içindir." if n != 2 else "Bu sayfa 90° döndürülmüş olarak kaydedildi.")
        c.showPage()
    c.save()
    with pikepdf.open(p, allow_overwriting_input=True) as pdf:
        pdf.pages[1].Rotate = 90
        pdf.save(p)
    return p


def gorselli():
    img_path = OUT / "_grafik.jpg"
    im = Image.new("RGB", (600, 360), (245, 248, 252))
    d = ImageDraw.Draw(im)
    renkler = [(15, 118, 110), (124, 58, 237), (194, 65, 12), (3, 105, 161), (190, 24, 93)]
    for i, h in enumerate([120, 220, 170, 290, 240]):
        d.rectangle([60 + i * 105, 330 - h, 130 + i * 105, 330], fill=renkler[i])
    d.line([40, 330, 580, 330], fill=(30, 30, 30), width=3)
    im.save(img_path, quality=92)
    p = OUT / "gorselli.pdf"
    c = canvas.Canvas(str(p), pagesize=A4)
    c.setFont("DVB", 18)
    c.drawString(72, 780, "GÖRSEL-S1: grafik içeren sayfa")
    c.drawImage(str(img_path), 72, 420, width=450, height=270)
    c.setFont("DV", 11)
    c.drawString(72, 400, "Şekil 1: Kurgusal aylık satışlar (₺).")
    c.showPage()
    c.save()
    img_path.unlink()
    return p


def sifreli():
    src = OUT / "turkce_cok_sayfa.pdf"
    p = OUT / "sifreli.pdf"
    with pikepdf.open(src) as pdf:
        pdf.save(p, encryption=pikepdf.Encryption(user="gizli123", owner="sahip456", R=6))
    return p


def kisitli():
    """Parola sormadan açılan ama şifreli (düzenleme kısıtlı) dosya."""
    src = OUT / "donmus_sayfa.pdf"
    p = OUT / "kisitli.pdf"
    with pikepdf.open(src) as pdf:
        pdf.save(p, encryption=pikepdf.Encryption(user="", owner="sahip456", R=4,
                                                  allow=pikepdf.Permissions(modify_other=False)))
    return p


def imza_png():
    """Şeffaf zeminli imza görseli."""
    p = OUT / "imza.png"
    im = Image.new("RGBA", (400, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(20, 110), (60, 40), (90, 120), (130, 50), (170, 115), (220, 45), (260, 110), (300, 70), (380, 95)]
    d.line(pts, fill=(20, 40, 160, 255), width=7, joint="curve")
    d.line([(40, 135), (360, 135)], fill=(20, 40, 160, 255), width=4)
    im.save(p)
    return p


def telefon_foto():
    """Telefonla çekilmiş gibi: diskte yatay (400x300), EXIF 'saat yönünde 90° çevir' (6).
    Doğru gösterilince dikey olur ve KIRMIZI kare SAĞ ÜSTTE, MAVİ kare SOL ALTTA görünür."""
    p = OUT / "telefon_foto.jpg"
    im = Image.new("RGB", (400, 300), (235, 235, 235))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 120, 90], fill=(220, 20, 20))       # diskte sol üst
    d.rectangle([280, 210, 399, 299], fill=(20, 60, 220))  # diskte sağ alt
    exif = Image.Exif()
    exif[0x0112] = 6
    im.save(p, quality=95, exif=exif.tobytes())
    return p


def kaydirilmis_kutu():
    """Sayfa kutusu (0,0)'dan başlamıyor ve kırpılmış: MediaBox [100 100 …], CropBox daha küçük."""
    p = OUT / "kaydirilmis_kutu.pdf"
    c = canvas.Canvas(str(p), pagesize=(A4[0] + 100, A4[1] + 100))
    c.translate(100, 100)
    c.setFont("DVB", 16)
    c.drawString(72, 760, "KUTU-S1: kaydırılmış sayfa kutusu")
    c.setFont("DV", 12)
    c.drawString(72, 730, "Bu satır değiştirilecek.")
    c.showPage()
    c.save()
    with pikepdf.open(p, allow_overwriting_input=True) as pdf:
        pg = pdf.pages[0]
        pg.MediaBox = [100, 100, 100 + A4[0], 100 + A4[1]]
        pg.CropBox = [110, 110, 100 + A4[0] - 10, 100 + A4[1] - 10]
        pdf.save(p)
    return p


def buyuk_dosya():
    """100 MB'tan büyük, GEÇERLİ bir PDF: sayfaya bağlı ama çizilmeyen, sıkıştırılamaz büyük bir akış içerir.
    Depoya konmaz (.gitignore); testler gerektiğinde üretir."""
    import os
    p = OUT / "buyuk_101mb.pdf"
    if p.exists() and p.stat().st_size > 100 * 1024 * 1024:
        return p
    with pikepdf.open(OUT / "turkce_cok_sayfa.pdf") as pdf:
        blob = pikepdf.Stream(pdf, os.urandom(101 * 1024 * 1024))
        pdf.pages[0].Resources.XObject = pdf.pages[0].Resources.get("/XObject", pikepdf.Dictionary())
        pdf.pages[0].Resources.XObject.Dolgu = pdf.make_indirect(blob)
        pdf.save(p)
    return p


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (turkce_cok_sayfa, donmus_sayfa, gorselli, sifreli, kisitli, imza_png, telefon_foto, kaydirilmis_kutu):
        path = fn()
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size:,} bayt")
