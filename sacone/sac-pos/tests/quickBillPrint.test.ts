import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-print', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../src/store/upiQr', () => ({ uploadedQr: () => null }));
vi.mock('../src/store/signStamp', () => ({ signStampImages: () => ({ sign: null, stamp: null, print: false }) }));
vi.mock('../src/services/documentShare', () => ({ DocumentShareService: {} }));

const { billHtml } = await import('../src/lib/receipt');
import type { Sale } from '../src/domain/types';

// 2 × ₹100 + 18% GST = ₹118 each incl. GST → ₹236
const line = {
  productId: 'p1', name: 'Steel Bottle', sku: 'B1', hsn: '7323', unit: 'pcs', quantity: 2, unitPrice: 100, listPrice: 100,
  discountAmount: 0, gstRate: 18, gross: 200, invoiceDiscountShare: 0, taxableAmount: 200, gstAmount: 36, lineTotal: 236,
};
const quick: Sale = {
  id: 's1', number: 'Q-1', createdAt: '2026-11-06T10:00:00.000Z', userId: 'u1', userName: 'Asha', customer: null,
  totals: { lines: [line], subtotal: 200, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0, gstAmount: 36, grandTotal: 236, taxSplit: 'cgst_sgst' },
  payments: [{ method: 'cash', amount: 236 }], amountPaid: 236, amountDue: 0, returned: {}, sync: 'pending', series: 'quick',
};
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Quick Bill invoice: GST-inclusive rate and amount only', () => {
  for (const [label, size, layout] of [['classic A4', 'A4', 'classic'], ['modern A5', 'A5', 'modern'], ['80 mm receipt', '80mm', 'classic']] as const) {
    it(label, () => {
      const html = billHtml(quick, null, undefined, size, { layout });
      const text = plain(html);
      expect(text).toContain('118.00'); // rate incl. GST
      expect(text).toContain('236.00'); // amount incl. GST
      expect(text).not.toMatch(/Taxable|Sub-Total|SGST <|CGST <|Within State Tax/i);
      expect(text).not.toMatch(/\b100\.00\b/); // the before-GST rate is not printed
      expect(text).not.toMatch(/GST [₹0-9]|CGST|SGST|IGST|Includes GST/i); // no GST amounts at all
    });
  }
  it('a GST bill keeps its tax columns', () => {
    const text = plain(billHtml({ ...quick, series: null }, null, undefined, 'A4', { layout: 'classic' }));
    expect(text).toMatch(/Taxable/);
    expect(text).toMatch(/Within State Tax/);
  });
});
