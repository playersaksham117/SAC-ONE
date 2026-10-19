-- SAC-POS sign-in: a Login ID (optional; email always works) and a PIN, set only by an admin in
-- ERP → Users. Kept in the main database only (never copied into firm files); the PIN is bcrypt-hashed.
-- Wrong PINs are counted; after 5 the login is locked for 15 minutes.
CREATE TABLE IF NOT EXISTS user_pos_pins (
  user_id TEXT PRIMARY KEY,
  login_id TEXT,
  pin_hash TEXT,
  pin_set_at TEXT,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  set_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_pos_login_id ON user_pos_pins(lower(login_id)) WHERE login_id IS NOT NULL;
