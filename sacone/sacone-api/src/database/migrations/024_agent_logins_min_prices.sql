-- 1. Rebuild sales_agents.
--    a) Migration 023 dropped the HR `employees` table, but sales_agents.employee_id still
--       REFERENCES employees(id); SQLite then rejects every INSERT into sales_agents
--       ("no such table: main.employees"). The column goes; every row is kept.
--    b) Sales agents are sales staff: user_id links an agent to the ERP login they sell with
--       (SAC-POS sign-in), so their sales are credited to them for commission automatically.
PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE sales_agents_new (
  id TEXT PRIMARY KEY,
  agent_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (agent_type IN ('employee', 'internal', 'external')),
  user_id TEXT REFERENCES users(id),
  mobile TEXT,
  email TEXT,
  address TEXT,
  joining_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  commission_plan_id TEXT,
  default_commission_rate REAL NOT NULL DEFAULT 0,
  default_commission_basis TEXT NOT NULL DEFAULT 'taxable'
    CHECK (default_commission_basis IN ('sales_value', 'taxable', 'gross_profit', 'fixed')),
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  remarks TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO sales_agents_new (
  id, agent_code, name, agent_type, mobile, email, address, joining_date, status,
  commission_plan_id, default_commission_rate, default_commission_basis,
  bank_account_name, bank_account_number, bank_ifsc, bank_name, remarks,
  created_by, created_at, updated_at
)
SELECT
  id, agent_code, name, agent_type, mobile, email, address, joining_date, status,
  commission_plan_id, default_commission_rate, default_commission_basis,
  bank_account_name, bank_account_number, bank_ifsc, bank_name, remarks,
  created_by, created_at, updated_at
FROM sales_agents;

DROP TABLE sales_agents;
ALTER TABLE sales_agents_new RENAME TO sales_agents;
CREATE INDEX IF NOT EXISTS idx_sales_agents_status ON sales_agents(status);
CREATE INDEX IF NOT EXISTS idx_sales_agents_code ON sales_agents(agent_code);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_agents_user ON sales_agents(user_id) WHERE user_id IS NOT NULL;

-- 2. Minimum selling prices, managed only in Commission settings.
--    Selling below the floor is blocked (offline POS sales are recorded with a warning) and
--    the lines below it earn no commission. Most specific scope wins: product > brand > category.
CREATE TABLE IF NOT EXISTS min_selling_prices (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('product', 'brand', 'category')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  min_price REAL,              -- fixed floor per unit (product scope)
  min_percent_of_mrp REAL,     -- or a floor as % of MRP (any scope)
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_price IS NOT NULL OR min_percent_of_mrp IS NOT NULL),
  CHECK (
    (scope = 'product' AND product_id IS NOT NULL AND brand_id IS NULL AND category_id IS NULL) OR
    (scope = 'brand' AND brand_id IS NOT NULL AND product_id IS NULL AND category_id IS NULL) OR
    (scope = 'category' AND category_id IS NOT NULL AND product_id IS NULL AND brand_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_min_price_product ON min_selling_prices(product_id) WHERE scope = 'product';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_min_price_brand ON min_selling_prices(brand_id) WHERE scope = 'brand';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_min_price_category ON min_selling_prices(category_id) WHERE scope = 'category';

COMMIT;
PRAGMA foreign_keys = ON;
