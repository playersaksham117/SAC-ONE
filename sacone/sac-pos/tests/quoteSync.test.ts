import { describe, expect, it } from 'vitest';
import { withServerQuotation } from '../src/domain/serverSale';
import type { Quotation } from '../src/domain/types';

const totals = (grandTotal: number) => ({
  lines: [], subtotal: grandTotal, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: grandTotal,
  cgstAmount: 0, sgstAmount: 0, igstAmount: 0, gstAmount: 0, grandTotal, taxSplit: 'cgst_sgst' as const,
});

const local: Quotation = {
  id: 'local-q1', number: 'Q261023-0001', createdAt: '2026-10-23T10:00:00.000Z', userId: 'u1', userName: 'Asha',
  customer: { id: 'c1', name: 'KUMAR TRADERS', phone: null, gstin: null, gstStateCode: null },
  totals: totals(100), validUntil: '2026-10-30', notes: 'phone note', status: 'open',
  sync: 'synced', serverId: 'q-erp-1', serverNumber: 'SE/Q/0005/26-27',
};
const erp: Quotation = {
  id: 'erp-q-erp-1', number: 'SE/Q/0005/26-27', createdAt: '2026-10-23T10:00:00.000Z', userId: '', userName: 'Owner',
  customer: { id: 'c2', name: 'SAPPHIRE FOODS', phone: null, gstin: '04AANCS5595A2ZB', gstStateCode: '04' },
  totals: totals(250), validUntil: '2026-11-15', notes: 'revised in ERP', status: 'open',
  sync: 'synced', serverId: 'q-erp-1', serverNumber: 'SE/Q/0005/26-27', origin: 'erp', erpStatus: 'sent',
  customerPo: { number: 'PO-9', date: null },
};

describe('a phone quotation edited in the ERP', () => {
  const next = withServerQuotation(local, erp);
  it('takes the ERP customer, lines / totals, validity, notes and PO', () => {
    expect(next.customer?.name).toBe('SAPPHIRE FOODS');
    expect(next.totals.grandTotal).toBe(250);
    expect(next.validUntil).toBe('2026-11-15');
    expect(next.notes).toBe('revised in ERP');
    expect(next.customerPo?.number).toBe('PO-9');
  });
  it('keeps the phone’s own id, number and that it was made here', () => {
    expect(next).toMatchObject({ id: 'local-q1', number: 'Q261023-0001', userName: 'Asha', sync: 'synced' });
    expect(next.origin).toBeUndefined();
  });
  it('converted in the ERP shows as converted', () => {
    expect(withServerQuotation(local, { ...erp, status: 'converted', erpStatus: 'converted' }).status).toBe('converted');
  });
});
