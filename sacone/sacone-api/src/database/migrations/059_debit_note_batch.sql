-- Batch number on debit note (purchase return) lines: which batch goes back to the supplier.
ALTER TABLE purchase_return_items ADD COLUMN batch_number TEXT;
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_batch ON purchase_return_items(batch_number COLLATE NOCASE);
