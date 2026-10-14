-- SAC-POS can sync quotations (Sale / Quotation toggle): allow 'quotation' in the sync inbox.

PRAGMA foreign_keys = OFF;

CREATE TABLE pos_sync_inbox_new (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_devices(id),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('sale', 'return', 'payment', 'customer', 'stock_event', 'product', 'quotation')),
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

INSERT INTO pos_sync_inbox_new (
  id, device_id, entity_type, external_ref, payload_json, status, result_type, result_id, warnings_json,
  error_code, error_message, attempts, reviewed_by, reviewed_at, received_at, updated_at
)
SELECT id, device_id, entity_type, external_ref, payload_json, status, result_type, result_id, warnings_json,
  error_code, error_message, attempts, reviewed_by, reviewed_at, received_at, updated_at
FROM pos_sync_inbox;

DROP TABLE pos_sync_inbox;
ALTER TABLE pos_sync_inbox_new RENAME TO pos_sync_inbox;

CREATE INDEX IF NOT EXISTS idx_pos_inbox_status ON pos_sync_inbox(status);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_entity ON pos_sync_inbox(entity_type, status);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_updated ON pos_sync_inbox(updated_at);
CREATE INDEX IF NOT EXISTS idx_pos_inbox_result ON pos_sync_inbox(result_type, result_id);

PRAGMA foreign_keys = ON;
