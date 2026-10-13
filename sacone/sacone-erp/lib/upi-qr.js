import QRCode from 'qrcode';

/** UPI "pay" link any UPI app understands; amount is optional (payer types it). */
export function upiPayUrl({ upiId, payee, amount, note }) {
  // UPI IDs are only letters, digits, . - _ and one @, which UPI apps expect unescaped.
  const params = [`pa=${String(upiId).trim()}`];
  if (payee) params.push(`pn=${encodeURIComponent(String(payee).slice(0, 50))}`);
  if (Number(amount) > 0) params.push(`am=${Number(amount).toFixed(2)}`);
  params.push('cu=INR');
  if (note) params.push(`tn=${encodeURIComponent(String(note).slice(0, 60))}`);
  return `upi://pay?${params.join('&')}`;
}

/** QR code as an inline SVG string (sync, works in the browser and in Node for print HTML). */
export function qrSvg(text, size = 110) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  let path = '';
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const box = n + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
