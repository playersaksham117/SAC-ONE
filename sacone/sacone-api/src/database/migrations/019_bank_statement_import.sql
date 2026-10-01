-- SACONE Phase 19: Bank statement import & payment reconciliation
-- Integrates with existing RV/PV vouchers, finance accounts, cash book — no parallel ledger.

ALTER TABLE customer_receipts ADD COLUMN bank_transaction_id TEXT;
ALTER TABLE supplier_payment_vouchers ADD COLUMN bank_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_customer_receipts_bank_txn ON customer_receipts(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_spv_bank_txn ON supplier_payment_vouchers(bank_transaction_id);

CREATE TABLE IF NOT EXISTS bank_column_mappings (
  id TEXT PRIMARY KEY,
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  mapping_json TEXT NOT NULL,
  skip_rows INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payment_account_id)
);

CREATE TABLE IF NOT EXISTS bank_import_batches (
  id TEXT PRIMARY KEY,
  firm_id TEXT REFERENCES companies(id),
  branch_id TEXT,
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  statement_from TEXT,
  statement_to TEXT,
  file_name TEXT,
  mapping_json TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  total_credit REAL NOT NULL DEFAULT 0,
  total_debit REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'imported'
    CHECK (status IN ('preview', 'imported', 'cancelled')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_batches_account ON bank_import_batches(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_batches_created ON bank_import_batches(created_at);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES bank_import_batches(id),
  firm_id TEXT REFERENCES companies(id),
  branch_id TEXT,
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  transaction_date TEXT NOT NULL,
  value_date TEXT,
  narration TEXT,
  description TEXT,
  reference_number TEXT,
  utr_number TEXT,
  cheque_number TEXT,
  debit_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  balance_after REAL,
  fingerprint TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (reconciliation_status IN (
      'unmatched', 'matched', 'partially_allocated', 'fully_allocated',
      'other_income', 'other_expense', 'bank_transfer', 'ignored', 'duplicate'
    )),
  allocated_amount REAL NOT NULL DEFAULT 0,
  unallocated_amount REAL NOT NULL DEFAULT 0,
  party_type TEXT,
  customer_id TEXT REFERENCES customers(id),
  supplier_id TEXT REFERENCES suppliers(id),
  voucher_type TEXT,
  voucher_id TEXT,
  financial_transaction_id TEXT REFERENCES financial_transactions(id),
  transfer_account_id TEXT REFERENCES financial_payment_accounts(id),
  linked_voucher_id TEXT,
  ignore_reason TEXT,
  remarks TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payment_account_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON bank_transactions(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_txn_status ON bank_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_txn_utr ON bank_transactions(utr_number);
CREATE INDEX IF NOT EXISTS idx_bank_txn_ref ON bank_transactions(reference_number);
CREATE INDEX IF NOT EXISTS idx_bank_txn_amount ON bank_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_bank_txn_customer ON bank_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_supplier ON bank_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_voucher ON bank_transactions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_fingerprint ON bank_transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_bank_txn_batch ON bank_transactions(batch_id);

-- Expand cash book source types for bank transfers (SQLite cannot ALTER CHECK)
CREATE TABLE IF NOT EXISTS cash_book_entries_new (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  firm_id TEXT REFERENCES companies(id),
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL,
  reference TEXT,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('customer_receipt', 'supplier_payment', 'bank_transfer', 'reversal')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO cash_book_entries_new
SELECT id, entry_date, firm_id, payment_account_id, direction, amount,
       payment_mode, reference, source_type, source_id, status, created_by, created_at
FROM cash_book_entries;

DROP TABLE IF EXISTS cash_book_entries;
ALTER TABLE cash_book_entries_new RENAME TO cash_book_entries;

CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_account ON cash_book_entries(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_source ON cash_book_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_status ON cash_book_entries(status);
