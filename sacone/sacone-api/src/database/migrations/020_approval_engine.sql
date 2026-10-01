-- SACONE Phase 20: Centralized approval rules & requests
-- Permissions remain separate; approvals gate finalization of sensitive actions.

CREATE TABLE IF NOT EXISTS approval_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  transaction_type TEXT,
  condition_type TEXT NOT NULL DEFAULT 'amount_gte'
    CHECK (condition_type IN ('amount_gte', 'quantity_gte', 'percent_gte', 'always')),
  threshold_amount REAL,
  threshold_quantity REAL,
  threshold_percent REAL,
  firm_id TEXT,
  branch_id TEXT,
  level1_role_slug TEXT NOT NULL,
  level2_role_slug TEXT,
  allow_self_approval INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_module ON approval_rules(module, action, is_active);
CREATE INDEX IF NOT EXISTS idx_approval_rules_active ON approval_rules(is_active, sort_order);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES approval_rules(id),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  transaction_type TEXT,
  transaction_id TEXT NOT NULL,
  amount REAL,
  quantity REAL,
  percent REAL,
  firm_id TEXT,
  branch_id TEXT,
  requested_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 1,
  required_levels INTEGER NOT NULL DEFAULT 1,
  level1_role_slug TEXT,
  level2_role_slug TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'partially_approved', 'approved', 'rejected', 'cancelled'
    )),
  approved_by_l1 TEXT REFERENCES users(id),
  approved_at_l1 TEXT,
  approved_by_l2 TEXT REFERENCES users(id),
  approved_at_l2 TEXT,
  rejected_by TEXT REFERENCES users(id),
  rejected_at TEXT,
  rejection_reason TEXT,
  comments TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_req_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_req_module ON approval_requests(module, transaction_id);
CREATE INDEX IF NOT EXISTS idx_approval_req_requested ON approval_requests(requested_by, status);
CREATE INDEX IF NOT EXISTS idx_approval_req_roles ON approval_requests(level1_role_slug, level2_role_slug, status);
CREATE INDEX IF NOT EXISTS idx_approval_req_created ON approval_requests(created_at);
