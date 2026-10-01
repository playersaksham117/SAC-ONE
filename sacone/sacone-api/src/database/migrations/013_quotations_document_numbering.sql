-- SACONE Phase 15: Quotations, document numbering, customer snapshots

-- Firm / company document settings
ALTER TABLE companies ADD COLUMN firm_prefix TEXT;
ALTER TABLE companies ADD COLUMN firm_prefix_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN document_number_format TEXT NOT NULL DEFAULT '{FIRM}/{DOC}/{NUMBER}/{FY}';
ALTER TABLE companies ADD COLUMN simple_number_format TEXT NOT NULL DEFAULT '{FIRM}/{NUMBER}/{FY}';
ALTER TABLE companies ADD COLUMN number_padding INTEGER NOT NULL DEFAULT 4;
ALTER TABLE companies ADD COLUMN fy_reset_numbering INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN authorized_signatory TEXT;
ALTER TABLE companies ADD COLUMN document_stamp_url TEXT;

-- Customer master extensions
ALTER TABLE customers ADD COLUMN business_name TEXT;
ALTER TABLE customers ADD COLUMN contact_person TEXT;
ALTER TABLE customers ADD COLUMN postal_code TEXT;
ALTER TABLE customers ADD COLUMN shipping_address TEXT;
ALTER TABLE customers ADD COLUMN shipping_city TEXT;
ALTER TABLE customers ADD COLUMN shipping_state TEXT;
ALTER TABLE customers ADD COLUMN shipping_postal_code TEXT;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Address',
  address_type TEXT NOT NULL DEFAULT 'billing'
    CHECK (address_type IN ('billing', 'shipping', 'both')),
  contact_person TEXT,
  address_line TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  is_default_billing INTEGER NOT NULL DEFAULT 0,
  is_default_shipping INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- Document numbering series (per firm, per document type)
CREATE TABLE IF NOT EXISTS document_series (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL REFERENCES companies(id),
  document_type TEXT NOT NULL,
  doc_prefix TEXT NOT NULL,
  format_template TEXT,
  starting_number INTEGER NOT NULL DEFAULT 1,
  reset_each_fy INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(firm_id, document_type)
);

CREATE TABLE IF NOT EXISTS document_sequences (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES document_series(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(series_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_document_sequences_series ON document_sequences(series_id, financial_year);

-- Quotations
CREATE TABLE IF NOT EXISTS pos_quotations (
  id TEXT PRIMARY KEY,
  quotation_number TEXT NOT NULL UNIQUE,
  firm_id TEXT NOT NULL REFERENCES companies(id),
  warehouse_id TEXT REFERENCES warehouses(id),
  customer_id TEXT REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted', 'cancelled')),
  quotation_date TEXT NOT NULL,
  valid_until TEXT,
  financial_year TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  item_discount_total REAL NOT NULL DEFAULT 0,
  invoice_discount REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  terms_conditions TEXT,
  -- Customer snapshot (historical)
  snap_customer_name TEXT,
  snap_business_name TEXT,
  snap_contact_person TEXT,
  snap_phone TEXT,
  snap_email TEXT,
  snap_gst_number TEXT,
  snap_billing_address TEXT,
  snap_billing_city TEXT,
  snap_billing_state TEXT,
  snap_billing_postal TEXT,
  snap_shipping_address TEXT,
  snap_shipping_city TEXT,
  snap_shipping_state TEXT,
  snap_shipping_postal TEXT,
  converted_sale_id TEXT REFERENCES pos_sales(id),
  sent_at TEXT,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_quotations_status ON pos_quotations(status);
CREATE INDEX IF NOT EXISTS idx_pos_quotations_customer ON pos_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_quotations_date ON pos_quotations(quotation_date);

CREATE TABLE IF NOT EXISTS pos_quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES pos_quotations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  unit_abbreviation TEXT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  gst_percentage REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pos_quotation_items_quote ON pos_quotation_items(quotation_id);

-- Link sales to quotations + document type
ALTER TABLE pos_sales ADD COLUMN quotation_id TEXT REFERENCES pos_quotations(id);
ALTER TABLE pos_sales ADD COLUMN firm_id TEXT REFERENCES companies(id);
ALTER TABLE pos_sales ADD COLUMN document_type TEXT NOT NULL DEFAULT 'tax_invoice';

CREATE INDEX IF NOT EXISTS idx_pos_sales_quotation ON pos_sales(quotation_id);

-- Document share / activity log
CREATE TABLE IF NOT EXISTS document_share_log (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_number TEXT,
  action TEXT NOT NULL
    CHECK (action IN ('printed', 'pdf_generated', 'whatsapp_share', 'email_sent', 'email_failed', 'converted', 'cancelled')),
  channel TEXT,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'attempted'
    CHECK (status IN ('attempted', 'success', 'failed')),
  message TEXT,
  metadata_json TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_share_log_doc ON document_share_log(document_type, document_id);

CREATE TABLE IF NOT EXISTS email_send_log (
  id TEXT PRIMARY KEY,
  document_type TEXT,
  document_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed')),
  error_message TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  sent_at TEXT
);

-- Email / document defaults
INSERT OR IGNORE INTO system_settings (key, value, description, updated_at) VALUES
  ('email.default_subject', 'Quotation {NUMBER} from {FIRM}', 'Default quotation email subject', datetime('now')),
  ('email.default_body', 'Dear {CUSTOMER},\n\nPlease find attached our quotation {NUMBER}.\n\nPlease contact us for any clarification.\n\nRegards,\n{FIRM}', 'Default quotation email body', datetime('now')),
  ('email.signature', '', 'Email signature appended to outbound messages', datetime('now')),
  ('email.reply_to', '', 'Reply-to address for document emails', datetime('now')),
  ('quotation.default_validity_days', '15', 'Default quotation validity in days', datetime('now')),
  ('pos.allow_walk_in_quotation', 'true', 'Allow quotations for walk-in customers', datetime('now'));
