-- A product's short description (one line of specs, e.g. "1200 mm, 75 W, 5-star"), printed under
-- the item on A4 / A5 invoices and on quotations. Invoice and quotation lines keep a copy from
-- when they were made; quotation lines also keep the warranty / guarantee periods.
ALTER TABLE products ADD COLUMN short_description TEXT;
ALTER TABLE pos_sale_items ADD COLUMN short_description TEXT;

ALTER TABLE pos_quotation_items ADD COLUMN short_description TEXT;
ALTER TABLE pos_quotation_items ADD COLUMN warranty_value INTEGER;
ALTER TABLE pos_quotation_items ADD COLUMN warranty_unit TEXT;
ALTER TABLE pos_quotation_items ADD COLUMN guarantee_value INTEGER;
ALTER TABLE pos_quotation_items ADD COLUMN guarantee_unit TEXT;
