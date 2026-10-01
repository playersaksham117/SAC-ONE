-- SACONE Phase 3: Central Product Master
-- Single product master shared by POS, Inventory, Warehouse, Dashboard, Web Store

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_lower ON categories(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name_lower ON brands(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_units_name_lower ON units(LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_abbreviation_lower ON units(LOWER(abbreviation));
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  hsn_code TEXT,
  gst_percentage REAL NOT NULL DEFAULT 0,
  mrp REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  purchase_price REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  minimum_stock REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  web_store_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_lower ON products(LOWER(sku));
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_lower ON products(LOWER(barcode)) WHERE barcode IS NOT NULL AND barcode != '';
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_web_store ON products(web_store_published);
