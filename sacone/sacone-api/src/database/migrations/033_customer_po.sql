-- The customer's own purchase order (PO) number and date, for B2B bills: entered on a
-- quotation or a sale (ERP or SAC-POS), carried from quotation to invoice and through edits,
-- printed on the invoice and searchable.

ALTER TABLE pos_sales ADD COLUMN customer_po_number TEXT;
ALTER TABLE pos_sales ADD COLUMN customer_po_date TEXT;
CREATE INDEX IF NOT EXISTS idx_pos_sales_customer_po ON pos_sales(customer_po_number) WHERE customer_po_number IS NOT NULL;

ALTER TABLE pos_quotations ADD COLUMN customer_po_number TEXT;
ALTER TABLE pos_quotations ADD COLUMN customer_po_date TEXT;
