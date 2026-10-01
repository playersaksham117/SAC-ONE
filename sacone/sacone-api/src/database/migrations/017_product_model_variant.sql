-- Optional Variant / Model on product master (simple text — not attribute rows)

ALTER TABLE products ADD COLUMN model_variant TEXT;

CREATE INDEX IF NOT EXISTS idx_products_model_variant ON products(model_variant);
