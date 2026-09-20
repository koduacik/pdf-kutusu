// "1-3, 7, 10-son" gibi sayfa aralıklarını çözer. Sonuç 0 tabanlı sayfa sıraları.

export class RangeError_ extends Error {}

export function parseRanges(expr, count) {
  const text = String(expr ?? '').trim().toLocaleLowerCase('tr');
  if (!text) throw new RangeError_('Sayfa aralığı yaz. Örnek: 1-3, 7, 10-son');
  const out = [];
  const num = (tok) => {
    if (tok === 'son') return count;
    if (!/^\d+$/.test(tok)) throw new RangeError_(`“${tok}” bir sayfa numarası değil.`);
    const n = parseInt(tok, 10);
    if (n < 1 || n > count) {
      throw new RangeError_(`${n}. sayfa yok; belgede ${count} sayfa var.`);
    }
    return n;
  };
  for (const raw of text.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^([^\s\-–—]+)\s*(?:[-–—]\s*([^\s\-–—]+))?$/.exec(part);
    if (!m) throw new RangeError_(`“${part}” anlaşılamadı. Örnek: 1-3, 7, 10-son`);
    const a = num(m[1]);
    const b = m[2] !== undefined ? num(m[2]) : a;
    const step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) out.push(i - 1);
  }
  if (!out.length) throw new RangeError_('Hiç sayfa seçilmedi.');
  return out;
}
