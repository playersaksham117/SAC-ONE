-- Opening balances carried in from before SACONE: what customers owed us and what we owed
-- suppliers on the go-live date. One row per party; the amount is also added to the party's
-- outstanding so balances, credit limits and SAC-POS dues include it.
--   customer: amount > 0 = customer owes us (receivable), < 0 = advance from customer
--   supplier: amount > 0 = we owe the supplier (payable),  < 0 = advance paid to supplier
CREATE TABLE IF NOT EXISTS opening_balances (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  party_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  as_of_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (party_type, party_id)
);

CREATE INDEX IF NOT EXISTS idx_opening_balances_party ON opening_balances(party_type, party_id);
