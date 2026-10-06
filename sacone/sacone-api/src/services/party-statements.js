import { AppError } from '../core/http.js';
import { openingBalanceFor, openingBalancesOf } from './opening-balances.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import {
  AGEING_BUCKETS,
  ageingBucket,
  resolveInvoicePaymentDisplay,
  round2,
} from '../repositories/sqlite/party-payments.js';

const customerRepo = repos.customers;
const supplierRepo = repos.suppliers;

function daysBetween(fromDate, toDate = new Date().toISOString().slice(0, 10)) {
  const a = new Date(`${String(fromDate).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(toDate).slice(0, 10)}T00:00:00`);
  return Math.floor((b - a) / 86400000);
}

function emptyAgeing() {
  return Object.fromEntries(AGEING_BUCKETS.map((k) => [k, { amount: 0, count: 0, items: [] }]));
}

export class PartyStatementService {
  customerStatement(customerId, query, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    const customer = customerRepo.findById(customerId);
    if (!customer) throw new AppError('Customer not found', 404);

    const dateFrom = query.dateFrom || '';
    const dateTo = query.dateTo || '';
    const firmId = query.firmId || '';
    const typeFilter = query.transactionType || '';

    const db = getDatabase();
    const lines = [];

    const saleParams = [customerId];
    let saleFilter = `customer_id = ? AND status != 'voided'`;
    if (firmId) { saleFilter += ' AND firm_id = ?'; saleParams.push(firmId); }

    const sales = db.prepare(`
      SELECT id, invoice_number, grand_total, amount_paid, amount_credit, payment_status, due_date,
             COALESCE(completed_at, created_at) as txn_date, firm_id
      FROM pos_sales WHERE ${saleFilter}
      ORDER BY txn_date ASC
    `).all(...saleParams);

    const returns = db.prepare(`
      SELECT r.id, r.return_number, r.grand_total, r.created_at as txn_date, s.invoice_number
      FROM pos_sales_returns r
      LEFT JOIN pos_sales s ON s.id = r.sale_id
      WHERE r.customer_id = ? AND r.status = 'completed'
      ORDER BY r.created_at ASC
    `).all(customerId);

    let receipts = [];
    try {
      const rParams = [customerId];
      let rFilter = `customer_id = ? AND status = 'posted'`;
      if (firmId) { rFilter += ' AND firm_id = ?'; rParams.push(firmId); }
      receipts = db.prepare(`
        SELECT id, voucher_number, amount, unallocated_amount, receipt_date as txn_date, remarks
        FROM customer_receipts WHERE ${rFilter}
        ORDER BY receipt_date ASC
      `).all(...rParams);
    } catch {
      receipts = [];
    }

    for (const s of sales) {
      lines.push({
        date: String(s.txn_date).slice(0, 10),
        particulars: `Sales Invoice ${s.invoice_number}`,
        documentType: 'sales',
        documentNumber: s.invoice_number,
        documentId: s.id,
        debit: round2(s.grand_total),
        credit: 0,
        paymentStatus: s.payment_status,
      });
      // Invoice-time collections (POS tenders excluding pure credit)
      const paidAtSale = round2(s.amount_paid);
      // Only show POS collection that happened at sale if it wasn't later RV (RV increases amount_paid too).
      // Approximate: treat initial paid as part of invoice line credit for statement clarity when no RV table match.
      if (paidAtSale > 0.001 && !receipts.length) {
        // handled below via pos_payments when no RV yet — skip duplicate if RVs exist
      }
    }

    // POS payments as receipt lines (sale-tied collections)
    const posPays = db.prepare(`
      SELECT p.id, p.amount, p.method, p.created_at as txn_date, p.reference, s.invoice_number, s.id as sale_id
      FROM pos_payments p
      INNER JOIN pos_sales s ON s.id = p.sale_id
      WHERE s.customer_id = ? AND p.method != 'credit'
      ORDER BY p.created_at ASC
    `).all(customerId);
    for (const p of posPays) {
      lines.push({
        date: String(p.txn_date).slice(0, 10),
        particulars: `Collection on ${p.invoice_number} (${p.method})`,
        documentType: 'receipt',
        documentNumber: p.invoice_number,
        documentId: p.sale_id,
        debit: 0,
        credit: round2(p.amount),
        source: 'pos_payment',
        recordId: p.id,
      });
    }

    for (const r of returns) {
      lines.push({
        date: String(r.txn_date).slice(0, 10),
        particulars: `Sales Return ${r.return_number}${r.invoice_number ? ` (vs ${r.invoice_number})` : ''}`,
        documentType: 'sales_return',
        documentNumber: r.return_number,
        documentId: r.id,
        debit: 0,
        credit: round2(r.grand_total),
      });
    }

    for (const r of receipts) {
      const advanceNote = r.unallocated_amount > 0.001 ? ` (incl. advance ${round2(r.unallocated_amount)})` : '';
      lines.push({
        date: String(r.txn_date).slice(0, 10),
        particulars: `Receipt ${r.voucher_number}${advanceNote}${r.remarks ? ` — ${r.remarks}` : ''}`,
        documentType: 'receipt',
        documentNumber: r.voucher_number,
        documentId: r.id,
        debit: 0,
        credit: round2(r.amount),
        source: 'customer_receipt',
      });
    }

    const ob = openingBalanceFor('customer', customerId);
    if (ob) {
      lines.push({
        date: ob.asOfDate,
        particulars: `Opening balance${ob.notes ? ` — ${ob.notes}` : ''}`,
        documentType: 'opening_balance',
        documentNumber: 'OB',
        documentId: ob.id,
        debit: ob.amount > 0 ? ob.amount : 0,
        credit: ob.amount < 0 ? -ob.amount : 0,
        source: 'opening_balance',
      });
    }
    lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Opening = activity before dateFrom
    let opening = 0;
    const periodLines = [];
    for (const line of lines) {
      if (dateFrom && line.date < dateFrom) {
        opening = round2(opening + line.debit - line.credit);
        continue;
      }
      if (dateTo && line.date > dateTo) continue;
      if (typeFilter && line.documentType !== typeFilter
        && !(typeFilter === 'advance' && line.particulars.includes('advance'))) {
        continue;
      }
      periodLines.push(line);
    }

    let balance = opening;
    const withBalance = [];
    if (dateFrom) {
      withBalance.push({
        date: dateFrom,
        particulars: 'Opening Balance',
        documentType: 'opening',
        documentNumber: null,
        documentId: null,
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? Math.abs(opening) : 0,
        balance: opening,
      });
    }

    let totalSales = 0;
    let totalReturns = 0;
    let totalReceipts = 0;
    let totalAdjustments = 0;

    for (const line of periodLines) {
      balance = round2(balance + line.debit - line.credit);
      withBalance.push({ ...line, balance });
      if (line.documentType === 'sales') totalSales = round2(totalSales + line.debit);
      if (line.documentType === 'sales_return') totalReturns = round2(totalReturns + line.credit);
      if (line.documentType === 'receipt') totalReceipts = round2(totalReceipts + line.credit);
      if (line.documentType === 'adjustment') totalAdjustments = round2(totalAdjustments + line.debit - line.credit);
    }

    const closingBalance = balance;
    const matchesLedger = !dateFrom && !dateTo && !typeFilter
      ? Math.abs(closingBalance - round2(customer.outstandingBalance)) < 0.05
      : null;

    return {
      partyType: 'customer',
      customer: {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        gstNumber: customer.gstNumber,
        phone: customer.phone,
        outstandingBalance: customer.outstandingBalance,
      },
      filters: { dateFrom, dateTo, firmId, transactionType: typeFilter },
      summary: {
        openingBalance: opening,
        totalSales,
        totalReturns,
        totalReceipts,
        adjustments: totalAdjustments,
        closingBalance,
        totalReceivable: closingBalance,
      },
      lines: withBalance,
      closingBalance,
      matchesLedger,
    };
  }

