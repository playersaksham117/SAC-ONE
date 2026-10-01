-- Smart SKU engine: product family codes + central barcode sequence

CREATE TABLE IF NOT EXISTS product_family_codes (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  code TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_family_keyword_lower ON product_family_codes(LOWER(keyword));
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_family_code_upper ON product_family_codes(UPPER(code));

CREATE TABLE IF NOT EXISTS barcode_sequences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_value INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO barcode_sequences (id, last_value) VALUES (1, 0);

-- Seed common product family codes (longer keywords should have higher priority)
-- Applied only when table is empty via setup; duplicates skipped by unique index on re-run.
