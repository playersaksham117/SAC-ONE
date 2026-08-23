-- Minimal seed: settings + dev login only (no products, warehouses, or transactions)

INSERT OR IGNORE INTO app_settings (
  id, company_name, currency, currency_symbol, timezone, date_format,
  low_stock_threshold, dead_stock_days, pin_lock_minutes, sync_enabled, barcode_series_next
) VALUES (
  'singleton', 'My Company', 'INR', '₹', 'Asia/Kolkata', 'dd/MM/yyyy', 10, 60, 10, 0, 1
);

INSERT OR IGNORE INTO product_categories (id, name, code, description) VALUES
  ('cat-general', 'General', 'GENERAL', 'Default category'),
  ('cat-hardware', 'Hardware', 'HARDWARE', 'Bolts, nuts, fasteners'),
  ('cat-electrical', 'Electrical', 'ELECTRICAL', 'Wires, bulbs, switches'),
  ('cat-plumbing', 'Plumbing', 'PLUMBING', 'Pipes and fittings'),
  ('cat-tools', 'Tools', 'TOOLS', 'Hand and power tools');

INSERT OR IGNORE INTO users (
  id, username, email, display_name, password_hash, role, is_active, is_deleted
) VALUES (
  'dev-test-user', 'devadmin', 'dev@tracinvent.local', 'Dev Admin', 'dev-hash', 'admin', 1, 0
);
