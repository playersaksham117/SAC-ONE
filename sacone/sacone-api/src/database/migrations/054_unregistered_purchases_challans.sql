-- Purchases from unregistered suppliers (no GSTIN): the bill carries no GST and no input tax
-- credit; it still counts in stock, purchases and margins. Existing bills from suppliers without
-- a GSTIN and with no GST on them are marked so.
ALTER TABLE supplier_bills ADD COLUMN is_unregistered INTEGER NOT NULL DEFAULT 0;
UPDATE supplier_bills SET is_unregistered = 1
WHERE COALESCE(gst_amount, 0) = 0
  AND supplier_id IN (SELECT id FROM suppliers WHERE COALESCE(trim(gst_number), '') = '');

-- Delivery challans: goods sent out without a sale (on approval, job work, sample, other).
-- Stock goes out when issued; closing as returned brings it back, as invoiced hands it over to
-- the POS bill (which takes the stock), as kept / written off leaves it out. No GST, no sale.
CREATE TABLE IF NOT EXISTS delivery_challans (
  id TEXT PRIMARY KEY,
  challan_number TEXT NOT NULL UNIQUE,
  challan_date TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('approval', 'job_work', 'sample', 'other')),
  customer_id TEXT REFERENCES customers(id),
  party_name TEXT NOT NULL,
  party_address TEXT,
  party_gstin TEXT,
  party_phone TEXT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned', 'invoiced', 'kept', 'cancelled')),
  closed_at TEXT,
  closed_by TEXT REFERENCES users(id),
  close_note TEXT,
  invoice_number TEXT,
  vehicle_number TEXT,
  notes TEXT,
  total_value REAL NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id TEXT PRIMARY KEY,
  challan_id TEXT NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  rate REAL NOT NULL DEFAULT 0,
  value REAL NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_delivery_challans_date ON delivery_challans(challan_date);
CREATE INDEX IF NOT EXISTS idx_delivery_challan_items_challan ON delivery_challan_items(challan_id);
