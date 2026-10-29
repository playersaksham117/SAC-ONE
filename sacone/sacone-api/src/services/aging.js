import { getDatabase } from '../database/connection.js';

/** Credit days when a customer / supplier has none set. */
export const DEFAULT_CREDIT_DAYS = 30;

/** 'YYYY-MM-DD' today in India. */
export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** dateStr ('YYYY-MM-DD') plus n days. */
export function addDays(dateStr, n) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Credit days as stored: a whole number 0–365, or null (blank = default). */
export function creditDaysOf(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 365) return NaN;
  return n;
}

export const AGING_BUCKETS = ['notDue', 'd1_30', 'd31_60', 'd61_90', 'd90plus'];

/**
 * Age each party's balance. The balance (what is owed now) is laid over its credit bills from the
 * newest back, so the oldest bills are taken as paid first; whatever is left beyond the bills
 * (opening balance) counts from the party's start date. Each part is bucketed by days past due.
 * charges: [{ partyId, date, dueDate, amount }] sorted newest first.
 */
function ageBalances(parties, charges, { balanceOf, creditDaysOf: daysOf, today }) {
  const byParty = new Map();
  for (const c of charges) {
    if (!byParty.has(c.partyId)) byParty.set(c.partyId, []);
    byParty.get(c.partyId).push(c);
  }
  const out = new Map();
  for (const p of parties) {
    const aging = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, overdue: 0, oldestDueDate: null, maxDaysOverdue: 0 };
    let left = round2(balanceOf(p));
    const days = daysOf(p) ?? DEFAULT_CREDIT_DAYS;
    const put = (amount, dueDate) => {
      const late = daysBetween(dueDate, today);
      const key = late <= 0 ? 'notDue' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90plus';
      aging[key] = round2(aging[key] + amount);
      if (late > 0) {
        aging.overdue = round2(aging.overdue + amount);
        aging.maxDaysOverdue = Math.max(aging.maxDaysOverdue, late);
      }
      if (!aging.oldestDueDate || dueDate < aging.oldestDueDate) aging.oldestDueDate = dueDate;
    };
    for (const c of byParty.get(p.id) || []) {
      if (left <= 0.009) break;
      const part = Math.min(left, c.amount);
      put(part, c.dueDate || addDays(c.date, days));
      left = round2(left - part);
    }
    if (left > 0.009) put(left, addDays(String(p.createdAt || today).slice(0, 10), days));
    out.set(p.id, aging);
  }
  return out;
}

/** Aging of customers' balances against their credit bills (credit part of each invoice). */
export function customerAging(customers, today = istToday()) {
  const owing = customers.filter((c) => c.outstandingBalance > 0.009);
  if (!owing.length) return new Map();
  const charges = getDatabase().prepare(`
    SELECT s.customer_id AS partyId, date(COALESCE(s.completed_at, s.created_at), '+330 minutes') AS date, s.due_date AS dueDate,
           SUM(p.amount) AS amount
    FROM pos_sales s JOIN pos_payments p ON p.sale_id = s.id AND p.method = 'credit'
    WHERE s.status != 'voided' AND s.customer_id IS NOT NULL
    GROUP BY s.id
    ORDER BY date DESC, s.created_at DESC
  `).all();
  return ageBalances(owing, charges, { balanceOf: (c) => c.outstandingBalance, creditDaysOf: (c) => c.creditDays, today });
}

/** Aging of what we owe suppliers against their bills. */
export function supplierAging(suppliers, today = istToday()) {
  const owing = suppliers.filter((s) => s.outstandingPayable > 0.009);
  if (!owing.length) return new Map();
  const charges = getDatabase().prepare(`
    SELECT supplier_id AS partyId, date(bill_date) AS date, date(due_date) AS dueDate, grand_total AS amount
    FROM supplier_bills
    WHERE status NOT IN ('cancelled', 'void', 'voided')
    ORDER BY bill_date DESC, created_at DESC
  `).all();
  return ageBalances(owing, charges, { balanceOf: (s) => s.outstandingPayable, creditDaysOf: (s) => s.creditDays, today });
}

const SORTS = {
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
  code: (a, b) => String(a.code).localeCompare(String(b.code)),
  balance: (a, b) => a.balance - b.balance,
  overdue: (a, b) => a.aging.overdue - b.aging.overdue,
  daysOverdue: (a, b) => a.aging.maxDaysOverdue - b.aging.maxDaysOverdue,
  creditDays: (a, b) => (a.creditDays ?? DEFAULT_CREDIT_DAYS) - (b.creditDays ?? DEFAULT_CREDIT_DAYS),
  recent: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
};

/**
 * Filter (dues = owes anything, overdue, aging bucket 1-30 / 31-60 / 61-90 / 90+), sort and page a
 * party list that carries `balance` and `aging`; totals cover every match, not just the page.
 */
export function filterSortPage(items, { due = '', sort = 'name', dir = 'asc', limit = 100, offset = 0 } = {}) {
  const pick = {
    dues: (r) => r.balance > 0.009,
    overdue: (r) => r.aging.overdue > 0.009,
    notDue: (r) => r.balance > 0.009 && r.aging.overdue <= 0.009,
    d1_30: (r) => r.aging.d1_30 > 0.009,
    d31_60: (r) => r.aging.d31_60 > 0.009,
    d61_90: (r) => r.aging.d61_90 > 0.009,
    d90plus: (r) => r.aging.d90plus > 0.009,
    clear: (r) => r.balance <= 0.009,
  }[due];
  let rows = pick ? items.filter(pick) : items.slice();
  const cmp = SORTS[sort] || SORTS.name;
  const sign = dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => (a.isWalkIn !== b.isWalkIn ? (a.isWalkIn ? -1 : 1) : sign * cmp(a, b) || SORTS.name(a, b)));
  const totals = { balance: 0, overdue: 0 };
  for (const k of AGING_BUCKETS) totals[k] = 0;
  for (const r of rows) {
    totals.balance = round2(totals.balance + Math.max(0, r.balance)); // what is owed (advances are not netted off)
    totals.overdue = round2(totals.overdue + r.aging.overdue);
    for (const k of AGING_BUCKETS) totals[k] = round2(totals[k] + r.aging[k]);
  }
  return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset, totals };
}

export const EMPTY_AGING = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, overdue: 0, oldestDueDate: null, maxDaysOverdue: 0 };
