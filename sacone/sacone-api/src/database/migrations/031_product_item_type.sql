-- Products & Services: an item is either goods (stock-tracked) or a service (no stock).
-- Selling, returning or buying a service never moves stock, so it can never go negative.
ALTER TABLE products ADD COLUMN item_type TEXT NOT NULL DEFAULT 'goods' CHECK (item_type IN ('goods', 'service'));

CREATE INDEX IF NOT EXISTS idx_products_item_type ON products(item_type);
