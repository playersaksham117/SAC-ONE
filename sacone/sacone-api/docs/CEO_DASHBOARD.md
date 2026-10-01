# SACONE CEO Dashboard

Executive decision dashboard for the business owner. **Read-only** — aggregates existing ERP transactions; does not create duplicate transaction systems.

Route (UI): `/business/ceo-dashboard`  
Permission: `reports.ceo_dashboard.view` (Owner/Admin & Accountant by default; Manager only if granted)

---

## 1. Architecture

```
UI (Next.js)
  → GET /api/ceo-dashboard*
    → CeoDashboardService (filters, period compare, health score)
      → CeoDashboardRepository (SQL aggregates on live tables)
        → pos_sales, pos_sale_items, pos_payments, pos_sales_returns
        → supplier_bills, supplier_payments
        → stock_levels, inventory_movements, products, customers, suppliers
        → system_settings (ceo.* thresholds)
```

No dashboard fact tables. Optional indexes added in migration `010_ceo_dashboard.sql`.

---

## 2. Data sources

| KPI / section | Source |
|---------------|--------|
| Gross / net sales | `pos_sales` (non-voided); returns from `pos_sales_returns` |
| Purchases | `supplier_bills` (non-cancelled) |
| Gross profit (est.) | `pos_sale_items.taxable_amount` − `qty × products.purchase_price` |
| Cash / UPI / Bank received | `pos_payments` joined to non-voided sales |
| Cash out / UPI paid | `supplier_payments` by method |
| Receivables | `customers.outstanding_balance` + credit aging from `pos_sales.amount_credit` |
| Payables | `suppliers.outstanding_payable` + `supplier_bills` aging by `due_date` |
| Inventory | `stock_levels` × product prices; movement history for dead stock |
| Alerts | Live counts from stock, credit, pending approvals, margin/discount rules |

---

## 3. KPI definitions

| KPI | Definition |
|-----|------------|
| Gross Sales | Sum of sale `subtotal` (pre-tax lines) in period |
| Net Sales | Invoice `grand_total` − completed return `grand_total` |
| Purchase Value | Sum of supplier bill `grand_total` |
| Gross Profit (est.) | Taxable line revenue − estimated COGS |
| Gross Margin % | Gross profit ÷ taxable revenue × 100 |
| Cash / UPI / Bank Received | Tender totals from `pos_payments` |
| Customer Receivables | Snapshot sum of customer outstanding |
| Supplier Payables | Snapshot sum of supplier outstanding |
| Inventory Value | On-hand × purchase price |
| Cash Flow Position | Period cash in − supplier cash payments (no cash book opening) |

Each period KPI includes comparison vs the **previous comparable window** (same duration immediately before).

---

## 4. Profit calculation method

```
Net Revenue (line taxable_amount)
− Product Cost (quantity × products.purchase_price)
= Estimated Gross Profit
```

- Configured costing method setting: `ceo.costing_method` (currently `purchase_price`).
- **Not** FIFO / weighted average — sale lines do not store historical unit cost.
- **Not** accounting net profit (no expense module).
- Voided sales excluded; returns netted at sales KPI level, not per-line COGS reversal.

---

## 5. Cash flow calculation

```
Cash In  = POS payments where method = cash
Cash Out = Supplier payments where method = cash
Period Net = Cash In − Cash Out
```

Opening/closing cash book balances are **not tracked** yet (`openingCash` / `closingCash` return null with an explanatory note). Expenses not available.

---

## 6. UPI flow calculation

```
UPI Received = POS payments method = upi
UPI Paid     = Supplier payments method = upi
Net UPI      = Received − Paid
```

Kept separate from cash in UI and APIs.

---

## 7. Near-real-time updates

- Client polls `GET /api/ceo-dashboard` every `ceo.refresh_seconds` (default **60s**).
- Manual Refresh button.
- No WebSocket layer (matches current Express architecture).
- Aggregations are indexed date-range SQL — no full table scan into the browser.

---

## 8. APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ceo-dashboard` | Full dashboard payload |
| GET | `/api/ceo-dashboard/filters` | Presets + warehouse/category/brand/salesperson/firm lists |
| GET | `/api/ceo-dashboard/profitability` | Invoice profitability drill-down |
| GET | `/api/ceo-dashboard/aging` | AR/AP bucket → party list (`side`, `bucket`) |

Query filters: `preset`, `dateFrom`, `dateTo`, `warehouseId`, `salespersonId`, `categoryId`, `brandId`, `companyId`/`firmId`, `granularity`.

Presets: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `this_fy`, `custom`.

---

## 9. Database changes

Migration **`010_ceo_dashboard.sql`**:

- Inserts `ceo.*` system settings (thresholds, health weights, costing, refresh).
- Adds indexes on sales/payments/bills for date filters.
- **Does not** create duplicate transaction tables.

---

## 10. Permissions

- `reports.ceo_dashboard.view` required on all endpoints.
- Default: Owner/Admin, Accountant.
- Manager: **not** default — assign explicitly.
- Cashier / Warehouse: no access by default.

---

## 11. Test scenarios

1. Login as Owner → open `/business/ceo-dashboard` → KPIs load for This Month.
2. Switch Today / This Week / Custom range → numbers change; previous-period deltas update.
3. Filter by warehouse → sales/cash charts respond.
4. Complete a POS cash + UPI sale → within ~60s (or Refresh) cash/UPI KPIs increase.
5. Create credit sale → receivables / aging buckets reflect open credit.
6. Record supplier cash/UPI payment → cash out / UPI paid update.
7. Open aging bucket → customer/supplier list appears with CRM links.
8. Loss-making sale (sell below purchase_price) → appears under Top Loss + LOSS_SALES alert.
9. Login as Cashier → CEO Dashboard denied / hidden.
10. Manager without permission → 403 on API.

---

## 12. Known limitations

- **Costing**: current master `purchase_price` only; price changes rewrite historical estimated COGS.
- **Cash book**: no opening balance / float; period net only.
- **Expenses / net profit**: not calculated.
- **AR due dates**: POS credit aged from invoice date (no dedicated due date on sales).
- **Multi-firm / branch**: firm filter reserved; transactional tables are not yet firm/branch scoped. Branch list empty.
- **Sales returns**: netted on sales KPIs; per-invoice profitability does not reverse COGS on returns.
- **Purchase returns**: no dedicated purchase-return module detected.
- **Health score**: indicative weighted heuristic — not scientifically precise (by design).

Configurable settings (Admin → System Settings or DB):  
`ceo.dead_stock_days`, `ceo.slow_moving_max_qty`, `ceo.min_margin_percent`, `ceo.unusual_discount_percent`, `ceo.overdue_receivable_alert_amount`, `ceo.health.weight.*`, `ceo.refresh_seconds`, `ceo.costing_method`.