  supplierStatement(supplierId, query, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    const supplier = supplierRepo.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404);

    const dateFrom = query.dateFrom || '';
    const dateTo = query.dateTo || '';
    const typeFilter = query.transactionType || '';
    const db = getDatabase();
    const lines = [];

    const bills = db.prepare(`
      SELECT id, bill_number, grand_total, bill_date as txn_date, amount_payable, amount_paid, status, due_date
      FROM supplier_bills
      WHERE supplier_id = ? AND status != 'cancelled'
      ORDER BY bill_date ASC
    `).all(supplierId);

    for (const b of bills) {
      lines.push({
        date: String(b.txn_date).slice(0, 10),
        particulars: `Purchase Bill ${b.bill_number}`,
        documentType: 'purchase',
        documentNumber: b.bill_number,
        documentId: b.id,
        debit: 0,
        credit: round2(b.grand_total),
      });
    }

    try {
      const returns = db.prepare(`
        SELECT id, return_number, grand_total, return_date as txn_date
        FROM purchase_returns
        WHERE supplier_id = ? AND status != 'cancelled'
        ORDER BY return_date ASC
      `).all(supplierId);
      for (const r of returns) {
        lines.push({
          date: String(r.txn_date).slice(0, 10),
          particulars: `Purchase Return ${r.return_number}`,
          documentType: 'purchase_return',
          documentNumber: r.return_number,
          documentId: r.id,
          debit: round2(r.grand_total),
          credit: 0,
        });
      }
    } catch {
      // table may not exist in older DBs
    }

