-- Users and roles belong to one firm. firm_id NULL is the group level: only the group owner
-- (role 'owner_admin'), who opens every firm. Each firm has its own copy of the built-in roles,
-- so role slugs are unique per firm instead of overall (approval rules keep matching by slug).
-- Assigning existing rows to firms happens in database setup (firm-identity.js).

PRAGMA foreign_keys = OFF;

CREATE TABLE roles_new (
  id TEXT PRIMARY KEY,
  firm_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

INSERT INTO roles_new (id, firm_id, name, slug, description, is_system, is_active, created_at, updated_at, created_by)
  SELECT id, NULL, name, slug, description, is_system, is_active, created_at, updated_at, created_by FROM roles;

DROP TABLE roles;
ALTER TABLE roles_new RENAME TO roles;

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_firm_slug ON roles(COALESCE(firm_id, ''), slug);
CREATE INDEX IF NOT EXISTS idx_roles_firm ON roles(firm_id);

ALTER TABLE users ADD COLUMN firm_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_firm ON users(firm_id);

PRAGMA foreign_keys = ON;
