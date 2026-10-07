-- Multiple firms with fully separate books, one financial year at a time.
--
-- The main database file is the "core" (users, roles, sign-in, this firm list) and also holds the
-- books of the first firm. Every other firm keeps its books in its own database file
-- (data/firms/<id>.db), so one firm's data can never show up in the other's.
-- These tables are only used in the core file; firm files carry them empty.

CREATE TABLE IF NOT EXISTS firms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- NULL for the firm whose books live in the main database file
  db_file TEXT UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- First financial year offered in the picker, e.g. '2026-27'
  first_financial_year TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

-- Which firms a user may open. Owner/Admin may open every firm without a row here.
CREATE TABLE IF NOT EXISTS user_firms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, firm_id)
);

CREATE INDEX IF NOT EXISTS idx_user_firms_firm ON user_firms(firm_id);

-- The firm and financial year chosen after signing in (NULL until chosen).
ALTER TABLE sessions ADD COLUMN firm_id TEXT;
ALTER TABLE sessions ADD COLUMN financial_year TEXT;