    const legacyPays = db.prepare(`
      SELECT id, amount, payment_date as txn_date, method, reference
      FROM supplier_payments WHERE supplier_id = ?
      ORDER BY payment_date ASC
    `).all(supplierId);
    for (const p of legacyPays) {
      lines.push({
        date: String(p.txn_date).slice(0, 10),
        particulars: `Payment (${p.method})${p.reference ? ` ${p.reference}` : ''}`,
        documentType: 'payment',
        documentNumber: p.reference || p.id.slice(0, 8),
        documentId: p.id,
        debit: round2(p.amount),
        credit: 0,
        source: 'legacy_supplier_payment',
      });
    }

    try {
      const vouchers = db.prepare(`
        SELECT id, voucher_number, amount, unallocated_amount, payment_date as txn_date, remarks
        FROM supplier_payment_vouchers
        WHERE supplier_id = ? AND status = 'posted'
        ORDER BY payment_date ASC
      `).all(supplierId);
      for (const v of vouchers) {
        const advanceNote = v.unallocated_amount > 0.001 ? ` (incl. advance ${round2(v.unallocated_amount)})` : '';
        lines.push({
          date: String(v.txn_date).slice(0, 10),
          particulars: `Payment ${v.voucher_number}${advanceNote}${v.remarks ? ` — ${v.remarks}` : ''}`,
          documentType: 'payment',
          documentNumber: v.voucher_number,
          documentId: v.id,
          debit: round2(v.amount),
          credit: 0,
          source: 'supplier_payment_voucher',
        });
      }
    } catch {
      // ignore
    }

    const ob = openingBalanceFor('supplier', supplierId);
    if (ob) {
      lines.push({
        date: ob.asOfDate,
        particulars: `Opening balance${ob.notes ? ` — ${ob.notes}` : ''}`,
        documentType: 'opening_balance',
        documentNumber: 'OB',
        documentId: ob.id,
        debit: ob.amount < 0 ? -ob.amount : 0,
        credit: ob.amount > 0 ? ob.amount : 0,
        source: 'opening_balance',
      });
    }
    lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let opening = 0;
    const periodLines = [];
    for (const line of lines) {
      if (dateFrom && line.date < dateFrom) {
        opening = round2(opening + line.credit - line.debit);
        continue;
      }
      if (dateTo && line.date > dateTo) continue;
      if (typeFilter && line.documentType !== typeFilter) continue;
      periodLines.push(line);
    }

