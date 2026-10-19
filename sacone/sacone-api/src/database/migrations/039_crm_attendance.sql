-- CRM: leads (enquiries) with stage and owner, follow-ups (calls / visits due on a date) and an
-- activity log (what was done) for leads and customers.
CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  source TEXT,
  requirement TEXT,
  expected_value REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  lost_reason TEXT,
  assigned_to TEXT,
  customer_id TEXT REFERENCES customers(id),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(assigned_to);

CREATE TABLE IF NOT EXISTS crm_followups (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  due_date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'call'
    CHECK (kind IN ('call', 'visit', 'whatsapp', 'email', 'meeting')),
  purpose TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  done_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crm_followups_due ON crm_followups(status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_followups_lead ON crm_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_customer ON crm_followups(customer_id);

CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('call', 'visit', 'whatsapp', 'email', 'meeting', 'note', 'stage')),
  notes TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL,
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON crm_activities(customer_id, created_at);

-- Attendance of the firm's users (User Management): one row per user per day.
-- Check-in / check-out from the ERP or SAC-POS, or marked by an admin in the daily register.
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'half_day', 'absent', 'leave', 'holiday', 'week_off')),
  check_in TEXT,
  check_out TEXT,
  minutes INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'erp' CHECK (source IN ('erp', 'pos', 'admin')),
  note TEXT,
  marked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
