-- SACONE Owner opens with a private owner key instead of an ERP login. Only a SHA-256 hash
-- of the key is kept here (set or change it with `npm run owner-key` on the server PC).
CREATE TABLE IF NOT EXISTS owner_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key_hash TEXT NOT NULL,
  key_hint TEXT,
  created_at TEXT NOT NULL
);
