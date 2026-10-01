-- SACONE Phase 6: POS
-- Customers (master), system settings, sales invoices, payments, holds, returns.
-- Stock changes only via inventory movement engine (pos_sale / sales_return).

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id)
);

INSERT OR IGNORE INTO system_settings (key, value, description, updated_at)
VALUES (
  'allow_negative_stock',
  'false',
  'When true, POS and inventory may reduce stock below zero',
  datetime('now')
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  gst_state_code TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  credit_limit REAL NOT NULL DEFAULT 0,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  is_walk_in INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);

CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'voided', 'partially_returned', 'returned')),
  payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'partial', 'credit')),
  subtotal REAL NOT NULL DEFAULT 0,
  item_discount_total REAL NOT NULL DEFAULT 0,
  invoice_discount REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  amount_credit REAL NOT NULL DEFAULT 0,
  notes TEXT,
  held_bill_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_customer ON pos_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_warehouse ON pos_sales(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON pos_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON pos_sales(status);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  gst_percentage REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  quantity_returned REAL NOT NULL DEFAULT 0,
  movement_id TEXT REFERENCES inventory_movements(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product ON pos_sale_items(product_id);

CREATE TABLE IF NOT EXISTS pos_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'bank', 'credit')),
  amount REAL NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON pos_payments(sale_id);

CREATE TABLE IF NOT EXISTS pos_held_bills (
  id TEXT PRIMARY KEY,
  hold_number TEXT NOT NULL UNIQUE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  customer_id TEXT REFERENCES customers(id),
  cart_json TEXT NOT NULL,
  invoice_discount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'resumed', 'cancelled')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_held_status ON pos_held_bills(status);

CREATE TABLE IF NOT EXISTS pos_sales_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  subtotal REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'upi', 'bank', 'credit_note')),
  reason TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_returns_sale ON pos_sales_returns(sale_id);

CREATE TABLE IF NOT EXISTS pos_sales_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES pos_sales_returns(id) ON DELETE CASCADE,
  sale_item_id TEXT NOT NULL REFERENCES pos_sale_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  movement_id TEXT REFERENCES inventory_movements(id)
);

CREATE INDEX IF NOT EXISTS idx_pos_return_items_return ON pos_sales_return_items(return_id);
