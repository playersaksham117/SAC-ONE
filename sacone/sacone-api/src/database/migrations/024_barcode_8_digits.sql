-- In-house barcodes are now 8 digits starting at 00000001. Opening the product form used to
-- use up a number each time, so databases without any in-house barcode yet start again at 1.
-- Databases that already have products with in-house barcodes keep counting from there.
UPDATE barcode_sequences
SET last_value = 0
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1 FROM products
    WHERE length(barcode) IN (8, 9) AND barcode NOT GLOB '*[^0-9]*'
  );
