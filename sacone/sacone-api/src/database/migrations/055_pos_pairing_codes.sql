-- Short pairing codes for connecting a phone / browser to a POS terminal (ERP → POS Devices →
-- Connect a device). A code is shown instead of the long sync key, works once, expires in
-- minutes, and changes nothing until a device uses it (only then the terminal gets a new key,
-- delivered straight to that device).
CREATE TABLE IF NOT EXISTS pos_device_pairing_codes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_pairing_codes_device ON pos_device_pairing_codes(device_id);
