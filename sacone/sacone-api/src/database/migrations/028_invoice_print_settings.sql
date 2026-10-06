-- Invoice printing (Administration → System Settings → Invoice printing).
-- layout: classic = boxed GST tax-invoice grid (default), modern = clean layout.
INSERT OR IGNORE INTO system_settings (key, value, description, updated_at) VALUES
  ('invoice.layout', 'classic', 'Default A4/A5 invoice layout: classic (GST grid) or modern', datetime('now')),
  ('invoice.copy_label', 'ORIGINAL FOR RECIPIENT', 'Copy label printed under "Tax Invoice"', datetime('now')),
  ('invoice.bank_details', '', 'Bank details printed on invoices (bank, account number, IFSC)', datetime('now')),
  ('invoice.terms', '', 'Terms & conditions printed on invoices, one per line', datetime('now')),
  ('invoice.declaration', 'Certified that the particulars given above are true and correct.', 'Declaration printed above the bank details', datetime('now'));
