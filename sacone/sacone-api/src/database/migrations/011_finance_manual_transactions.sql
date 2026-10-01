-- SACONE Phase 13: Manual Income & Expense Manager (Finance module)
-- Does NOT duplicate POS, sales, purchase, customer or supplier payment records.

CREATE TABLE IF NOT EXISTS financial_payment_accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'upi', 'bank', 'other')),
  opening_balance REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('income', 'expense')),
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  transaction_number TEXT NOT NULL UNIQUE,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  category_id TEXT NOT NULL REFERENCES financial_categories(id),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_account_id TEXT NOT NULL REFERENCES financial_payment_accounts(id),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank', 'cheque', 'other')),
  reference_number TEXT,
  description TEXT,
  firm_id TEXT REFERENCES companies(id),
  branch_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual_income'
    CHECK (source IN ('manual_income', 'manual_expense', 'reversal', 'correction')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'pending_approval', 'approved', 'posted', 'rejected', 'voided')),
  attachment_name TEXT,
  attachment_path TEXT,
  notes TEXT,
  reversal_of_id TEXT REFERENCES financial_transactions(id),
  rejection_reason TEXT,
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  submitted_at TEXT,
  approved_at TEXT,
  posted_at TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fin_tx_date ON financial_transactions(transaction_date, status);
CREATE INDEX IF NOT EXISTS idx_fin_tx_status ON financial_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fin_tx_type ON financial_transactions(transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_fin_tx_mode ON financial_transactions(payment_mode, status);
CREATE INDEX IF NOT EXISTS idx_fin_tx_category ON financial_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_reversal ON financial_transactions(reversal_of_id);

-- Default payment accounts
INSERT OR IGNORE INTO financial_payment_accounts (id, code, name, account_type, opening_balance, is_active, is_system, created_at, updated_at) VALUES
  ('fin-acct-cash-main', 'CASH-MAIN', 'Main Cash', 'cash', 0, 1, 1, datetime('now'), datetime('now')),
  ('fin-acct-upi-main', 'UPI-MAIN', 'UPI Account', 'upi', 0, 1, 1, datetime('now'), datetime('now')),
  ('fin-acct-bank-main', 'BANK-MAIN', 'Bank Account', 'bank', 0, 1, 1, datetime('now'), datetime('now'));

-- Default income categories
INSERT OR IGNORE INTO financial_categories (id, code, name, category_type, is_active, is_system, sort_order, created_at, updated_at) VALUES
  ('fin-cat-inc-other', 'OTHER_INCOME', 'Other Business Income', 'income', 1, 1, 1, datetime('now'), datetime('now')),
  ('fin-cat-inc-interest', 'INTEREST', 'Interest Income', 'income', 1, 1, 2, datetime('now'), datetime('now')),
  ('fin-cat-inc-service', 'SERVICE', 'Service Income', 'income', 1, 1, 3, datetime('now'), datetime('now')),
  ('fin-cat-inc-commission', 'COMMISSION', 'Commission Income', 'income', 1, 1, 4, datetime('now'), datetime('now')),
  ('fin-cat-inc-rental', 'RENTAL', 'Rental Income', 'income', 1, 1, 5, datetime('now'), datetime('now')),
  ('fin-cat-inc-misc', 'MISC_INCOME', 'Other Income', 'income', 1, 1, 6, datetime('now'), datetime('now'));

-- Default expense categories
INSERT OR IGNORE INTO financial_categories (id, code, name, category_type, is_active, is_system, sort_order, created_at, updated_at) VALUES
  ('fin-cat-exp-rent', 'RENT', 'Rent', 'expense', 1, 1, 10, datetime('now'), datetime('now')),
  ('fin-cat-exp-electricity', 'ELECTRICITY', 'Electricity', 'expense', 1, 1, 11, datetime('now'), datetime('now')),
  ('fin-cat-exp-salary', 'SALARY', 'Salary/Wages', 'expense', 1, 1, 12, datetime('now'), datetime('now')),
  ('fin-cat-exp-freight', 'FREIGHT', 'Freight', 'expense', 1, 1, 13, datetime('now'), datetime('now')),
  ('fin-cat-exp-transport', 'TRANSPORT', 'Transportation', 'expense', 1, 1, 14, datetime('now'), datetime('now')),
  ('fin-cat-exp-travel', 'TRAVEL', 'Travel', 'expense', 1, 1, 15, datetime('now'), datetime('now')),
  ('fin-cat-exp-repair', 'REPAIR', 'Repair & Maintenance', 'expense', 1, 1, 16, datetime('now'), datetime('now')),
  ('fin-cat-exp-office', 'OFFICE', 'Office Expense', 'expense', 1, 1, 17, datetime('now'), datetime('now')),
  ('fin-cat-exp-internet', 'INTERNET', 'Internet/Telephone', 'expense', 1, 1, 18, datetime('now'), datetime('now')),
  ('fin-cat-exp-marketing', 'MARKETING', 'Marketing', 'expense', 1, 1, 19, datetime('now'), datetime('now')),
  ('fin-cat-exp-bank-charges', 'BANK_CHARGES', 'Bank Charges', 'expense', 1, 1, 20, datetime('now'), datetime('now')),
  ('fin-cat-exp-professional', 'PROFESSIONAL', 'Professional Fees', 'expense', 1, 1, 21, datetime('now'), datetime('now')),
  ('fin-cat-exp-misc', 'MISC_EXPENSE', 'Miscellaneous Expense', 'expense', 1, 1, 22, datetime('now'), datetime('now'));

-- Approval / workflow settings
INSERT OR IGNORE INTO system_settings (key, value, description, updated_at) VALUES
  ('finance.approval_required', 'true', 'Require approval for manual finance transactions above threshold', datetime('now')),
  ('finance.approval_threshold_amount', '10000', 'Amount above which approval is required (INR)', datetime('now')),
  ('finance.auto_post_below_threshold', 'true', 'Auto-post submitted transactions below threshold when user can create', datetime('now'));