    let balance = opening;
    const withBalance = [];
    if (dateFrom) {
      withBalance.push({
        date: dateFrom,
        particulars: 'Opening Balance',
        documentType: 'opening',
        documentNumber: null,
        documentId: null,
        debit: 0,
        credit: opening > 0 ? opening : 0,
        balance: opening,
      });
    }

    let totalPurchases = 0;
    let totalReturns = 0;
    let totalPayments = 0;
    let totalAdjustments = 0;

    for (const line of periodLines) {
      balance = round2(balance + line.credit - line.debit);
      withBalance.push({ ...line, balance });
      if (line.documentType === 'purchase') totalPurchases = round2(totalPurchases + line.credit);
      if (line.documentType === 'purchase_return') totalReturns = round2(totalReturns + line.debit);
      if (line.documentType === 'payment') totalPayments = round2(totalPayments + line.debit);
      if (line.documentType === 'adjustment') totalAdjustments = round2(totalAdjustments + line.credit - line.debit);
    }

    const closingBalance = balance;
    const matchesLedger = !dateFrom && !dateTo && !typeFilter
      ? Math.abs(closingBalance - round2(supplier.outstandingPayable)) < 0.05
      : null;

    return {
      partyType: 'supplier',
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        gstNumber: supplier.gstNumber,
        phone: supplier.phone,
        outstandingPayable: supplier.outstandingPayable,
      },
      filters: { dateFrom, dateTo, transactionType: typeFilter },
      summary: {
        openingBalance: opening,
        totalPurchases,
        totalReturns,
        totalPayments,
        adjustments: totalAdjustments,
        closingBalance,
        totalPayable: closingBalance,
      },
      lines: withBalance,
      closingBalance,
      matchesLedger,
    };
  }

  customerOutstanding(query, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    const db = getDatabase();
    const customerId = query.customerId || null;
    const today = new Date().toISOString().slice(0, 10);
    const params = [];
    let filter = `s.status != 'voided' AND s.amount_credit > 0.001 AND c.is_walk_in = 0`;
    if (customerId) { filter += ' AND s.customer_id = ?'; params.push(customerId); }

    const rows = db.prepare(`
      SELECT s.id, s.invoice_number, s.grand_total, s.amount_paid, s.amount_credit, s.payment_status,
             s.due_date, s.customer_id, c.name as customer_name, c.code as customer_code,
             COALESCE(s.completed_at, s.created_at) as invoice_date
      FROM pos_sales s
      JOIN customers c ON c.id = s.customer_id
      WHERE ${filter}
      ORDER BY COALESCE(s.due_date, date(COALESCE(s.completed_at, s.created_at))) ASC
    `).all(...params);

    for (const ob of openingBalancesOf('customer')) {
      if (customerId && ob.partyId !== customerId) continue;
      const c = db.prepare('SELECT name, code FROM customers WHERE id = ?').get(ob.partyId);
      if (!c) continue;
      rows.unshift({
        id: ob.id, invoice_number: 'Opening balance', grand_total: ob.amount, amount_paid: round2(ob.amount - ob.remaining),
        amount_credit: ob.remaining, payment_status: 'credit', due_date: ob.asOfDate, customer_id: ob.partyId,
        customer_name: c.name, customer_code: c.code, invoice_date: ob.asOfDate, is_opening: 1,
      });
    }

    const buckets = emptyAgeing();
    const items = rows.map((row) => {
      const anchor = row.due_date || String(row.invoice_date).slice(0, 10);
      const days = daysBetween(anchor, today);
      const bucket = ageingBucket(days);
      const display = resolveInvoicePaymentDisplay({
        paymentStatus: row.payment_status,
        amountCredit: row.amount_credit,
        dueDate: row.due_date,
        today,
      });
      const item = {
        id: row.id,
        invoiceNumber: row.invoice_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerCode: row.customer_code,
        invoiceDate: String(row.invoice_date).slice(0, 10),
        dueDate: row.due_date,
        invoiceAmount: round2(row.grand_total),
        paidAmount: round2(row.amount_paid),
        dueAmount: round2(row.amount_credit),
        daysOverdue: Math.max(0, days),
        ageingBucket: bucket,
        displayStatus: display.displayStatus,
        isOverdue: display.isOverdue,
      };
      buckets[bucket].amount = round2(buckets[bucket].amount + item.dueAmount);
      buckets[bucket].count += 1;
      buckets[bucket].items.push(item);
      return item;
    });

    return {
      buckets,
      items,
      total: round2(items.reduce((s, i) => s + i.dueAmount, 0)),
      overdueTotal: round2(
        AGEING_BUCKETS.filter((b) => b !== 'current').reduce((s, b) => s + buckets[b].amount, 0)
      ),
    };
  }

  supplierOutstanding(query, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    const db = getDatabase();
    const supplierId = query.supplierId || null;
    const today = new Date().toISOString().slice(0, 10);
    const params = [];
    let filter = `b.status != 'cancelled' AND b.amount_payable > 0.001`;
    if (supplierId) { filter += ' AND b.supplier_id = ?'; params.push(supplierId); }

    const rows = db.prepare(`
      SELECT b.id, b.bill_number, b.grand_total, b.amount_paid, b.amount_payable, b.status,
             b.due_date, b.bill_date, b.supplier_id, s.name as supplier_name, s.code as supplier_code
      FROM supplier_bills b
      JOIN suppliers s ON s.id = b.supplier_id
      WHERE ${filter}
      ORDER BY COALESCE(b.due_date, b.bill_date) ASC
    `).all(...params);

    for (const ob of openingBalancesOf('supplier')) {
      if (supplierId && ob.partyId !== supplierId) continue;
      const sp = db.prepare('SELECT name, code FROM suppliers WHERE id = ?').get(ob.partyId);
      if (!sp) continue;
      rows.unshift({
        id: ob.id, bill_number: 'Opening balance', grand_total: ob.amount, amount_paid: round2(ob.amount - ob.remaining),
        amount_payable: ob.remaining, status: ob.remaining < ob.amount ? 'partial' : 'unpaid', due_date: ob.asOfDate, bill_date: ob.asOfDate,
        supplier_id: ob.partyId, supplier_name: sp.name, supplier_code: sp.code, is_opening: 1,
      });
    }

    const buckets = emptyAgeing();
    const items = rows.map((row) => {
      const anchor = row.due_date || row.bill_date;
      const days = daysBetween(anchor, today);
      const bucket = ageingBucket(days);
      const isOverdue = Boolean(row.due_date && row.due_date < today);
      let displayStatus = row.status === 'partial' ? 'Partially Paid' : 'Unpaid';
      if (isOverdue) displayStatus = 'Overdue';
      const item = {
        id: row.id,
        billNumber: row.bill_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        supplierCode: row.supplier_code,
        billDate: row.bill_date,
        dueDate: row.due_date,
        billAmount: round2(row.grand_total),
        paidAmount: round2(row.amount_paid),
        dueAmount: round2(row.amount_payable),
        daysOverdue: Math.max(0, days),
        ageingBucket: bucket,
        displayStatus,
        isOverdue,
      };
      buckets[bucket].amount = round2(buckets[bucket].amount + item.dueAmount);
      buckets[bucket].count += 1;
      buckets[bucket].items.push(item);
      return item;
    });

    return {
      buckets,
      items,
      total: round2(items.reduce((s, i) => s + i.dueAmount, 0)),
      overdueTotal: round2(
        AGEING_BUCKETS.filter((b) => b !== 'current').reduce((s, b) => s + buckets[b].amount, 0)
      ),
    };
  }

  statementCsv(statement) {
    const headers = ['Date', 'Particulars', 'Document', 'Debit', 'Credit', 'Balance'];
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = statement.lines.map((l) => [
      l.date,
      l.particulars,
      l.documentNumber || '',
      l.debit || 0,
      l.credit || 0,
      l.balance || 0,
    ].map(escape).join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}

export const partyStatementService = new PartyStatementService();
