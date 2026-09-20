// Reklam alanları. Yayıncı kimliği girilene kadar Google'ın betiği YÜKLENMEZ;
// alanlar yerinde gri kutu olarak durur (sayfa düzeni kaymasın diye).
// Yayına almak için: aşağıdaki kimliği ve index.html'deki data-slot numaralarını doldur.
(function () {
  var YAYINCI = 'ca-pub-XXXXXXXXXXXXXXXX';          // ← AdSense yayıncı kimliği
  var hazir = /^ca-pub-[0-9]{10,}$/.test(YAYINCI);
  var alanlar = document.querySelectorAll('.ad');

  if (!hazir) {
    for (var i = 0; i < alanlar.length; i++) {
      alanlar[i].classList.add('bos');
      alanlar[i].textContent = 'Reklam alanı';
    }
    return;
  }
  for (var j = 0; j < alanlar.length; j++) {
    var k = alanlar[j];
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', YAYINCI);
    ins.setAttribute('data-ad-slot', k.getAttribute('data-slot') || '');
    ins.setAttribute('data-ad-format', k.getAttribute('data-format') || 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    k.appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
  var s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + YAYINCI;
  document.head.appendChild(s);
})();
