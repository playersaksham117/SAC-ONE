import { apiRequest } from './api';
import { creditNoteDocument, documentHtml, money, purchaseDocument } from './bill-document';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

/** DocumentDialog loader for one GST credit note (customer return). */
export async function loadCreditNote(id) {
  const [note, company, invoice] = await Promise.all([
    apiRequest(`/api/notes/credit/${id}`),
    apiRequest('/api/company').catch(() => null),
    apiRequest('/api/settings/invoice').catch(() => ({})),
  ]);
  const customer = note.customerId && !note.customerIsWalkIn
    ? await apiRequest(`/api/customers/${note.customerId}`).catch(() => null)
    : null;
  const model = creditNoteDocument(note, customer);
  const number = note.noteNumber || note.returnNumber;
  return {
    summary: [
      ['Credit note', number],
      ['Date', day(note.createdAt)],
      ['Against invoice', note.invoiceNumber || '—'],
      ['Customer', note.customerIsWalkIn ? 'Walk-in' : note.customerName || '—'],
      ['Value', money(note.grandTotal)],
      ['Set against dues', money(note.adjustedAmount)],
      ['Refunded', note.refundAmount > 0 ? `${money(note.refundAmount)} (${note.refundMethod})` : '—'],
      ...(note.reason ? [['Reason', note.reason]] : []),
    ],
    html: (size, layout) => documentHtml(model, company, size, { layout, invoice }),
    defaultLayout: invoice.layout,
    items: note.items,
    csvName: number,
    share: { number, amount: note.grandTotal, label: 'Credit Note' },
  };
}

/** DocumentDialog loader for one GST debit note (return to a supplier). */
export async function loadDebitNote(id) {
  const [note, company, invoice] = await Promise.all([
    apiRequest(`/api/notes/debit/${id}`),
    apiRequest('/api/company').catch(() => null),
    apiRequest('/api/settings/invoice').catch(() => ({})),
  ]);
  const supplier = note.supplierId ? await apiRequest(`/api/suppliers/${note.supplierId}`).catch(() => null) : null;
  const model = purchaseDocument('return', note, supplier);
  const number = note.noteNumber || note.returnNumber;
  return {
    summary: [
      ['Debit note', number],
      ['Date', day(note.returnDate)],
      ['Against bill', note.billNumber || '— (direct return)'],
      ['Supplier', note.supplierName || '—'],
      ['Value', money(note.grandTotal)],
      ['Set against bill', money(note.adjustedAmount)],
      ...(note.reason ? [['Reason', note.reason]] : []),
    ],
    html: (size, layout) => documentHtml(model, company, size, { layout, invoice }),
    defaultLayout: invoice.layout,
    items: note.items,
    csvName: number,
    share: { number, amount: note.grandTotal, label: 'Debit Note' },
  };
}
