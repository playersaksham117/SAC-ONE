-- Warranty and guarantee periods on products (a number of days, months or years, counted from
-- the invoice date). Each invoice line keeps a copy from the time of sale, so changing a
-- product later does not change what old bills promised.
ALTER TABLE products ADD COLUMN warranty_value INTEGER;
ALTER TABLE products ADD COLUMN warranty_unit TEXT CHECK (warranty_unit IN ('days', 'months', 'years'));
ALTER TABLE products ADD COLUMN guarantee_value INTEGER;
ALTER TABLE products ADD COLUMN guarantee_unit TEXT CHECK (guarantee_unit IN ('days', 'months', 'years'));

ALTER TABLE pos_sale_items ADD COLUMN warranty_value INTEGER;
ALTER TABLE pos_sale_items ADD COLUMN warranty_unit TEXT;
ALTER TABLE pos_sale_items ADD COLUMN guarantee_value INTEGER;
ALTER TABLE pos_sale_items ADD COLUMN guarantee_unit TEXT;
