-- GST credit notes (customer returns) and debit notes (returns to suppliers).
-- The return record is the note: it gets a yearly-numbered CN / DN number from the document
-- series, keeps the GST split, and records how its value was settled against the original
-- invoice or bill. Older returns get their note numbers the first time notes are listed.

ALTER TABLE pos_sales_returns ADD COLUMN note_number TEXT;
ALTER TABLE pos_sales_returns ADD COLUMN financial_year TEXT;
ALTER TABLE pos_sales_returns ADD COLUMN cgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE pos_sales_returns ADD COLUMN sgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE pos_sales_returns ADD COLUMN igst_amount REAL NOT NULL DEFAULT 0;
-- Part of the note set against the invoice's unpaid balance (or kept as customer credit).
ALTER TABLE pos_sales_returns ADD COLUMN adjusted_amount REAL NOT NULL DEFAULT 0;
-- Part paid back to the customer in cash / UPI / bank.
ALTER TABLE pos_sales_returns ADD COLUMN refund_amount REAL NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_returns_note_number
  ON pos_sales_returns(note_number) WHERE note_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_returns_fy ON pos_sales_returns(financial_year);

ALTER TABLE purchase_returns ADD COLUMN note_number TEXT;
ALTER TABLE purchase_returns ADD COLUMN financial_year TEXT;
ALTER TABLE purchase_returns ADD COLUMN cgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN sgst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN igst_amount REAL NOT NULL DEFAULT 0;
-- Part of the note taken off the linked bill's payable.
ALTER TABLE purchase_returns ADD COLUMN adjusted_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_returns_note_number
  ON purchase_returns(note_number) WHERE note_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_returns_fy ON purchase_returns(financial_year);

ALTER TABLE purchase_return_items ADD COLUMN bill_item_id TEXT;
ALTER TABLE purchase_return_items ADD COLUMN hsn_code TEXT;
ALTER TABLE purchase_return_items ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_return_items ADD COLUMN taxable_amount REAL;
ALTER TABLE purchase_return_items ADD COLUMN gst_amount REAL;

-- Debit notes reduce what is still payable on a bill; payments recompute payable with it.
ALTER TABLE supplier_bills ADD COLUMN returned_amount REAL NOT NULL DEFAULT 0;

-- Financial year (Apr–Mar, '2026-27') of existing returns.
UPDATE pos_sales_returns SET financial_year = CASE
  WHEN CAST(substr(created_at, 6, 2) AS INTEGER) >= 4
    THEN substr(created_at, 1, 4) || '-' || printf('%02d', (CAST(substr(created_at, 1, 4) AS INTEGER) + 1) % 100)
  ELSE (CAST(substr(created_at, 1, 4) AS INTEGER) - 1) || '-' || substr(created_at, 3, 2)
END WHERE financial_year IS NULL;

UPDATE purchase_returns SET financial_year = CASE
  WHEN CAST(substr(return_date, 6, 2) AS INTEGER) >= 4
    THEN substr(return_date, 1, 4) || '-' || printf('%02d', (CAST(substr(return_date, 1, 4) AS INTEGER) + 1) % 100)
  ELSE (CAST(substr(return_date, 1, 4) AS INTEGER) - 1) || '-' || substr(return_date, 3, 2)
END WHERE financial_year IS NULL;

-- How existing customer returns were settled: credit notes went to the balance, the rest was refunded.
UPDATE pos_sales_returns SET adjusted_amount = grand_total, refund_amount = 0 WHERE refund_method = 'credit_note';
UPDATE pos_sales_returns SET adjusted_amount = 0, refund_amount = grand_total WHERE refund_method != 'credit_note';

-- GST split of existing customer returns follows their invoice (IGST when the invoice was inter-state).
UPDATE pos_sales_returns SET
  igst_amount = CASE WHEN (SELECT igst_amount FROM pos_sales s WHERE s.id = pos_sales_returns.sale_id) > 0 THEN gst_amount ELSE 0 END,
  cgst_amount = CASE WHEN (SELECT igst_amount FROM pos_sales s WHERE s.id = pos_sales_returns.sale_id) > 0 THEN 0 ELSE round(gst_amount / 2, 2) END,
  sgst_amount = CASE WHEN (SELECT igst_amount FROM pos_sales s WHERE s.id = pos_sales_returns.sale_id) > 0 THEN 0 ELSE gst_amount - round(gst_amount / 2, 2) END;
