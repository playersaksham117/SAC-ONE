-- Credit days for customers and suppliers: a credit bill falls due this many days after its date
-- (blank = 30). Used for invoice / purchase bill due dates and the aging of what is owed.
ALTER TABLE customers ADD COLUMN credit_days INTEGER;
ALTER TABLE suppliers ADD COLUMN credit_days INTEGER;

-- Suppliers: take the number from the old payment terms text ("Net 30", "30 days", "45").
UPDATE suppliers
SET credit_days = CAST(trim(replace(replace(replace(upper(payment_terms), 'NET', ''), 'DAYS', ''), 'DAY', '')) AS INTEGER)
WHERE payment_terms IS NOT NULL
  AND CAST(trim(replace(replace(replace(upper(payment_terms), 'NET', ''), 'DAYS', ''), 'DAY', '')) AS INTEGER) BETWEEN 1 AND 365;

CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON supplier_bills(supplier_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_pos_sales_customer ON pos_sales(customer_id, created_at);
