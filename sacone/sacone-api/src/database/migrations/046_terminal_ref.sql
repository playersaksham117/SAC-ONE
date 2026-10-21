-- SAC-POS bills now take the firm's invoice series (e.g. SE/0005/26-27) when they sync; the
-- phone's own bill reference (DEVICE-S261021-0001) is kept here for matching returns, payments
-- and duplicate pushes. Bills already synced kept the phone reference as their number.
ALTER TABLE pos_sales ADD COLUMN terminal_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_pos_sales_terminal_ref ON pos_sales(terminal_ref) WHERE terminal_ref IS NOT NULL;
UPDATE pos_sales SET terminal_ref = invoice_number WHERE terminal_ref IS NULL AND notes LIKE '%Synced from %';
