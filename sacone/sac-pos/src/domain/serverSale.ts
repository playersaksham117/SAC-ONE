import type { Payment, PaymentMethod, Quotation, Sale } from './types';
import type { ShipTo, Transport } from './dispatch';
import type { Period } from './warranty';

/** The ERP's current copy of a bill this phone synced (POST /api/v1/sync/sales/current). */
export interface ServerSale {
  id: string;
  number: string;
  date: string;
  customer: { id: string; name: string; phone: string | null; gstin: string | null; gstStateCode: string | null; address?: string | null; city?: string | null; state?: string | null } | null;
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

/** An ERP quotation (GET /api/v1/sync/documents). */
export interface ServerQuotation {
  id: string;
  number: string;
  date: string;
  createdAt: string;
  validUntil: string | null;
  status: string;
  preparedBy: string | null;
  notes: string | null;
  customer: { id: string | null; name: string; phone: string | null; gstin: string | null; gstStateCode: string | null } | null;
  customerPo: { number: string; date: string | null } | null;
  items: Omit<ServerSale['items'][number], 'quantityReturned' | 'serialNumbers'>[];
  subtotal: number; itemDiscountTotal: number; invoiceDiscount: number; taxableAmount: number;
  cgstAmount: number; sgstAmount: number; igstAmount: number; gstAmount: number; grandTotal: number;
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

/** A bill made in the ERP or on another terminal, as a read-mostly phone bill (returns / dues work by its ERP number). */
export function erpSale(s: ServerSale, source: 'erp' | 'terminal', createdBy: string | null): Sale {
  const base: Sale = {
    id: `erp-${s.id}`, number: s.number, createdAt: s.date, userId: '', userName: createdBy ?? (source === 'erp' ? 'ERP' : 'Other terminal'),
    customer: null, totals: { lines: [], subtotal: 0, itemDiscountTotal: 0, invoiceDiscount: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, gstAmount: 0, grandTotal: 0, taxSplit: 'cgst_sgst' },
    payments: [], amountPaid: 0, amountDue: 0, returned: {},
    sync: 'synced', serverId: s.id, serverNumber: s.number, origin: source,
  };
  return withServerSale(base, s);
}

/** An ERP quotation as a phone quotation: print / share / convert to a sale like one made here. */
export function erpQuotation(q: ServerQuotation): Quotation {
  const customer = q.customer ? { ...q.customer, id: q.customer.id ?? '' } : null;
  const asSale = erpSale({
    id: q.id, number: q.number, date: q.date || q.createdAt, customer,
    items: q.items.map((i) => ({ ...i, quantityReturned: 0, serialNumbers: [] })),
    subtotal: q.subtotal, itemDiscountTotal: q.itemDiscountTotal, invoiceDiscount: q.invoiceDiscount, taxableAmount: q.taxableAmount,
    cgstAmount: q.cgstAmount, sgstAmount: q.sgstAmount, igstAmount: q.igstAmount, gstAmount: q.gstAmount, grandTotal: q.grandTotal,
    amountPaid: 0, amountDue: 0, payments: [], customerPo: q.customerPo, transport: null, shipTo: null,
  }, 'erp', q.preparedBy);
  return {
    id: `erp-${q.id}`, number: q.number, createdAt: q.date || q.createdAt, userId: '', userName: q.preparedBy ?? 'ERP',
    customer,
    totals: asSale.totals,
    validUntil: (q.validUntil || (q.date || q.createdAt)).slice(0, 10),
    notes: q.notes,
    status: q.status === 'converted' ? 'converted' : 'open',
    sync: 'synced', serverId: q.id, serverNumber: q.number,
    origin: 'erp', erpStatus: q.status, customerPo: q.customerPo,
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
