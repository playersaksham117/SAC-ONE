-- SACONE Phase 21: Sales agents & commission management
-- Linked to pos_sales / customer receipts — no parallel sales ledger.

ALTER TABLE pos_sales ADD COLUMN sales_agent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pos_sales_agent ON pos_sales(sales_agent_id);

ALTER TABLE customers ADD COLUMN primary_sales_agent_id TEXT;

CREATE TABLE IF NOT EXISTS sales_agents (
  id TEXT PRIMARY KEY,
  agent_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (agent_type IN ('employee', 'internal', 'external')),
  employee_id TEXT REFERENCES employees(id),
  mobile TEXT,
  email TEXT,
  address TEXT,
  joining_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  commission_plan_id TEXT,
  default_commission_rate REAL NOT NULL DEFAULT 0,
  default_commission_basis TEXT NOT NULL DEFAULT 'taxable'
    CHECK (default_commission_basis IN ('sales_value', 'taxable', 'gross_profit', 'fixed')),
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  remarks TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_agents_status ON sales_agents(status);
CREATE INDEX IF NOT EXISTS idx_sales_agents_code ON sales_agents(agent_code);

CREATE TABLE IF NOT EXISTS commission_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  calculation_method TEXT NOT NULL DEFAULT 'percent_taxable'
    CHECK (calculation_method IN (
      'percent_sales_value', 'percent_taxable', 'percent_gross_profit',
      'fixed_per_invoice', 'fixed_per_product', 'rule_based'
    )),
  rate REAL NOT NULL DEFAULT 0,
  fixed_amount REAL NOT NULL DEFAULT 0,
  min_sales_amount REAL,
  max_commission REAL,
  payment_condition TEXT NOT NULL DEFAULT 'on_payment_received'
    CHECK (payment_condition IN (
      'on_sale', 'on_payment_received', 'on_full_payment',
      'on_partial_payment', 'after_return_period'
    )),
  return_period_days INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES commission_plans(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  rule_type TEXT NOT NULL
    CHECK (rule_type IN (
      'invoice_override', 'customer', 'product', 'brand', 'category', 'agent', 'default'
    )),
  customer_id TEXT REFERENCES customers(id),
  product_id TEXT REFERENCES products(id),
  brand_id TEXT REFERENCES brands(id),
  category_id TEXT REFERENCES categories(id),
  sales_agent_id TEXT REFERENCES sales_agents(id),
  calculation_method TEXT NOT NULL DEFAULT 'percent_taxable',
  rate REAL NOT NULL DEFAULT 0,
  fixed_amount REAL NOT NULL DEFAULT 0,
  min_sales_amount REAL,
  max_commission REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comm_rules_plan ON commission_rules(plan_id, priority);
CREATE INDEX IF NOT EXISTS idx_comm_rules_lookup ON commission_rules(rule_type, is_active);

CREATE TABLE IF NOT EXISTS sale_commissions (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id),
  invoice_number TEXT,
  sale_date TEXT,
  firm_id TEXT,
  branch_id TEXT,
  customer_id TEXT REFERENCES customers(id),
  sales_agent_id TEXT NOT NULL REFERENCES sales_agents(id),
  share_percent REAL NOT NULL DEFAULT 100,
  plan_id TEXT REFERENCES commission_plans(id),
  rule_id TEXT REFERENCES commission_rules(id),
  rule_snapshot_json TEXT,
  calculation_method TEXT NOT NULL,
  commission_basis TEXT NOT NULL,
  rate_snapshot REAL NOT NULL DEFAULT 0,
  fixed_amount_snapshot REAL NOT NULL DEFAULT 0,
  sales_amount REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  cogs_amount REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  payment_received REAL NOT NULL DEFAULT 0,
  payment_condition TEXT NOT NULL,
  commission_earned REAL NOT NULL DEFAULT 0,
  commission_reversed REAL NOT NULL DEFAULT 0,
  commission_eligible REAL NOT NULL DEFAULT 0,
  commission_paid REAL NOT NULL DEFAULT 0,
  commission_due REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'earned', 'eligible', 'partially_paid', 'paid', 'reversed', 'cancelled'
    )),
  applied_rule_label TEXT,
  remarks TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(sale_id, sales_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_comm_agent ON sale_commissions(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sale_comm_sale ON sale_commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_comm_customer ON sale_commissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sale_comm_status ON sale_commissions(status);
CREATE INDEX IF NOT EXISTS idx_sale_comm_date ON sale_commissions(sale_date);

CREATE TABLE IF NOT EXISTS commission_payments (
  id TEXT PRIMARY KEY,
  voucher_number TEXT NOT NULL UNIQUE,
  firm_id TEXT,
  payment_date TEXT NOT NULL,
  sales_agent_id TEXT NOT NULL REFERENCES sales_agents(id),
  payment_mode TEXT NOT NULL
    CHECK (payment_mode IN ('cash', 'bank', 'upi', 'cheque', 'other')),
  payment_account_id TEXT REFERENCES financial_payment_accounts(id),
  amount REAL NOT NULL CHECK (amount > 0),
  allocated_amount REAL NOT NULL DEFAULT 0,
  reference_number TEXT,
  utr_number TEXT,
  cheque_number TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  financial_transaction_id TEXT,
  posted_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comm_pay_agent ON commission_payments(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_comm_pay_status ON commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_comm_pay_date ON commission_payments(payment_date);

CREATE TABLE IF NOT EXISTS commission_payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES commission_payments(id) ON DELETE CASCADE,
  sale_commission_id TEXT NOT NULL REFERENCES sale_commissions(id),
  allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comm_pay_alloc_payment ON commission_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_comm_pay_alloc_comm ON commission_payment_allocations(sale_commission_id);

-- Allow commission payments in cash book
CREATE TABLE IF NOT EXISTS cash_book_entries_cp (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  firm_id TEXT REFERENCES companies(id),
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL,
  reference TEXT,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('customer_receipt', 'supplier_payment', 'bank_transfer', 'commission_payment', 'reversal')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO cash_book_entries_cp
SELECT id, entry_date, firm_id, payment_account_id, direction, amount,
       payment_mode, reference, source_type, source_id, status, created_by, created_at
FROM cash_book_entries;

DROP TABLE IF EXISTS cash_book_entries;
ALTER TABLE cash_book_entries_cp RENAME TO cash_book_entries;

CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_account ON cash_book_entries(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_source ON cash_book_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_status ON cash_book_entries(status);
