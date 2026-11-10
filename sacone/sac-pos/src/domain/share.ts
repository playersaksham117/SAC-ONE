import { formatMoney } from './money';

/** Shared PDFs live in app-private cache only this long; older files are deleted on the next sweep. */
export const SHARE_FILE_TTL_MS = 30 * 60 * 1000;

const MAX_NAME = 60;

/** Strip control characters and collapse whitespace so user data can't break the share text or file name. */
export function cleanText(value: unknown, max = 80): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** "INV/24-25/1025" → "Invoice-INV-24-25-1025.pdf". Only [A-Za-z0-9._-], never a path. */
export function shareFileName(documentNumber: string, prefix = 'Invoice'): string {
  const safe = cleanText(documentNumber, MAX_NAME)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/\.{2,}/g, '.');
  return `${prefix}-${safe || 'document'}.pdf`;
}

/**
 * Short, non-sensitive caption: document number, amount and a thank-you.
 * Never includes customer details, links, tokens or server addresses.
 */
export function invoiceShareMessage(documentNumber: string, amount: number): string {
  return `Invoice ${cleanText(documentNumber, 40)} | Amount ${formatMoney(amount)} | Thank you for your business.`;
}

export function isExpiredShareFile(modifiedAtMs: number | null | undefined, nowMs = Date.now(), ttlMs = SHARE_FILE_TTL_MS): boolean {
  return !modifiedAtMs || nowMs - modifiedAtMs > ttlMs;
}

/** Bill date as dd-Mmm-yyyy in India time, e.g. 07-Nov-2026. */
function billDateText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/ /g, '-');
}

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export interface WhatsAppBill {
  number: string;
  createdAt: string;
  customer: { name?: string | null } | null;
  totals: { lines: { name: string; quantity: number; unit?: string | null; lineTotal: number }[]; grandTotal: number };
  amountPaid?: number;
  amountDue?: number;
}

/**
 * The bill as a WhatsApp message (SAC-POS phone app): shop, invoice number, date, customer, each
 * product with its quantity and amount (GST included), and the total. *…* is bold in WhatsApp.
 */
export function invoiceWhatsAppText(bill: WhatsAppBill, shopName?: string | null): string {
  const lines = bill.totals.lines.map((l, i) =>
    `${i + 1}. ${cleanText(l.name, 60)}\n    Qty ${qtyText(l.quantity)}${l.unit ? ` ${cleanText(l.unit, 10)}` : ''} | Amt ${formatMoney(l.lineTotal)}`);
  const due = Number(bill.amountDue) || 0;
  return [
    shopName ? `*${cleanText(shopName, 60)}*` : null,
    `Invoice: *${cleanText(bill.number, 40)}*`,
    `Date: ${billDateText(bill.createdAt)}`,
    `Customer: ${cleanText(bill.customer?.name, 60) || 'Walk-in customer'}`,
    '',
    ...lines,
    '',
    `*Total: ${formatMoney(bill.totals.grandTotal)}*`,
    due > 0.009 ? `Paid: ${formatMoney(Number(bill.amountPaid) || 0)} | Due: ${formatMoney(due)}` : null,
    '',
    'Thank you for your business.',
  ].filter((x) => x !== null).join('\n');
}

/** WhatsApp link: to the customer's mobile (India) when known, otherwise WhatsApp asks for the chat. */
export function whatsAppUrl(text: string, mobile10?: string | null): string {
  return `whatsapp://send?${mobile10 ? `phone=91${mobile10}&` : ''}text=${encodeURIComponent(text)}`;
}
