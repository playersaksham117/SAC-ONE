import { round2 } from './money';
import type { CartLine, CartTotals, ComputedLine } from './types';

/**
 * Mirrors SACONE `calculateCartTotals` (sacone-api/src/services/pos.js) exactly, so the
 * terminal's invoice total always equals what the ERP books:
 *  - prices are GST-exclusive
 *  - line: unitPrice × qty − line discount → taxable
 *  - invoice discount is spread over lines pro-rata (last line takes the remainder)
 *  - same state (or unknown) → CGST + SGST halves, otherwise IGST
 *  - the final amount in whole rupees (.50 and above up, below .50 down)
 */
export function calculateCart(
  lines: CartLine[],
  invoiceDiscount = 0,
  { companyStateCode, customerStateCode }: { companyStateCode?: string | null; customerStateCode?: string | null } = {},
): CartTotals {
  const prepared = lines.map((l) => {
    const gross = round2(l.unitPrice * l.quantity);
    const taxableBeforeInvoice = round2(gross - (l.discountAmount || 0));
    return { line: l, gross, taxableBeforeInvoice };
  });

  const subtotal = round2(prepared.reduce((s, p) => s + p.gross, 0));
  const itemDiscountTotal = round2(lines.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const taxableBefore = round2(prepared.reduce((s, p) => s + p.taxableBeforeInvoice, 0));
  const invDisc = round2(Math.max(0, Number(invoiceDiscount) || 0));

  let allocated = 0;
  const computed: ComputedLine[] = prepared.map((p, index) => {
    let share = 0;
    if (invDisc > 0 && taxableBefore > 0) {
      if (index === prepared.length - 1) {
        share = round2(invDisc - allocated);
      } else {
        share = round2((p.taxableBeforeInvoice / taxableBefore) * invDisc);
        allocated = round2(allocated + share);
      }
    }
    const taxableAmount = round2(p.taxableBeforeInvoice - share);
    const gstAmount = round2(taxableAmount * ((p.line.gstRate || 0) / 100));
    return {
      ...p.line,
      gross: p.gross,
      invoiceDiscountShare: share,
      taxableAmount,
      gstAmount,
      lineTotal: round2(taxableAmount + gstAmount),
    };
  });

  const taxableAmount = round2(computed.reduce((s, l) => s + l.taxableAmount, 0));
  const gstAmount = round2(computed.reduce((s, l) => s + l.gstAmount, 0));
  const exactTotal = round2(computed.reduce((s, l) => s + l.lineTotal, 0));
  const grandTotal = roundRupee(exactTotal);
  const sameState = !customerStateCode || !companyStateCode || String(customerStateCode) === String(companyStateCode);

  return {
    lines: computed,
    subtotal,
    itemDiscountTotal,
    invoiceDiscount: invDisc,
    taxableAmount,
    cgstAmount: sameState ? round2(gstAmount / 2) : 0,
    sgstAmount: sameState ? round2(gstAmount / 2) : 0,
    igstAmount: sameState ? 0 : gstAmount,
    gstAmount,
    roundOff: round2(grandTotal - exactTotal),
    grandTotal,
    taxSplit: sameState ? 'cgst_sgst' : 'igst',
  };
}

/** Final amounts in whole rupees: .50 and above goes up, below .50 goes down. */
export function roundRupee(n: number): number {
  return Math.round(round2(n));
}

/** Value of `qty` units of a sold line, pro-rata to what the customer paid for it. */
export function lineRefundValue(line: ComputedLine, qty: number): number {
  if (!line.quantity) return 0;
  return round2(line.lineTotal * (qty / line.quantity));
}

/**
 * Quick Bill: the counter sees and types GST-inclusive prices only. The bill itself still holds
 * the price before GST (what the ERP books, and from which it works out GST, margin and profit).
 */
const round4 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
const factor = (gstRate: number) => 1 + (Number(gstRate) || 0) / 100;

/** Price before GST → price incl. GST, as shown on a Quick Bill. */
export function inclGst(price: number, gstRate: number): number {
  return round2((Number(price) || 0) * factor(gstRate));
}

/**
 * A typed price incl. GST → the price before GST to bill. Kept to 4 decimals so it gives the
 * typed figure back exactly; typing the list price incl. GST gives the list price itself.
 */
export function exclGst(priceInclGst: number, gstRate: number, listPrice?: number): number {
  const incl = round2(Math.max(0, Number(priceInclGst) || 0));
  if (listPrice != null && Math.abs(inclGst(listPrice, gstRate) - incl) < 0.005) return listPrice;
  return round4(incl / factor(gstRate));
}

/** Bill discount: before GST (as billed) ↔ incl. GST (as typed on a Quick Bill), for this cart. */
function cartInclFactor(lines: CartLine[]): number {
  let taxable = 0;
  let total = 0;
  for (const l of lines) {
    const t = Math.max(0, (Number(l.unitPrice) || 0) * l.quantity - (l.discountAmount || 0));
    taxable += t;
    total += t * factor(l.gstRate);
  }
  return taxable > 0 ? total / taxable : 1;
}
export function billDiscountInclGst(discount: number, lines: CartLine[]): number {
  return round2((Number(discount) || 0) * cartInclFactor(lines));
}
export function billDiscountExclGst(discountInclGst: number, lines: CartLine[]): number {
  return round4(Math.max(0, Number(discountInclGst) || 0) / cartInclFactor(lines));
}
