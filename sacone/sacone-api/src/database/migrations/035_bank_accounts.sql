-- Bank details on bank-type payment accounts (one default per firm, printed on invoices with a
-- UPI pay QR), the bank behind each sale UPI / bank payment, and a bank per POS terminal.

ALTER TABLE financial_payment_accounts ADD COLUMN bank_name TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN account_holder TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN account_number TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN ifsc TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN branch TEXT;
-- savings | current | od | cc
ALTER TABLE financial_payment_accounts ADD COLUMN bank_account_type TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN upi_id TEXT;
ALTER TABLE financial_payment_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- Which bank / UPI account received a sale's UPI, bank or card payment.
ALTER TABLE pos_payments ADD COLUMN payment_account_id TEXT REFERENCES financial_payment_accounts(id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_account ON pos_payments(payment_account_id);

-- The bank a POS terminal's UPI / bank payments go to (else the firm's default bank).
ALTER TABLE pos_devices ADD COLUMN payment_account_id TEXT REFERENCES financial_payment_accounts(id);
