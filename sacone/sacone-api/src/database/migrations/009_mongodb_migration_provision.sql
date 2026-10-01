-- SACONE Phase 11: Future MongoDB migration provision
-- Does NOT migrate data. Stores future migration/rollback audit records only.

CREATE TABLE IF NOT EXISTS migration_logs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('sqlite_to_mongo', 'json_to_mongo', 'mongo_to_sqlite', 'dry_run')),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'completed', 'failed', 'rolled_back', 'cancelled')),
  phase TEXT,
  collections_json TEXT NOT NULL DEFAULT '[]',
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  id_strategy TEXT NOT NULL DEFAULT 'preserve_uuid',
  validation_report_json TEXT,
  output_summary_json TEXT,
  rollback_of_batch_id TEXT,
  can_rollback INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_migration_logs_batch ON migration_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_migration_logs_status ON migration_logs(status);
CREATE INDEX IF NOT EXISTS idx_migration_logs_created ON migration_logs(created_at);

CREATE TABLE IF NOT EXISTS migration_checkpoints (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  last_source_id TEXT,
  records_done INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'failed', 'skipped')),
  checksum TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(batch_id, collection_name)
);

CREATE INDEX IF NOT EXISTS idx_migration_checkpoints_batch ON migration_checkpoints(batch_id);
