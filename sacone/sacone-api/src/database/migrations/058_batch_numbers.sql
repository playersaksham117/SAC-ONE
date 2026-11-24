-- Batch numbers: typed on purchase bill lines (that registers the batch) and on sale lines
-- (SAC-POS / ERP). Warranty Check and the Batch Register find bills by them.
ALTER TABLE supplier_bill_items ADD COLUMN batch_number TEXT;
ALTER TABLE pos_sale_items ADD COLUMN batch_number TEXT;

CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_batch ON supplier_bill_items(batch_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_batch ON pos_sale_items(batch_number COLLATE NOCASE);
