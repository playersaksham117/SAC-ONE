import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { authService } from './index.js';

/**
 * Customer screen (CRM → customer): invoices with what is left to pay, every payment with the
 * invoice's balance after it, and a plain history of what happened to the invoices. The ledger
 * (debit / credit / running balance) stays on its own tab.
 *
 * An invoice's balance (pos_sales.amount_credit) is kept current by receipts and credit notes;
 * the per-payment "balance after" is rebuilt by replaying the invoice's events in date order.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const MODE = { cash: 'Cash', upi: 'UPI', bank: 'Bank', card: 'Card', cheque: 'Cheque', other: 'Other', credit: 'Credit' };
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

function customerOf(id) {
  const c = getDatabase().prepare('SELECT id, name, is_walk_in FROM customers WHERE id = ?').get(id);
  if (!c) throw new AppError('Customer not found', 404);
  return c;
}

function statusOf(row, returned) {
  const balance = Number(row.amount_credit || 0);
  if (returned > 0.001 && returned + 0.01 >= Number(row.grand_total)) return 'Returned';
  if (balance <= 0.001) return 'Paid';
  if (row.due_date && row.due_date < today()) return 'Overdue';
  if (Number(row.amount_paid || 0) > 0.001 || returned > 0.001) return 'Part paid';
  return 'Unpaid';
}

/** Live invoices (deleted ones and the old copies of edited bills are left out). */
function liveInvoices(customerId) {
  return getDatabase().prepare(`
    SELECT s.id, s.invoice_number, s.status, s.grand_total, s.amount_paid, s.amount_credit, s.due_date,
           COALESCE(s.completed_at, s.created_at) AS invoice_date, s.created_at,
           s.customer_po_number, s.customer_po_date, u.full_name AS billed_by,
           COALESCE((SELECT SUM(r.grand_total) FROM pos_sales_returns r WHERE r.sale_id = s.id AND r.status = 'completed'), 0) AS returned
    FROM pos_sales s
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.customer_id = ? AND s.status != 'voided'
    ORDER BY COALESCE(s.completed_at, s.created_at) DESC
  `).all(customerId);
}

