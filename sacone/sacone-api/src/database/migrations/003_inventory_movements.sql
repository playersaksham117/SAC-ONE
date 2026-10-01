-- SACONE Phase 4: Inventory Movement Engine
-- Inventory movements are the source of truth for stock.
-- stock_levels is a derived cache updated ONLY by the movement engine.

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_code_lower ON warehouses(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_warehouses_is_active ON warehouses(is_active);

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'bin'
    CHECK (location_type IN ('bin', 'zone', 'aisle', 'shelf', 'receiving', 'shipping', 'default')),
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE(warehouse_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wh_locations_warehouse ON warehouse_locations(warehouse_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  source_location_id TEXT REFERENCES warehouse_locations(id),
  destination_location_id TEXT REFERENCES warehouse_locations(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening_stock',
    'purchase',
    'pos_sale',
    'sales_return',
    'purchase_return',
    'adjustment_increase',
    'adjustment_decrease',
    'transfer_out',
    'transfer_in',
    'reserved_stock',
    'released_stock'
  )),
  quantity_in REAL NOT NULL DEFAULT 0 CHECK (quantity_in >= 0),
  quantity_out REAL NOT NULL DEFAULT 0 CHECK (quantity_out >= 0),
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_im_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_im_warehouse ON inventory_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_im_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_im_status ON inventory_movements(status);
CREATE INDEX IF NOT EXISTS idx_im_created_at ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_im_reference ON inventory_movements(reference_type, reference_id);

-- Derived stock cache — NEVER update outside the movement engine
CREATE TABLE IF NOT EXISTS stock_levels (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_on_hand REAL NOT NULL DEFAULT 0,
  quantity_reserved REAL NOT NULL DEFAULT 0,
  quantity_available REAL NOT NULL DEFAULT 0,
  last_movement_id TEXT REFERENCES inventory_movements(id),
  last_movement_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_available ON stock_levels(quantity_available);
