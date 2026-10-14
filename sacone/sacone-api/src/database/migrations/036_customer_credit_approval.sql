-- Credit (udhar) only for customers the firm admin has approved in the ERP. Customers created on
-- SAC-POS start unapproved. Existing ERP customers, and anyone already buying on credit, keep it.

ALTER TABLE customers ADD COLUMN credit_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN credit_approved_by TEXT;
ALTER TABLE customers ADD COLUMN credit_approved_at TEXT;

UPDATE customers SET credit_approved = 1, credit_approved_at = updated_at
WHERE is_walk_in = 0 AND (
  source_channel != 'pos'
  OR credit_limit > 0
  OR outstanding_balance > 0.001
  OR EXISTS (SELECT 1 FROM pos_sales s WHERE s.customer_id = customers.id AND s.amount_credit > 0)
);
