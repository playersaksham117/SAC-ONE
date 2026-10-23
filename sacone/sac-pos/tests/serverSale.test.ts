import { describe, expect, it } from 'vitest';
import { erpQuotation, erpSale, sameDoc, withServerSale, type ServerSale } from '../src/domain/serverSale';
import type { Sale } from '../src/domain/types';

const line = {
  productId: 'p1', name: 'Router', sku: 'R1', barcode: '890123', unit: 'pcs', quantity: 1, unitPrice: 1000, listPrice: 1000,
  discountAmount: 0, gstRate: 18, gross: 1000, invoiceDiscountShare: 0, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180,
};
const local: Sale = {
  id: 'local-1', number: 'S261021-0001', createdAt: '2026-10-21T10:00:00.000Z', userId: 'u1', userName: 'Asha',
  customer: null,
  totals: { lines: [line], subtotal: 1000, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, gstAmount: 180, grandTotal: 1180, taxSplit: 'cgst_sgst' },
  payments: [{ method: 'cash', amount: 1180 }], amountPaid: 1180, amountDue: 0,
  cashDrawer: { received: { '500': 3 }, change: {} }, notes: 'phone note',
  returned: {}, sync: 'synced', serverId: 'old', serverNumber: 'SE/0001/26-27',
};
const server: ServerSale = {
  id: 'new', number: 'SE/0001/26-27', date: '2026-10-20T06:30:00.000Z',
  customer: { id: 'c1', name: 'Sapphire Foods', phone: null, gstin: '04AANCS1234A2ZB', gstStateCode: '04' },
  items: [{ productId: 'p1', name: 'Router', sku: 'R1', hsn: '8517', unit: 'pcs', quantity: 2, unitPrice: 1000, discountAmount: 0, gstRate: 18,
    taxableAmount: 2000, gstAmount: 360, lineTotal: 2360, quantityReturned: 0, warranty: { value: 1, unit: 'years' }, guarantee: null, serialNumbers: ['SN1', 'SN2'], shortDescription: null }],
  subtotal: 2000, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 2000, cgstAmount: 0, sgstAmount: 0, igstAmount: 360, gstAmount: 360, grandTotal: 2360,
  amountPaid: 2360, amountDue: 0, payments: [{ method: 'upi', amount: 2360, reference: null }],
  customerPo: { number: 'PO-7', date: null }, transport: { mode: 'By Road' }, shipTo: null,
};

describe('bill edited in the ERP', () => {
  const next = withServerSale(local, server);
  it('takes the ERP items, tax, customer, payments, date and dispatch', () => {
    expect(next.serverId).toBe('new');
    expect(next.createdAt).toBe(server.date);
    expect(next.customer?.name).toBe('Sapphire Foods');
    expect(next.totals.lines[0]).toMatchObject({ quantity: 2, lineTotal: 2360, barcode: '890123', serialNumbers: ['SN1', 'SN2'] });
    expect(next.totals).toMatchObject({ grandTotal: 2360, igstAmount: 360, taxSplit: 'igst' });
    expect(next.payments).toEqual([{ method: 'upi', amount: 2360, reference: null }]);
    expect(next.customerPo?.number).toBe('PO-7');
  });
  it('keeps phone-only details', () => {
    expect(next).toMatchObject({ id: 'local-1', number: 'S261021-0001', notes: 'phone note', cashDrawer: local.cashDrawer, sync: 'synced' });
  });
  it('refreshing again changes nothing', () => {
    expect(sameDoc(withServerSale(next, server), next)).toBe(true);
    expect(sameDoc(next, local)).toBe(false);
  });
});

describe('documents pulled from the ERP', () => {
  it('an ERP bill becomes a synced phone bill numbered by its ERP number (returns / dues match it)', () => {
    const s = erpSale(server, 'erp', 'Owner');
    expect(s.id).toBe('erp-new');
    expect(s.number).toBe('SE/0001/26-27');
    expect(s.sync).toBe('synced');
    expect(s.origin).toBe('erp');
    expect(s.userName).toBe('Owner');
    expect(s.totals.grandTotal).toBe(2360);
    expect(s.totals.lines[0].quantity).toBe(2);
  });

  it('an ERP quotation keeps its lines, customer and validity and can be converted', () => {
    const q = erpQuotation({
      id: 'q1', number: 'SE/Q/0003/26-27', date: '2026-10-21T00:00:00.000Z', createdAt: '2026-10-21T17:40:21.226Z',
      validUntil: '2026-10-28', status: 'sent', preparedBy: 'Owner', notes: null,
      customer: { id: 'c1', name: 'Sapphire Foods', phone: null, gstin: null, gstStateCode: '04' },
      customerPo: null,
      items: server.items.map(({ quantityReturned: _q, serialNumbers: _s, ...i }) => i),
      subtotal: 2000, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 2000, cgstAmount: 0, sgstAmount: 0, igstAmount: 360, gstAmount: 360, grandTotal: 2360,
    });
    expect(q.number).toBe('SE/Q/0003/26-27');
    expect(q.status).toBe('open');
    expect(q.validUntil).toBe('2026-10-28');
    expect(q.customer?.id).toBe('c1');
    expect(q.totals.lines).toHaveLength(1);
    expect(q.totals.grandTotal).toBe(2360);
    expect(q.origin).toBe('erp');
  });
});
