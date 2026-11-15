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

export interface ReminderBill {
  number: string;
  createdAt: string;
  amountDue: number;
  /** 'YYYY-MM-DD' the bill should be paid by, when set. */
  dueDate?: string | null;
}

/** Whole days from date a to date b ('YYYY-MM-DD'). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Payment reminder as a WhatsApp message (SAC-POS phone app): the customer's balance due and,
 * when the phone's bills add up to no more than that balance, the unpaid bills (oldest first)
 * with how many days each is overdue, plus the shop's UPI ID to pay to.
 * The balance is the ERP's figure; bill-wise dues on the phone can be out of date, so the
 * list is left out when it would claim more than the balance.
 */
export function paymentReminderText(input: {
  customerName: string;
  outstanding: number;
  bills?: ReminderBill[];
  shopName?: string | null;
  upiId?: string | null;
  /** 'YYYY-MM-DD' (India date) to count overdue days from. */
  today: string;
  /** Days a credit bill may stay unpaid when the bill has no due date. */
  creditDays?: number | null;
}): string {
  const outstanding = Math.max(Number(input.outstanding) || 0, 0);
  const open = (input.bills ?? [])
    .filter((b) => (Number(b.amountDue) || 0) > 0.009)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const listed = open.reduce((s, b) => s + b.amountDue, 0);
  const showBills = open.length > 0 && listed <= outstanding + 1;
  const shown = open.slice(0, 10);
  const billLines = showBills ? shown.map((b, i) => {
    const billDate = billDateText(b.createdAt);
    const due = b.dueDate || (input.creditDays ? new Date(Date.parse(b.createdAt) + 330 * 60000 + input.creditDays * 86400000).toISOString().slice(0, 10) : null);
    const late = due ? daysBetween(due, input.today) : 0;
    return `${i + 1}. ${cleanText(b.number, 40)} | ${billDate} | Due ${formatMoney(b.amountDue)}${late > 0 ? ` (${late} day${late === 1 ? '' : 's'} overdue)` : ''}`;
  }) : [];
  return [
    input.shopName ? `*${cleanText(input.shopName, 60)}*` : null,
    '*Payment reminder*',
    '',
    `Dear ${cleanText(input.customerName, 60) || 'Customer'},`,
    `Your balance due with us is *${formatMoney(outstanding)}*.`,
    ...(billLines.length ? ['', 'Pending bills:', ...billLines, open.length > shown.length ? `…and ${open.length - shown.length} more` : null] : []),
    '',
    input.upiId ? `Pay by UPI: ${cleanText(input.upiId, 80)}` : null,
    'Please ignore this if you have already paid. Thank you.',
  ].filter((x) => x !== null).join('\n');
}
