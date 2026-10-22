import { describe, expect, it, vi } from 'vitest';

// receipt.ts prints through native modules; the HTML it builds needs none of them.
vi.mock('expo-print', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../src/store/upiQr', () => ({ uploadedQr: () => null }));
vi.mock('../src/store/signStamp', () => ({ signStampImages: () => ({ sign: null, stamp: null, print: false }) }));
vi.mock('../src/services/documentShare', () => ({ DocumentShareService: {} }));

const { billHtml } = await import('../src/lib/receipt');
import type { Sale } from '../src/domain/types';

const line = {
  productId: 'p1', name: 'Router', sku: 'R1', unit: 'pcs', quantity: 1, unitPrice: 1000, listPrice: 1000,
  discountAmount: 0, gstRate: 18, gross: 1000, invoiceDiscountShare: 0, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180,
};
const sale: Sale = {
  id: 's1', number: 'S261022-0003', createdAt: '2026-10-22T10:00:00.000Z', userId: 'u1', userName: 'Asha',
  customer: { id: 'c1', name: 'Sapphire Foods', phone: '9800000001', gstin: '06AAACS1234A1Z5', gstStateCode: '06', address: 'Plot 12, Udyog Vihar', city: 'Gurugram', state: 'Haryana' },
  totals: { lines: [line], subtotal: 1000, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, gstAmount: 180, grandTotal: 1180, taxSplit: 'cgst_sgst' },
  payments: [{ method: 'credit', amount: 1180 }], amountPaid: 0, amountDue: 1180, returned: {}, sync: 'pending',
  customerPo: { number: '4700072824', date: '2026-10-20' },
  shipTo: { name: 'Sapphire Foods – Warehouse', address: 'Khasra 44, NH-48', city: 'Manesar', state: 'Haryana', stateCode: '06' },
};

describe('Bill to / PO / Ship to on the printed bill', () => {
  for (const layout of ['classic', 'modern'] as const) {
    it(`${layout} A4 shows the buyer address, PO and ship-to`, () => {
      const html = billHtml(sale, { businessName: 'My Firm' }, 'POS1', 'A4', { layout, invoice: {} });
      expect(html).toContain('Plot 12, Udyog Vihar');
      expect(html).toContain('Gurugram');
      expect(html).toContain('4700072824');
      expect(html).toContain('Khasra 44, NH-48');
    });
  }
  it('80 mm receipt prints a long address in full, in a wrapping cell', () => {
    const long = 'CHD 34C PICCADILLY, KFC MALL, PICCADILLY CINEMA, GROUND FLOOR, SECTOR 34';
    const html = billHtml({ ...sale, customer: { ...sale.customer!, address: long } }, { businessName: 'My Firm' }, 'POS1', '80mm', {});
    expect(html).toContain(long);
    expect(html).toMatch(/<td class="r wrap">Sapphire Foods<br>CHD 34C PICCADILLY/);
    expect(html).toContain('.wrap{white-space:normal');
  });
  it('80 mm receipt shows the buyer address and PO', () => {
    const html = billHtml(sale, { businessName: 'My Firm' }, 'POS1', '80mm', {});
    expect(html).toContain('Plot 12, Udyog Vihar');
    expect(html).toContain('4700072824');
  });
});
