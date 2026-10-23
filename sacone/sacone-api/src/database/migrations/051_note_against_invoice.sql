-- How much of a credit note cleared the invoice's unpaid amount, so a note can be edited
-- (its effects undone exactly). Cash / UPI / bank notes: that is the adjusted amount.
-- Older "keep as customer credit" notes stay NULL (not editable).
ALTER TABLE pos_sales_returns ADD COLUMN against_invoice REAL;
UPDATE pos_sales_returns SET against_invoice = adjusted_amount WHERE refund_method != 'credit_note';
