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
