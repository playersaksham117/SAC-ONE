-- SACONE Phase 18: Customer Receipt (RV) & Supplier Payment (PV) vouchers
-- Multi-document allocation, advances, cash book, invoice due dates.
-- Outstanding balances remain derived — never edited from UI.

-- Sales invoice due date for ageing / overdue
ALTER TABLE pos_sales ADD COLUMN due_date TEXT;

CREATE TABLE IF NOT EXISTS customer_receipts (
  id TEXT PRIMARY KEY,
  voucher_number TEXT NOT NULL UNIQUE,
  firm_id TEXT REFERENCES companies(id),
  receipt_date TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  payment_mode TEXT NOT NULL
    CHECK (payment_mode IN ('cash', 'bank', 'upi', 'cheque', 'card', 'other')),
  payment_account_id TEXT REFERENCES financial_payment_accounts(id),
  amount REAL NOT NULL CHECK (amount > 0),
  allocated_amount REAL NOT NULL DEFAULT 0,
  unallocated_amount REAL NOT NULL DEFAULT 0,
  allocation_status TEXT NOT NULL DEFAULT 'unallocated'
    CHECK (allocation_status IN ('unallocated', 'partial', 'full')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  reference_number TEXT,
  utr_number TEXT,
  transaction_id TEXT,
  cheque_number TEXT,
  cheque_date TEXT,
  cheque_bank TEXT,
  remarks TEXT,
  posted_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  reversal_of_id TEXT REFERENCES customer_receipts(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_date ON customer_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_status ON customer_receipts(status);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_firm ON customer_receipts(firm_id);

CREATE TABLE IF NOT EXISTS customer_receipt_allocations (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('sales_invoice', 'advance', 'on_account', 'adjustment')),
  document_id TEXT,
  allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cr_alloc_receipt ON customer_receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_cr_alloc_doc ON customer_receipt_allocations(document_type, document_id);

CREATE TABLE IF NOT EXISTS supplier_payment_vouchers (
  id TEXT PRIMARY KEY,
  voucher_number TEXT NOT NULL UNIQUE,
  firm_id TEXT REFERENCES companies(id),
  payment_date TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  payment_mode TEXT NOT NULL
    CHECK (payment_mode IN ('cash', 'bank', 'upi', 'cheque', 'card', 'other')),
  payment_account_id TEXT REFERENCES financial_payment_accounts(id),
  amount REAL NOT NULL CHECK (amount > 0),
  allocated_amount REAL NOT NULL DEFAULT 0,
  unallocated_amount REAL NOT NULL DEFAULT 0,
  allocation_status TEXT NOT NULL DEFAULT 'unallocated'
    CHECK (allocation_status IN ('unallocated', 'partial', 'full')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  reference_number TEXT,
  utr_number TEXT,
  transaction_id TEXT,
  cheque_number TEXT,
  cheque_date TEXT,
  cheque_bank TEXT,
  remarks TEXT,
  posted_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  reversal_of_id TEXT REFERENCES supplier_payment_vouchers(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spv_supplier ON supplier_payment_vouchers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spv_date ON supplier_payment_vouchers(payment_date);
CREATE INDEX IF NOT EXISTS idx_spv_status ON supplier_payment_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_spv_firm ON supplier_payment_vouchers(firm_id);

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES supplier_payment_vouchers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('purchase_bill', 'advance', 'on_account', 'adjustment')),
  document_id TEXT,
  allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sp_alloc_voucher ON supplier_payment_allocations(voucher_id);
CREATE INDEX IF NOT EXISTS idx_sp_alloc_doc ON supplier_payment_allocations(document_type, document_id);

CREATE TABLE IF NOT EXISTS cash_book_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  firm_id TEXT REFERENCES companies(id),
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL,
  reference TEXT,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('customer_receipt', 'supplier_payment', 'reversal')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_account ON cash_book_entries(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_source ON cash_book_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_status ON cash_book_entries(status);
