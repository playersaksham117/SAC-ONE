import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { authService } from './index.js';

/**
 * Supplier screen (CRM → supplier): bills with what is left to pay, every payment with the bill's
 * balance after it, and a plain history of what happened to the bills. Same shape as the customer
 * screen (customer-invoices.js); the ledger stays on its own tab.
 *
 * A bill's balance (supplier_bills.amount_payable = total − paid − returned) is kept current by
 * payments, payment vouchers and debit notes; "balance after" is rebuilt by replaying events.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const MODE = { cash: 'Cash', upi: 'UPI', bank: 'Bank', card: 'Card', cheque: 'Cheque', other: 'Other' };

function supplierOf(id) {
  const s = getDatabase().prepare('SELECT id, name FROM suppliers WHERE id = ?').get(id);
  if (!s) throw new AppError('Supplier not found', 404);
  return s;
}

function statusOf(row) {
  const returned = Number(row.returned_amount || 0);
  const payable = Number(row.amount_payable || 0);
  if (row.status === 'cancelled') return 'Cancelled';
  if (returned > 0.001 && returned + 0.01 >= Number(row.grand_total)) return 'Returned';
  if (payable <= 0.001) return 'Paid';
  if (row.due_date && row.due_date < today()) return 'Overdue';
  if (Number(row.amount_paid || 0) > 0.001 || returned > 0.001) return 'Part paid';
  return 'Unpaid';
}

function bills(supplierId, { includeCancelled = false } = {}) {
  return getDatabase().prepare(`
    SELECT b.id, b.bill_number, b.supplier_invoice_number, b.bill_date, b.due_date, b.status, b.grand_total,
           b.amount_paid, b.amount_payable, COALESCE(b.returned_amount, 0) AS returned_amount, b.created_at, b.updated_at,
           u.full_name AS recorded_by
    FROM supplier_bills b LEFT JOIN users u ON u.id = b.created_by
    WHERE b.supplier_id = ? ${includeCancelled ? '' : "AND b.status != 'cancelled'"}
    ORDER BY b.bill_date DESC, b.created_at DESC
  `).all(supplierId);
}

/** Every money event per bill, oldest first: direct payments, vouchers, debit notes. */
function moneyEvents(supplierId) {
  const db = getDatabase();
  const direct = db.prepare(`
    SELECT p.id, p.bill_id, p.payment_date, p.method, p.amount, p.reference, p.created_at
    FROM supplier_payments p WHERE p.supplier_id = ?
  `).all(supplierId).map((p) => ({
    kind: 'payment', source: 'Payment', id: p.id, billId: p.bill_id || null, at: p.created_at, shownDate: p.payment_date || p.created_at,
    mode: MODE[p.method] || p.method, amount: round2(p.amount), reference: p.reference || null, status: 'posted', onAccount: !p.bill_id,
  }));
  const vouchers = db.prepare(`
    SELECT v.id, v.voucher_number, v.payment_date, v.payment_mode, v.amount, v.status, v.reference_number, v.created_at
    FROM supplier_payment_vouchers v WHERE v.supplier_id = ?
  `).all(supplierId);
  const allocs = db.prepare(`
    SELECT a.voucher_id, a.document_id, a.document_type, a.allocated_amount
    FROM supplier_payment_allocations a JOIN supplier_payment_vouchers v ON v.id = a.voucher_id
    WHERE v.supplier_id = ?
  `).all(supplierId);
  const voucherRows = [];
  for (const v of vouchers) {
    const base = {
      kind: 'payment', source: 'Voucher', voucherId: v.id, voucherNumber: v.voucher_number,
      at: v.created_at, shownDate: v.payment_date || v.created_at,
      mode: MODE[v.payment_mode] || v.payment_mode, reference: v.reference_number || null, status: v.status,
    };
    const lines = allocs.filter((a) => a.voucher_id === v.id && a.document_type === 'purchase_bill');
    for (const a of lines) voucherRows.push({ ...base, id: `${v.id}:${a.document_id}`, billId: a.document_id, amount: round2(a.allocated_amount) });
    const onAccount = round2(Number(v.amount) - lines.reduce((s, a) => s + Number(a.allocated_amount), 0));
    if (onAccount > 0.001) voucherRows.push({ ...base, id: `${v.id}:on-account`, billId: null, amount: onAccount, onAccount: true });
  }
  const returns = db.prepare(`
    SELECT r.id, r.bill_id, r.return_number, r.note_number, r.return_date, r.grand_total, r.reason, r.created_at
    FROM purchase_returns r WHERE r.supplier_id = ? AND r.status = 'completed'
  `).all(supplierId).map((r) => ({
    kind: 'return', id: r.id, billId: r.bill_id || null, at: r.created_at, shownDate: r.return_date || r.created_at,
    amount: round2(r.grand_total), number: r.note_number || r.return_number, reason: r.reason || null,
  }));
  return [...direct, ...voucherRows, ...returns].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function replay(list, events) {
  const balance = new Map(list.map((b) => [b.id, round2(b.grand_total)]));
  for (const e of events) {
    if (!e.billId || !balance.has(e.billId)) continue;
    const before = balance.get(e.billId);
    const counts = e.kind === 'return' || (e.kind === 'payment' && e.status === 'posted');
    const applied = counts ? Math.min(before, e.amount) : 0;
    const after = round2(Math.max(0, before - applied));
    balance.set(e.billId, after);
    e.balanceAfter = after;
  }
}

export const supplierBillService = {
  bills(supplierId, query = {}, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    supplierOf(supplierId);
    const all = bills(supplierId).map((b) => ({
      id: b.id,
      billNumber: b.bill_number,
      supplierInvoiceNumber: b.supplier_invoice_number || null,
      date: b.bill_date,
      dueDate: b.due_date || null,
      total: round2(b.grand_total),
      paid: round2(b.amount_paid),
      returned: round2(b.returned_amount),
      balance: round2(b.amount_payable),
      status: statusOf(b),
      isOverdue: Number(b.amount_payable) > 0.001 && Boolean(b.due_date) && b.due_date < today(),
    }));
    const items = query.unpaid === 'true' ? all.filter((b) => b.balance > 0.001) : all;
    const sum = (k) => round2(all.reduce((s, b) => s + b[k], 0));
    return {
      items,
      totals: {
        bills: all.length,
        unpaid: all.filter((b) => b.balance > 0.001).length,
        overdue: all.filter((b) => b.isOverdue).length,
        billed: sum('total'), paid: sum('paid'), returned: sum('returned'), balance: sum('balance'),
      },
    };
  },

  payments(supplierId, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    supplierOf(supplierId);
    const list = bills(supplierId);
    const byId = new Map(list.map((b) => [b.id, b]));
    const events = moneyEvents(supplierId);
    replay(list, events);
    const items = events.filter((e) => e.kind === 'payment').map((e) => {
      const bill = e.billId ? byId.get(e.billId) : null;
      return {
        id: e.id,
        date: e.shownDate || e.at,
        source: e.source,
        voucherNumber: e.voucherNumber || null,
        mode: e.mode,
        reference: e.reference,
        amount: e.amount,
        status: e.status,
        onAccount: Boolean(e.onAccount),
        billId: bill?.id || null,
        billNumber: bill?.bill_number || (e.onAccount ? null : '(cancelled bill)'),
        supplierInvoiceNumber: bill?.supplier_invoice_number || null,
        billTotal: bill ? round2(bill.grand_total) : null,
        balanceAfter: e.balanceAfter ?? null,
        balanceNow: bill ? round2(bill.amount_payable) : null,
      };
    }).reverse();
    const counted = items.filter((p) => p.status === 'posted');
    return {
      items,
      totals: {
        paid: round2(counted.reduce((s, p) => s + p.amount, 0)),
        onAccount: round2(counted.filter((p) => p.onAccount).reduce((s, p) => s + p.amount, 0)),
        balance: round2(list.reduce((s, b) => s + Number(b.amount_payable || 0), 0)),
      },
    };
  },

  /** What happened to this supplier's bills: recorded, cancelled, paid, returned. Newest first. */
  history(supplierId, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    supplierOf(supplierId);
    const all = bills(supplierId, { includeCancelled: true });
    const live = all.filter((b) => b.status !== 'cancelled');
    const byId = new Map(all.map((b) => [b.id, b]));
    const events = [];
    for (const b of all) {
      events.push({ type: 'billed', at: b.created_at, date: b.bill_date, billId: b.id, billNumber: b.bill_number, supplierInvoiceNumber: b.supplier_invoice_number || null, amount: round2(b.grand_total), by: b.recorded_by || null });
      if (b.status === 'cancelled') events.push({ type: 'cancelled', at: b.updated_at, billId: b.id, billNumber: b.bill_number, amount: round2(b.grand_total) });
    }
    const money = moneyEvents(supplierId);
    replay(live, money);
    for (const e of money) {
      const bill = e.billId ? byId.get(e.billId) : null;
      if (e.kind === 'payment') {
        events.push({
          type: e.status === 'cancelled' ? 'payment_cancelled' : e.status === 'draft' ? 'payment_draft' : 'payment',
          at: e.at, date: e.shownDate, billId: bill?.id || null, billNumber: bill?.bill_number || null, amount: e.amount, mode: e.mode,
          voucherNumber: e.voucherNumber || null, onAccount: Boolean(e.onAccount), balanceAfter: e.status === 'posted' ? (e.balanceAfter ?? null) : null,
        });
      } else {
        events.push({ type: 'returned', at: e.at, date: e.shownDate, billId: bill?.id || null, billNumber: bill?.bill_number || null, amount: e.amount, noteNumber: e.number, reason: e.reason, balanceAfter: e.balanceAfter ?? null });
      }
    }
    events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { items: events };
  },
};
