-- Price floor for selling: no edited price or discount may take a product's net unit price
-- (GST-exclusive) below it. NULL / 0 = the selling price itself is the floor.
ALTER TABLE products ADD COLUMN min_selling_price REAL;
