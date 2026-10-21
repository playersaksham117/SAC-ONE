import type { Payment, PaymentMethod, Sale } from './types';
import type { ShipTo, Transport } from './dispatch';
import type { Period } from './warranty';

/** The ERP's current copy of a bill this phone synced (POST /api/v1/sync/sales/current). */
export interface ServerSale {
  id: string;
  number: string;
  date: string;
  customer: { id: string; name: string; phone: string | null; gstin: string | null; gstStateCode: string | null } | null;
  items: {
    productId: string; name: string; sku: string; hsn: string | null; unit: string;
    quantity: number; unitPrice: number; discountAmount: number; gstRate: number;
    taxableAmount: number; gstAmount: number; lineTotal: number; quantityReturned: number;
    warranty: Period | null; guarantee: Period | null; serialNumbers: string[]; shortDescription: string | null;
  }[];
  subtotal: number; itemDiscountTotal: number; invoiceDiscount: number; taxableAmount: number;
  cgstAmount: number; sgstAmount: number; igstAmount: number; gstAmount: number; grandTotal: number;
  amountPaid: number; amountDue: number;
  payments: { method: string; amount: number; reference: string | null }[];
  customerPo: { number: string; date: string | null } | null;
  transport: Transport | null;
  shipTo: ShipTo | null;
}

export type ServerSaleStatus = { ref: string; status: 'current'; sale: ServerSale } | { ref: string; status: 'voided' | 'unknown' };

const METHODS: PaymentMethod[] = ['cash', 'upi', 'bank', 'credit'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The phone's bill updated to what the ERP now has (an admin's Edit bill): items, prices, tax,
 * customer, payments, date, PO, transport and Ship To. Phone-only details (cash drawer, notes,
 * exchange, sync state) stay as they were.
 */
export function withServerSale(local: Sale, s: ServerSale): Sale {
  const oldLines = new Map(local.totals.lines.map((l) => [l.productId, l]));
  const lines = s.items.map((i) => {
    const gross = r2(i.quantity * i.unitPrice);
    return {
      productId: i.productId, name: i.name, sku: i.sku, barcode: oldLines.get(i.productId)?.barcode ?? null,
      hsn: i.hsn, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice,
      listPrice: oldLines.get(i.productId)?.listPrice ?? i.unitPrice,
      discountAmount: i.discountAmount, gstRate: i.gstRate,
      warranty: i.warranty, guarantee: i.guarantee,
      serialNumbers: i.serialNumbers.length ? i.serialNumbers : undefined,
      shortDescription: i.shortDescription,
      gross,
      invoiceDiscountShare: Math.max(0, r2(gross - i.discountAmount - i.taxableAmount)),
      taxableAmount: i.taxableAmount, gstAmount: i.gstAmount, lineTotal: i.lineTotal,
    };
  });
  const returned: Record<string, number> = { ...local.returned };
  for (const i of s.items) returned[i.productId] = Math.max(returned[i.productId] || 0, i.quantityReturned);
  const payments: Payment[] = s.payments
    .filter((p) => (METHODS as string[]).includes(p.method))
    .map((p) => ({ method: p.method as PaymentMethod, amount: p.amount, reference: p.reference }));
  return {
    ...local,
    serverId: s.id,
    serverNumber: s.number,
    createdAt: s.date,
    customer: s.customer,
    totals: {
      lines,
      subtotal: s.subtotal, itemDiscountTotal: s.itemDiscountTotal, invoiceDiscount: s.invoiceDiscount,
      taxableAmount: s.taxableAmount, cgstAmount: s.cgstAmount, sgstAmount: s.sgstAmount, igstAmount: s.igstAmount,
      gstAmount: s.gstAmount, grandTotal: s.grandTotal,
      taxSplit: s.igstAmount > 0 ? 'igst' : 'cgst_sgst',
    },
    payments,
    amountPaid: s.amountPaid,
    amountDue: s.amountDue,
    customerPo: s.customerPo,
    transport: s.transport,
    shipTo: s.shipTo,
    cancelledInErp: undefined,
    returned,
  };
}

/** Same content, ignoring key order and empty (null / undefined) fields. */
export function sameDoc(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort()
        .filter((k) => (v as Record<string, unknown>)[k] != null)
        .map((k) => [k, canon((v as Record<string, unknown>)[k])]);
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
