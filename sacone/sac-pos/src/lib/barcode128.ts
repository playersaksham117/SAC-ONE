/**
 * Code 128 barcodes (same encoder as the ERP's lib/barcode128.js) (what label printers and SAC-POS / handheld scanners read), as inline SVG.
 * Digits-only text of even length uses code set C (two digits per symbol, compact, e.g. the
 * 8-digit product barcodes); anything else printable uses code set B.
 */

// Bar/space widths of symbol values 0–106 (103–105 = START A/B/C, 106 = STOP).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Symbol values (start, data, checksum, stop) for the text. */
export function code128Values(text: string): number[] {
  const s = String(text ?? '');
  if (!s) throw new Error('Nothing to encode');
  let values: number[];
  if (/^\d+$/.test(s) && s.length % 2 === 0) {
    values = [START_C];
    for (let i = 0; i < s.length; i += 2) values.push(Number(s.slice(i, i + 2)));
  } else {
    values = [START_B];
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error(`Character "${ch}" cannot be printed in a barcode`);
      values.push(code - 32);
    }
  }
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, checksum, STOP];
}

/** Module widths, alternating bar / space, starting with a bar. */
export function code128Modules(text: string): number[] {
  return code128Values(text).flatMap((v) => PATTERNS[v].split('').map(Number));
}

/** The barcode as an SVG string; width scales to fit, quiet zones of 10 modules each side. */
export function code128Svg(text: string, { height = 40, quiet = 10 }: { height?: number; quiet?: number } = {}): string {
  const widths = code128Modules(text);
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  let rects = '';
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

