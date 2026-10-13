import { AppError } from './http.js';

/**
 * The customer's purchase order on a quotation or sale: { number, date } (date YYYY-MM-DD).
 * Fields left out of `data` keep `existing`'s value, so edits that don't mention the PO keep it;
 * an empty string clears it.
 */
export function customerPoFrom(data = {}, existing = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined;
  const number = has('customerPoNumber')
    ? String(data.customerPoNumber ?? '').replace(/\s+/g, ' ').trim()
    : (existing.customerPoNumber || '');
  let date = has('customerPoDate') ? String(data.customerPoDate ?? '').trim().slice(0, 10) : (existing.customerPoDate || '');

  if (number.length > 60) throw new AppError('Customer PO number is too long (60 characters at most)', 400, 'PO_INVALID');
  if (date) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime());
    if (!valid) throw new AppError('Customer PO date must be a date (YYYY-MM-DD)', 400, 'PO_INVALID');
  }
  if (date && !number) throw new AppError('Enter the customer PO number for the PO date', 400, 'PO_INVALID');
  if (!number) date = '';
  return { number: number || null, date: date || null };
}
