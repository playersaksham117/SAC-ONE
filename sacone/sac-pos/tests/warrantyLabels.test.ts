import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/printDocument', () => ({ printDocument: async () => undefined }));
vi.mock('../src/lib/receipt', () => ({ billNumber: (s: { serverNumber?: string; number: string }) => s.serverNumber ?? s.number }));

const { saleWarrantyUnits } = await import('../src/lib/warrantyLabels');
const { warrantyLabelsHtml } = await import('../src/lib/labels');

const line = (over: Record<string, unknown>) => ({
  productId: 'p', name: 'X', sku: 'X', unit: 'pcs', quantity: 1, unitPrice: 100, listPrice: 100, discountAmount: 0, gstRate: 18,
  gross: 100, taxableAmount: 100, gstAmount: 18, lineTotal: 118, ...over,
});

const sale = {
  id: 's1', number: 'S-0001', serverNumber: 'SE/0421/26-27', createdAt: '2026-10-30T06:00:00.000Z', userId: 'u', userName: 'U', customer: null,
  totals: {
    lines: [
      line({ productId: 'fan', name: 'CEILING FAN', quantity: 2, serialNumbers: ['SN1', 'SN2'], warranty: { value: 2, unit: 'years' } }),
      line({ productId: 'bulb', name: 'LED BULB', quantity: 3, guarantee: { value: 6, unit: 'months' } }),
      line({ productId: 'wire', name: 'WIRE', quantity: 5 }),
      line({ productId: 'fit', name: 'FITTING', quantity: 1, itemType: 'service', warranty: { value: 1, unit: 'months' } }),
    ],
  },
  payments: [], amountPaid: 0, amountDue: 0, returned: { bulb: 1 }, sync: 'synced',
};

describe('warranty labels after a sale', () => {
  const units = saleWarrantyUnits(sale as never, { shop: 'SARTHI ENTERPRISES', branch: 'WAREHOUSE HOM' });

  it('one label per serial, one per kept unit with a warranty / guarantee, none for plain items or services', () => {
    expect(units.map((u) => u.serial ?? `${u.productName}`)).toEqual(['SN1', 'SN2', 'LED BULB', 'LED BULB']);
  });

  it('end dates run from the bill date; shop, branch and the ERP bill number on each', () => {
    expect(units[0]).toMatchObject({ shop: 'SARTHI ENTERPRISES', branch: 'WAREHOUSE HOM', invoiceNumber: 'SE/0421/26-27', saleDate: '2026-10-30', warrantyTill: '2028-10-29', guaranteeTill: null });
    expect(units[2]).toMatchObject({ warrantyTill: null, guaranteeTill: '2027-04-29', serial: null });
  });

  it('prints a barcode of the serial, else the bill number', () => {
    const html = warrantyLabelsHtml(units, { size: '50x25' });
    expect(html.match(/class="lbl"/g)?.length).toBe(4);
    expect(html).toContain('S/N SN1');
    expect(html).toContain('>SE/0421/26-27</div>');
    expect(html).toContain('<svg');
  });
});
