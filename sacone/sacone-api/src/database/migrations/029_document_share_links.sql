-- Short-lived links that let a customer open one shared document (sales invoice).
-- Only a SHA-256 hash of the random token is stored; the token itself is shown once, to the user who created it.
CREATE TABLE IF NOT EXISTS document_share_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL CHECK (document_type IN ('sale_invoice')),
  document_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_share_links_document ON document_share_links(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_document_share_links_expires ON document_share_links(expires_at);
