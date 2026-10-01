import { round2 } from './money';
import type { CartLine, CartTotals, ComputedLine } from './types';

/**
 * Mirrors SACONE `calculateCartTotals` (sacone-api/src/services/pos.js) exactly, so the
 * terminal's invoice total always equals what the ERP books:
 *  - prices are GST-exclusive
 *  - line: unitPrice × qty − line discount → taxable
 *  - invoice discount is spread over lines pro-rata (last line takes the remainder)
 *  - same state (or unknown) → CGST + SGST halves, otherwise IGST
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
  const grandTotal = round2(computed.reduce((s, l) => s + l.lineTotal, 0));
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
    grandTotal,
    taxSplit: sameState ? 'cgst_sgst' : 'igst',
  };
}

/** Value of `qty` units of a sold line, pro-rata to what the customer paid for it. */
export function lineRefundValue(line: ComputedLine, qty: number): number {
  if (!line.quantity) return 0;
  return round2(line.lineTotal * (qty / line.quantity));
}
