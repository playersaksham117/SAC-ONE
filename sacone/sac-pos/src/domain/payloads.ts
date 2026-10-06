import { normalizePhone } from './validation';
import type { Customer, CustomerPayment, Sale, SaleReturn } from './types';

/** Builders for the SACONE `/api/v1/sync/push/*` contract (sacone-api/docs/POS_SYNC_API.md). */

export function salePayload(sale: Sale, userId: string) {
  const c = sale.customer;
  const isServerCustomer = c && !c.id.startsWith('local-');
  return {
    invoice_no: sale.number,
    sale_date_utc: sale.createdAt,
    erp_user_id: userId,
    customer_uuid: isServerCustomer ? c!.id : undefined,
    customer_name: c?.name ?? null,
    customer_phone: c?.phone ? normalizePhone(c.phone) ?? c.phone : null,
    customer_gstin: c?.gstin ?? null,
    discount_amount: sale.totals.invoiceDiscount,
    subtotal: sale.totals.subtotal,
    tax_amount: sale.totals.gstAmount,
    total_amount: sale.totals.grandTotal,
    paid_amount: sale.amountPaid,
    due_amount: sale.amountDue,
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
    notes: sale.notes ?? null,
    cash_drawer: sale.cashDrawer ?? null,
    exchange_return_number: sale.exchange?.returnNumber ?? null,
    items: sale.totals.lines.map((l) => ({
      product_uuid: l.productId,
      sku: l.sku,
      barcode: l.barcode ?? null,
      product_name: l.name,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_amount: l.discountAmount,
      tax_rate: l.gstRate,
      total_amount: l.lineTotal,
    })),
  };
}

export function returnPayload(ret: SaleReturn, userId: string) {
  return {
    return_number: ret.number,
    sale_number: ret.saleNumber,
    refund_method: ret.refundMethod,
    reason: ret.reason,
    erp_user_id: userId,
    total_amount: ret.total,
    return_type: ret.type ?? 'return',
    approved_by_erp_user_id: ret.approvedBy?.userId ?? null,
    approved_by_name: ret.approvedBy?.name ?? null,
    approved_at: ret.approvedBy?.at ?? null,
    items: ret.lines.map((l) => ({ product_uuid: l.productId, sku: l.sku, quantity: l.quantity })),
  };
}

export function paymentPayload(p: CustomerPayment, userId: string) {
  return {
    voucher_number: p.number,
    invoice_number: p.invoiceNumber ?? null,
    customer_uuid: p.customerId.startsWith('local-') ? undefined : p.customerId,
    customer_name: p.customerName,
    customer_phone: p.customerPhone ?? null,
    amount: p.amount,
    payment_method: p.method,
    reference: p.reference ?? null,
    notes: p.notes ?? null,
    created_at: p.createdAt,
    erp_user_id: userId,
  };
}

export function customerPayload(c: Customer, userId: string) {
  return {
    customer_code: c.code ?? c.id,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    gstin: c.gstin ?? null,
    address: c.address ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    erp_user_id: userId,
  };
}