/** Every money event per invoice, oldest first: payments at billing, receipts, returns. */
function moneyEvents(customerId) {
  const db = getDatabase();
  const atBilling = db.prepare(`
    SELECT p.id, p.sale_id, p.method, p.amount, p.reference, COALESCE(s.completed_at, s.created_at) AS at
    FROM pos_payments p JOIN pos_sales s ON s.id = p.sale_id
    WHERE s.customer_id = ? AND s.status != 'voided' AND p.method != 'credit'
  `).all(customerId).map((p) => ({
    kind: 'payment', source: 'At billing', id: p.id, saleId: p.sale_id, at: p.at,
    mode: MODE[p.method] || p.method, amount: round2(p.amount), reference: p.reference || null, status: 'posted',
  }));
  const receipts = db.prepare(`
    SELECT r.id, r.voucher_number, r.receipt_date, r.payment_mode, r.amount, r.unallocated_amount, r.status,
           r.reference_number, r.created_at
    FROM customer_receipts r WHERE r.customer_id = ?
  `).all(customerId);
  const allocs = db.prepare(`
    SELECT a.receipt_id, a.document_id, a.document_type, a.allocated_amount
    FROM customer_receipt_allocations a JOIN customer_receipts r ON r.id = a.receipt_id
    WHERE r.customer_id = ?
  `).all(customerId);
  const receiptRows = [];
  for (const r of receipts) {
    // Order by when the receipt was recorded (that is when it reduced the invoice); show its own date.
    const base = {
      kind: 'payment', source: 'Receipt', receiptId: r.id, receiptNumber: r.voucher_number,
      at: r.created_at, shownDate: r.receipt_date || r.created_at,
      mode: MODE[r.payment_mode] || r.payment_mode, reference: r.reference_number || null, status: r.status,
    };
    const lines = allocs.filter((a) => a.receipt_id === r.id && a.document_type === 'sales_invoice');
    for (const a of lines) receiptRows.push({ ...base, id: `${r.id}:${a.document_id}`, saleId: a.document_id, amount: round2(a.allocated_amount) });
    const onAccount = round2(Number(r.amount) - lines.reduce((s, a) => s + Number(a.allocated_amount), 0));
    if (onAccount > 0.001) receiptRows.push({ ...base, id: `${r.id}:on-account`, saleId: null, amount: onAccount, onAccount: true });
  }
  const returns = db.prepare(`
    SELECT r.id, r.sale_id, r.return_number, r.note_number, r.grand_total, r.refund_method, r.refund_amount, r.reason, r.created_at
    FROM pos_sales_returns r JOIN pos_sales s ON s.id = r.sale_id
    WHERE s.customer_id = ? AND r.status = 'completed'
  `).all(customerId).map((r) => ({
    kind: 'return', id: r.id, saleId: r.sale_id, at: r.created_at, amount: round2(r.grand_total),
    number: r.note_number || r.return_number, refundMethod: r.refund_method, refundAmount: round2(r.refund_amount || 0), reason: r.reason || null,
  }));
  return [...atBilling, ...receiptRows, ...returns].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Balance on each invoice after each event (only posted receipts count). */
function replay(invoices, events) {
  const balance = new Map(invoices.map((i) => [i.id, round2(i.grand_total)]));
  for (const e of events) {
    if (!e.saleId || !balance.has(e.saleId)) continue;
    const before = balance.get(e.saleId);
    let applied = 0;
    if (e.kind === 'payment' && e.status === 'posted') applied = Math.min(before, e.amount);
    if (e.kind === 'return') applied = Math.min(before, e.amount); // a return first clears what is unpaid
    const after = round2(Math.max(0, before - applied));
    balance.set(e.saleId, after);
    e.balanceBefore = before;
    e.balanceAfter = after;
    e.applied = round2(applied);
  }
  return balance;
}

export const customerInvoiceService = {
  invoices(customerId, query = {}, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    customerOf(customerId);
    const all = liveInvoices(customerId).map((r) => {
      const returned = round2(r.returned);
      return {
        id: r.id,
        invoiceNumber: r.invoice_number,
        date: r.invoice_date,
        dueDate: r.due_date || null,
        customerPoNumber: r.customer_po_number || null,
        customerPoDate: r.customer_po_date || null,
        billedBy: r.billed_by || null,
        total: round2(r.grand_total),
        received: round2(r.amount_paid),
        returned,
        balance: round2(r.amount_credit),
        status: statusOf(r, returned),
        isOverdue: Number(r.amount_credit) > 0.001 && Boolean(r.due_date) && r.due_date < today(),
        canEdit: r.status === 'completed',
      };
    });
    const items = query.unpaid === 'true' ? all.filter((i) => i.balance > 0.001) : all;
    const sum = (k) => round2(all.reduce((s, i) => s + i[k], 0));
    return {
      items,
      totals: {
        invoices: all.length,
        unpaid: all.filter((i) => i.balance > 0.001).length,
        overdue: all.filter((i) => i.isOverdue).length,
        billed: sum('total'), received: sum('received'), returned: sum('returned'), balance: sum('balance'),
      },
    };
  },

  payments(customerId, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    customerOf(customerId);
    const invoices = liveInvoices(customerId);
    const byId = new Map(invoices.map((i) => [i.id, i]));
    const events = moneyEvents(customerId);
    replay(invoices, events);
    const items = events
      .filter((e) => e.kind === 'payment')
      .map((e) => {
        const inv = e.saleId ? byId.get(e.saleId) : null;
        return {
          id: e.id,
          date: e.shownDate || e.at,
          source: e.source,
          receiptNumber: e.receiptNumber || null,
          mode: e.mode,
          reference: e.reference,
          amount: e.amount,
          status: e.status,
          onAccount: Boolean(e.onAccount),
          invoiceId: inv?.id || null,
          invoiceNumber: inv?.invoice_number || (e.onAccount ? null : '(deleted invoice)'),
          invoiceTotal: inv ? round2(inv.grand_total) : null,
          balanceAfter: e.balanceAfter ?? null,
          balanceNow: inv ? round2(inv.amount_credit) : null,
        };
      })
      .reverse();
    const counted = items.filter((p) => p.status === 'posted');
    return {
      items,
      totals: {
        received: round2(counted.reduce((s, p) => s + p.amount, 0)),
        onAccount: round2(counted.filter((p) => p.onAccount).reduce((s, p) => s + p.amount, 0)),
        balance: round2(invoices.reduce((s, i) => s + Number(i.amount_credit || 0), 0)),
      },
    };
  },

  /** What happened to this customer's invoices: billed, edited, paid, returned, deleted. Newest first. */
  history(customerId, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    customerOf(customerId);
    const db = getDatabase();
    const sales = db.prepare(`
      SELECT s.id, s.invoice_number, s.status, s.grand_total, s.amount_credit, s.created_at, s.notes, u.full_name AS billed_by
      FROM pos_sales s LEFT JOIN users u ON u.id = s.created_by WHERE s.customer_id = ?
    `).all(customerId);
    const byId = new Map(sales.map((s) => [s.id, s]));
    const live = sales.filter((s) => s.status !== 'voided');
    const events = [];
    const isEditCopy = (s) => s.status === 'voided' && /-E\d+$/.test(s.invoice_number);

    for (const s of sales) {
      if (isEditCopy(s)) continue; // the old copy of an edited bill: shown as "Edited" below
      events.push({ type: 'billed', at: s.created_at, invoiceId: s.id, invoiceNumber: s.invoice_number, amount: round2(s.grand_total), by: s.billed_by || null, text: `Invoice billed for ${round2(s.grand_total)}` });
    }

    const ids = sales.map((s) => s.id);
    if (ids.length) {
      const audits = db.prepare(`
        SELECT action, record_id, user_name, previous_value, new_value, created_at FROM audit_logs
        WHERE record_type = 'pos_sale' AND action IN ('update', 'delete') AND record_id IN (${ids.map(() => '?').join(',')})
      `).all(...ids);
      for (const a of audits) {
        const sale = byId.get(a.record_id);
        const prev = parse(a.previous_value) || {};
        const next = parse(a.new_value) || {};
        if (a.action === 'update') {
          const from = round2(prev.grandTotal ?? 0);
          const to = round2(next.grandTotal ?? sale?.grand_total ?? 0);
          events.push({ type: 'edited', at: a.created_at, invoiceId: a.record_id, invoiceNumber: sale?.invoice_number, amount: to, previous: from, by: a.user_name, text: from !== to ? `Invoice edited: total ${from} → ${to}` : 'Invoice edited' });
        } else {
          events.push({ type: 'deleted', at: a.created_at, invoiceId: a.record_id, invoiceNumber: sale?.invoice_number, amount: round2(sale?.grand_total ?? 0), by: a.user_name, text: `Invoice deleted${next.reason ? `: ${next.reason}` : ''}` });
        }
      }
    }

    const money = moneyEvents(customerId);
    replay(live, money);
    for (const e of money) {
      const inv = e.saleId ? byId.get(e.saleId) : null;
      if (e.kind === 'payment') {
        if (e.status === 'cancelled') {
          events.push({ type: 'payment_cancelled', at: e.at, invoiceId: inv?.id || null, invoiceNumber: inv?.invoice_number || null, amount: e.amount, text: `Receipt ${e.receiptNumber} cancelled` });
          continue;
        }
        const what = e.onAccount ? 'Advance / on account' : e.source === 'At billing' ? 'Paid at billing' : 'Payment received';
        events.push({
          type: e.status === 'draft' ? 'payment_draft' : 'payment', at: e.at, date: e.shownDate || e.at, invoiceId: inv?.id || null, invoiceNumber: inv?.invoice_number || null,
          amount: e.amount, mode: e.mode, receiptNumber: e.receiptNumber || null, balanceAfter: e.balanceAfter ?? null,
          text: `${what}${e.status === 'draft' ? ' (draft, not yet posted)' : ''}`,
        });
      } else {
        events.push({
          type: 'returned', at: e.at, invoiceId: inv?.id || null, invoiceNumber: inv?.invoice_number || null,
          amount: e.amount, noteNumber: e.number, balanceAfter: e.balanceAfter ?? null, refundAmount: e.refundAmount,
          text: `Goods returned · credit note ${e.number}${e.refundAmount ? ` · refunded ${e.refundAmount}` : ''}`,
        });
      }
    }

    events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { items: events };
  },
};
