-- Invoices numbered SE/0001/26-27 (firm / number / financial year): one series for cash and
-- credit invoices. Firms that already set their own invoice format keep it.
UPDATE document_series SET format_template = '{FIRM}/{NUMBER}/{FY}', updated_at = datetime('now')
WHERE document_type = 'tax_invoice' AND (format_template IS NULL OR trim(format_template) = '');
