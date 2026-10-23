-- Price realisation: each invoice line keeps the product's base selling price at the moment of
-- sale (before GST), so the ERP can show what was sold above the base price, and by how much,
-- even after the product's price changes later. NULL on lines made before this was added.
ALTER TABLE pos_sale_items ADD COLUMN base_price REAL;
