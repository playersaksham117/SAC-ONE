-- SACONE Phase 5: Warehouse Management
-- Hierarchy: Warehouse -> Zone -> Rack -> Shelf/Bin/Cell
-- Transfers and stock counts reuse the inventory movement engine.

PRAGMA foreign_keys = OFF;

-- Expand warehouse_locations for hierarchy + QR (recreate for CHECK update)
CREATE TABLE IF NOT EXISTS warehouse_locations_new (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  parent_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'bin'
    CHECK (location_type IN ('zone', 'rack', 'shelf', 'bin', 'cell', 'receiving', 'shipping', 'default', 'aisle')),
  full_code TEXT,
  qr_payload TEXT,
  capacity REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE(warehouse_id, code)
);

INSERT INTO warehouse_locations_new (
  id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
  capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
)
SELECT
  id, warehouse_id, NULL, code, name,
  CASE
    WHEN location_type = 'aisle' THEN 'rack'
    WHEN location_type IN ('zone', 'rack', 'shelf', 'bin', 'cell', 'receiving', 'shipping', 'default') THEN location_type
    ELSE 'bin'
  END,
  code,
  'SACONE:LOC:' || id,
  NULL, is_default, is_active, 0, created_at, updated_at, created_by
FROM warehouse_locations;

DROP TABLE warehouse_locations;
ALTER TABLE warehouse_locations_new RENAME TO warehouse_locations;

CREATE INDEX IF NOT EXISTS idx_wh_locations_warehouse ON warehouse_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_locations_parent ON warehouse_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_wh_locations_type ON warehouse_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_wh_locations_qr ON warehouse_locations(qr_payload);

PRAGMA foreign_keys = ON;

-- Location-level stock cache (updated ONLY by movement engine)
CREATE TABLE IF NOT EXISTS location_stock_levels (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  location_id TEXT NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_on_hand REAL NOT NULL DEFAULT 0,
  quantity_reserved REAL NOT NULL DEFAULT 0,
  quantity_available REAL NOT NULL DEFAULT 0,
  last_movement_id TEXT REFERENCES inventory_movements(id),
  last_movement_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_loc_stock_location ON location_stock_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_loc_stock_warehouse ON location_stock_levels(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_loc_stock_product ON location_stock_levels(product_id);

-- Internal transfers
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id TEXT PRIMARY KEY,
  transfer_number TEXT NOT NULL UNIQUE,
  source_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  destination_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  source_location_id TEXT REFERENCES warehouse_locations(id),
  destination_location_id TEXT REFERENCES warehouse_locations(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'in_transit', 'completed', 'rejected', 'cancelled')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  completed_at TEXT,
  transfer_out_movement_id TEXT REFERENCES inventory_movements(id),
  transfer_in_movement_id TEXT REFERENCES inventory_movements(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wh_transfers_status ON warehouse_transfers(status);
CREATE INDEX IF NOT EXISTS idx_wh_transfers_source ON warehouse_transfers(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_transfers_dest ON warehouse_transfers(destination_warehouse_id);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wh_transfer_items_transfer ON warehouse_transfer_items(transfer_id);

-- Stock counts
CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  count_number TEXT NOT NULL UNIQUE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  location_id TEXT REFERENCES warehouse_locations(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'pending_approval', 'completed', 'cancelled')),
  notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_warehouse ON stock_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  stock_count_id TEXT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  system_quantity REAL NOT NULL DEFAULT 0,
  counted_quantity REAL,
  variance REAL DEFAULT 0,
  notes TEXT,
  adjustment_movement_id TEXT REFERENCES inventory_movements(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(stock_count_id);
