-- SACONE Phase 12: POS device sync (BillEase POS desktop + mobile ↔ SACONE ERP)
-- Offline-first POS terminals push sales/returns/payments/customers and pull
-- products + POS users. Every inbound record is written to an idempotent inbox
-- so retries never double-post invoices or stock movements.

-- Registered POS terminals (one API key per device, bound to a warehouse)
CREATE TABLE IF NOT EXISTS pos_devices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                 -- short prefix used on synced invoice numbers, e.g. POS1
  name TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  acting_user_id TEXT NOT NULL REFERENCES users(id), -- ERP user recorded as creator of synced docs
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  device_fingerprint TEXT,                   -- X-Device-Id bound on first successful call
  platform TEXT,
  app_version TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  last_push_at TEXT,
  last_pull_at TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_devices_active ON pos_devices(is_active);
CREATE INDEX IF NOT EXISTS idx_pos_devices_warehouse ON pos_devices(warehouse_id);

-- Offline PIN users for POS terminals (not ERP web users)
CREATE TABLE IF NOT EXISTS pos_users (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,             -- uppercase login code typed on the terminal
  display_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,                    -- sha256(pin) — matches BillEase POS AuthService.hashPin
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier')),
  permissions TEXT,                          -- optional JSON array override
  warehouse_id TEXT REFERENCES warehouses(id), -- NULL = all terminals
  linked_user_id TEXT REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_users_updated ON pos_users(updated_at);

-- Idempotent inbox: one row per (device, entity, external reference)
CREATE TABLE IF NOT EXISTS pos_sync_inbox (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_devices(id),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('sale', 'return', 'payment', 'customer', 'stock_event', 'product')),
  external_ref TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('applied', 'failed', 'ignored', 'pending_review', 'rejected')),
  result_type TEXT,
  result_id TEXT,
  warnings_json TEXT,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (device_id, entity_type, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_pos_inbox_status ON pos_sync_inbox(status);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_entity ON pos_sync_inbox(entity_type, status);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_updated ON pos_sync_inbox(updated_at);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_result ON pos_sync_inbox(result_type, result_id);

-- Lets product pull include stock-only changes cheaply
CREATE INDEX IF NOT EXISTS idx_stock_levels_updated ON stock_levels(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at);
