-- Minimal seed for local in-memory Postgres (no demo products/warehouses)

INSERT INTO public.app_settings (
  id, company_name, currency, currency_symbol, timezone, date_format,
  low_stock_threshold, dead_stock_days, pin_lock_minutes, sync_enabled, barcode_series_next
) VALUES (
  'singleton', 'My Company', 'INR', '₹', 'Asia/Kolkata', 'dd/MM/yyyy', 10, 60, 10, false, 1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (
  id, username, email, display_name, password_hash, role, is_active, is_deleted
) VALUES (
  'dev-test-user', 'devadmin', 'dev@tracinvent.local', 'Dev Admin', 'dev-hash', 'admin', true, false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_categories (id, name, code, description, is_active, is_deleted) VALUES
  ('cat-general', 'General', 'GENERAL', 'Default category', true, false),
  ('cat-hardware', 'Hardware', 'HARDWARE', 'Bolts, nuts, fasteners', true, false),
  ('cat-electrical', 'Electrical', 'ELECTRICAL', 'Wires, bulbs, switches', true, false),
  ('cat-plumbing', 'Plumbing', 'PLUMBING', 'Pipes and fittings', true, false),
  ('cat-tools', 'Tools', 'TOOLS', 'Hand and power tools', true, false),
  ('cat-paints', 'Paints', 'PAINTS', 'Paints and coatings', true, false),
  ('cat-stationery', 'Stationery', 'STATIONERY', 'Office supplies', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customer_groups (id, name, code, credit_policy_days, notes, is_active, is_deleted) VALUES
  ('cg-retail', 'Retail', 'RETAIL', 15, 'Walk-in and retail buyers', true, false),
  ('cg-wholesale', 'Wholesale', 'WHOLESALE', 45, 'Wholesale accounts', true, false),
  ('cg-corporate', 'Corporate', 'CORP', 60, 'Corporate accounts', true, false)
ON CONFLICT (id) DO NOTHING;
