-- SACONE Phase 7: Customers & Suppliers
-- Reuses existing customers master from Phase 6 (POS / future web store).
-- Adds suppliers + purchase bill/payment ledgers for supplier views.

-- Tag how a customer was onboarded (same master for POS + web store)
ALTER TABLE customers ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  gst_state_code TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  payment_terms TEXT,
  outstanding_payable REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- Purchase bills (purchase module will write here; CRM can record opening/manual bills)
CREATE TABLE IF NOT EXISTS supplier_bills (
  id TEXT PRIMARY KEY,
  bill_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  bill_date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  amount_payable REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON supplier_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_date ON supplier_bills(bill_date);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  bill_id TEXT REFERENCES supplier_bills(id),
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'bank', 'cheque', 'other')),
  amount REAL NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_bill ON supplier_payments(bill_id);
