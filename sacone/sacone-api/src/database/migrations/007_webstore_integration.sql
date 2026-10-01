-- SACONE Phase 9: Web Store Integration APIs
-- API keys, request logs, and future order provision stubs (no full order management).

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  expires_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id TEXT PRIMARY KEY,
  api_key_id TEXT REFERENCES api_keys(id),
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_logs_key ON api_request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_path ON api_request_logs(path);

-- Future order intake only — does NOT reserve stock or post inventory movements
CREATE TABLE IF NOT EXISTS web_order_provisions (
  id TEXT PRIMARY KEY,
  provision_number TEXT NOT NULL UNIQUE,
  api_key_id TEXT REFERENCES api_keys(id),
  customer_id TEXT REFERENCES customers(id),
  external_order_ref TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'rejected', 'superseded')),
  rejection_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_order_provisions_created ON web_order_provisions(created_at);
CREATE INDEX IF NOT EXISTS idx_web_order_provisions_customer ON web_order_provisions(customer_id);
CREATE INDEX IF NOT EXISTS idx_web_order_provisions_ext ON web_order_provisions(external_order_ref);
