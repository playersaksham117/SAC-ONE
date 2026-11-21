-- Retail price: what a product is billed at by default (POS, invoices, quotations, challans,
-- web store, labels). selling_price is now shown as the Minimum selling price: the floor no
-- edited rate or discount may go below (unless a Commission settings rule sets another floor).
-- Existing products start with retail = their current selling price, so nothing changes until
-- a retail price is entered.
ALTER TABLE products ADD COLUMN retail_price REAL;
UPDATE products SET retail_price = selling_price WHERE retail_price IS NULL;
