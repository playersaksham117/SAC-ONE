import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-print', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../src/store/upiQr', () => ({ uploadedQr: () => null }));
vi.mock('../src/store/signStamp', () => ({ signStampImages: () => ({}) }));
vi.mock('../src/services/documentShare', () => ({ DocumentShareService: {} }));
vi.mock('../src/lib/printDocument', () => ({ printDocument: async () => undefined }));

const { invoiceFor } = await import('../src/lib/receipt');

const gstBank = { id: 'b1', name: 'HDFC CA', upiId: 'shop@hdfcbank' };
const quickBank = { id: 'b2', name: 'ICICI SB', upiId: 'shop@icici' };

describe('Quick Bill printing', () => {
  it('a Quick Bill prints the Quick Bill bank and its own QR slot', () => {
    const inv = invoiceFor({ series: 'quick' }, { bank: gstBank as never, quickBank: quickBank as never });
    expect(inv.bank).toBe(quickBank);
    expect(inv.qrSlot).toBe('quick');
  });
  it('a GST bill keeps the usual bank', () => {
    const inv = invoiceFor({ series: null }, { bank: gstBank as never, quickBank: quickBank as never });
    expect(inv.bank).toBe(gstBank);
    expect(inv.qrSlot).toBeUndefined();
  });
  it('no Quick Bill bank set: Quick Bills use the usual bank too', () => {
    const inv = invoiceFor({ series: 'quick' }, { bank: gstBank as never, quickBank: null });
    expect(inv.bank).toBe(gstBank);
  });
});

describe('Quick Bill payload', () => {
  it('sends the series to SACONE', async () => {
    const { salePayload } = await import('../src/domain/payloads');
    const sale = {
      id: 's', number: 'S-1', createdAt: new Date().toISOString(), userId: 'u', userName: 'U', customer: null,
      totals: { lines: [], subtotal: 0, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, gstAmount: 0, grandTotal: 0, taxSplit: 'cgst_sgst' },
      payments: [], amountPaid: 0, amountDue: 0, returned: {}, sync: 'pending', series: 'quick',
    };
    expect(salePayload(sale as never, 'u').series).toBe('quick');
    expect(salePayload({ ...sale, series: null } as never, 'u').series).toBeNull();
  });
});
