-- SACONE Phase 10: SQLite to JSON Export (read-only; does not alter business tables)

CREATE TABLE IF NOT EXISTS export_logs (
  id TEXT PRIMARY KEY,
  export_number TEXT NOT NULL UNIQUE,
  export_type TEXT NOT NULL CHECK (export_type IN ('dataset', 'complete')),
  datasets TEXT NOT NULL,
  date_from TEXT,
  date_to TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'partial')),
  file_count INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  output_dir TEXT,
  files_json TEXT,
  validation_ok INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_logs_created ON export_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_export_logs_type ON export_logs(export_type);
