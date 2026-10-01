-- Product variant attributes (Wattage, Base, Colour, etc.) stored as JSON object on product master.

ALTER TABLE products ADD COLUMN attributes TEXT;
