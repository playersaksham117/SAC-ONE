// QR matrix from the qrcode package's pure-JS core (no canvas / native code).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode/lib/core/qrcode') as {
  create: (text: string, opts: { errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' }) => { modules: { size: number; get: (x: number, y: number) => number | boolean } };
};

/** Bank that receives UPI payments (ERP → the terminal's bank, else the firm's default bank). */
export interface PayBank {
  id?: string;
  name?: string;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  accountType?: string | null;
  upiId?: string | null;
}

const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/** UPI "pay" link any UPI app understands; the amount is optional (the payer types it). */
export function upiPayUrl({ upiId, payee, amount, note }: { upiId: string; payee?: string | null; amount?: number; note?: string }) {
  const params = [`pa=${upiId.trim()}`];
  if (payee) params.push(`pn=${encodeURIComponent(payee.slice(0, 50))}`);
  if (amount && amount > 0) params.push(`am=${amount.toFixed(2)}`);
  params.push('cu=INR');
  if (note) params.push(`tn=${encodeURIComponent(note.slice(0, 60))}`);
  return `upi://pay?${params.join('&')}`;
}

export const hasUpi = (bank?: PayBank | null): bank is PayBank & { upiId: string } => Boolean(bank?.upiId && UPI_PATTERN.test(bank.upiId));

/** Rows of dark/light modules (true = dark), without the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return Array.from({ length: modules.size }, (_, y) => Array.from({ length: modules.size }, (_, x) => Boolean(modules.get(x, y))));
}

/** The QR as an inline SVG string, for printed receipts. */
export function qrSvg(text: string, px = 110): string {
  const m = qrMatrix(text);
  const quiet = 2;
  let path = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  const box = m.length + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

const KIND: Record<string, string> = { savings: 'Savings', current: 'Current', od: 'OD', cc: 'CC' };

/** "Our Bankers" lines for receipts; falls back to the free-text bank details. */
export function bankerLines(bank?: PayBank | null, fallback?: string): string[] {
  if (!bank) return fallback?.trim() ? [fallback.trim()] : [];
  return [
    [bank.bankName, bank.branch].filter(Boolean).join(', '),
    [bank.accountHolder, bank.accountNumber ? `A/c No. ${bank.accountNumber}` : '', bank.accountType && KIND[bank.accountType] ? `(${KIND[bank.accountType]})` : ''].filter(Boolean).join(' '),
    [bank.ifsc ? `IFSC ${bank.ifsc}` : '', bank.upiId ? `UPI ${bank.upiId}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean);
}
