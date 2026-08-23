-- TracInvent demo SQLite schema (adapted from Supabase migration)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','staff','viewer')),
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  company_name TEXT DEFAULT 'Demo Company',
  currency TEXT DEFAULT 'INR',
  currency_symbol TEXT DEFAULT '₹',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  date_format TEXT DEFAULT 'dd/MM/yyyy',
  low_stock_threshold REAL DEFAULT 10,
  dead_stock_days INTEGER DEFAULT 60,
  pin_lock_minutes INTEGER DEFAULT 10,
  sync_api_url TEXT,
  sync_api_key TEXT,
  sync_enabled INTEGER DEFAULT 0,
  sync_registered_email TEXT,
  last_sync_at TEXT,
  barcode_series_next INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(name) WHERE is_deleted = 0;

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'India',
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT REFERENCES warehouses(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'cell',
  code TEXT NOT NULL,
  description TEXT,
  row_num INTEGER,
  col_num INTEGER,
  level_num INTEGER,
  zone_id TEXT,
  zone_name TEXT,
  capacity REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  unit TEXT NOT NULL DEFAULT 'pieces',
  reorder_level REAL DEFAULT 0,
  min_stock_level REAL DEFAULT 0,
  cost_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  description TEXT,
  hsn TEXT,
  brand TEXT,
  model_variant TEXT,
  tax_rate REAL DEFAULT 18,
  item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS stock (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES inventory_items(id),
  warehouse_id TEXT REFERENCES warehouses(id),
  location_id TEXT REFERENCES storage_locations(id),
  quantity REAL DEFAULT 0,
  batch_number TEXT,
  expiry_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES inventory_items(id),
  warehouse_id TEXT REFERENCES warehouses(id),
  location_id TEXT,
  movement_type TEXT NOT NULL,
  quantity REAL,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES inventory_items(id),
  item_name TEXT,
  item_sku TEXT,
  warehouse_id TEXT REFERENCES warehouses(id),
  warehouse_name TEXT,
  cell_id TEXT,
  cell_name TEXT,
  batch_number TEXT,
  expiry_date TEXT,
  quantity_before REAL,
  quantity_adjusted REAL,
  quantity_after REAL,
  adjustment_type TEXT NOT NULL,
  status TEXT DEFAULT 'PND',
  reason TEXT NOT NULL,
  reference_document TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  approved_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_no TEXT UNIQUE,
  type TEXT NOT NULL,
  item_id TEXT REFERENCES inventory_items(id),
  warehouse_id TEXT REFERENCES warehouses(id),
  location_id TEXT,
  quantity REAL,
  unit_price REAL,
  total_price REAL,
  reference TEXT,
  notes TEXT,
  supplier_id TEXT,
  customer_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  gstin TEXT,
  credit_limit REAL DEFAULT 0,
  credit_balance REAL DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  rating REAL DEFAULT 0,
  last_purchase_at TEXT,
  on_time_pct REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  credit_policy_days INTEGER DEFAULT 30,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  gstin TEXT,
  group_id TEXT,
  loyalty_points REAL DEFAULT 0,
  credit_limit REAL DEFAULT 0,
  credit_balance REAL DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  last_sale_at TEXT,
  rating REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS party_contacts (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL,
  party_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS party_notes (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL,
  party_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_follow_ups (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL,
  party_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  priority TEXT DEFAULT 'MEDIUM',
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_price_history (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  unit_price REAL NOT NULL,
  source TEXT DEFAULT 'PO',
  po_id TEXT,
  recorded_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS vendor_ratings (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  score REAL NOT NULL,
  criteria TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT UNIQUE,
  supplier_id TEXT REFERENCES suppliers(id),
  status TEXT DEFAULT 'DRAFT',
  order_date TEXT,
  expected_date TEXT,
  received_date TEXT,
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES inventory_items(id),
  ordered_qty REAL,
  received_qty REAL DEFAULT 0,
  unit_price REAL,
  total_price REAL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_no TEXT UNIQUE,
  customer_id TEXT REFERENCES customers(id),
  sale_date TEXT DEFAULT (datetime('now')),
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'CASH',
  status TEXT DEFAULT 'COMPLETED',
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES inventory_items(id),
  item_name TEXT,
  quantity REAL,
  unit_price REAL,
  discount REAL DEFAULT 0,
  total_price REAL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_id TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT 'CLEARED',
  payment_method TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batch_info (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES inventory_items(id),
  warehouse_id TEXT,
  batch_number TEXT NOT NULL,
  manufacture_date TEXT,
  expiry_date TEXT,
  quantity REAL,
  unit_cost REAL,
  supplier_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_party_contacts_party ON party_contacts(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_party_notes_party ON party_notes(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_crm_follow_ups_due ON crm_follow_ups(due_at, status);
CREATE INDEX IF NOT EXISTS idx_vendor_price_supplier ON vendor_price_history(supplier_id, item_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON ledger_entries(entity_type, entity_id);

-- RBAC
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES permissions(id) ON DELETE CASCADE,
  granted INTEGER DEFAULT 1,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id),
  assigned_at TEXT DEFAULT (datetime('now')),
  assigned_by TEXT REFERENCES users(id),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  request_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT REFERENCES users(id),
  requester_role TEXT,
  operation TEXT NOT NULL,
  reason TEXT,
  warehouse_id TEXT REFERENCES warehouses(id),
  reference_no TEXT,
  notes TEXT,
  payload TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_history (
  id TEXT PRIMARY KEY,
  approval_id TEXT REFERENCES approval_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  role_code TEXT,
  action TEXT NOT NULL,
  module TEXT,
  entity_type TEXT,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  approval_id TEXT REFERENCES approval_requests(id),
  status TEXT,
  ip_address TEXT,
  device TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

