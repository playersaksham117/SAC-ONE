-- Serial numbers of the units sold on an invoice line (for warranty claims): entered at sale time
-- (ERP or SAC-POS) or added later from Warranty Check. One row per serial.
CREATE TABLE IF NOT EXISTS sale_item_serials (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id),
  sale_item_id TEXT NOT NULL,
  product_id TEXT,
  serial_number TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_item_serials_serial ON sale_item_serials(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sale_item_serials_item ON sale_item_serials(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_serials_sale ON sale_item_serials(sale_id);
