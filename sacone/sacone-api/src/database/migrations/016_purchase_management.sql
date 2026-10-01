-- SACONE Phase 16: Purchase Management (PO, bills with lines, price lists, returns)

ALTER TABLE supplier_bills ADD COLUMN supplier_invoice_number TEXT;
ALTER TABLE supplier_bills ADD COLUMN warehouse_id TEXT REFERENCES warehouses(id);
ALTER TABLE supplier_bills ADD COLUMN purchase_order_id TEXT;
ALTER TABLE supplier_bills ADD COLUMN cgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN sgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN igst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN stock_posted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  order_date TEXT NOT NULL,
  expected_date TEXT,
  warehouse_id TEXT REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partial', 'received', 'closed', 'cancelled')),
  subtotal REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  price_list_id TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_percent REAL NOT NULL DEFAULT 0,
  gst_percentage REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  received_qty REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS supplier_bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_percent REAL NOT NULL DEFAULT 0,
  gst_percentage REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_bill ON supplier_bill_items(bill_id);

CREATE TABLE IF NOT EXISTS supplier_price_lists (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  effective_date TEXT,
  source_filename TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processed', 'archived')),
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_lists_supplier ON supplier_price_lists(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_price_list_items (
  id TEXT PRIMARY KEY,
  price_list_id TEXT NOT NULL REFERENCES supplier_price_lists(id) ON DELETE CASCADE,
  row_number INTEGER,
  supplier_sku TEXT,
  supplier_name TEXT,
  supplier_barcode TEXT,
  rate REAL,
  mrp REAL,
  discount_percent REAL,
  gst_percentage REAL,
  pack_size TEXT,
  unit TEXT,
  matched_product_id TEXT REFERENCES products(id),
  match_method TEXT,
  match_confidence REAL,
  raw_line TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON supplier_price_list_items(price_list_id);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  bill_id TEXT REFERENCES supplier_bills(id),
  return_date TEXT NOT NULL,
  warehouse_id TEXT REFERENCES warehouses(id),
  subtotal REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('draft', 'completed', 'cancelled')),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);
