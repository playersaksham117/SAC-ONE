-- SACONE Phase 14: Employee Attendance & Wages Management
-- Employee records are separate from application login users (optional user_id link).

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  department TEXT,
  designation TEXT,
  firm_id TEXT REFERENCES companies(id),
  branch_id TEXT,
  joining_date TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'on_leave', 'terminated', 'inactive')),
  employment_type TEXT NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'daily_worker', 'contract_worker')),
  payment_type TEXT NOT NULL DEFAULT 'monthly_salary'
    CHECK (payment_type IN ('monthly_salary', 'daily_wage', 'hourly_wage')),
  wage_rate REAL NOT NULL DEFAULT 0,
  payment_details TEXT,
  emergency_contact TEXT,
  notes TEXT,
  user_id TEXT REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department, is_active);
CREATE INDEX IF NOT EXISTS idx_employees_firm ON employees(firm_id, branch_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'holiday', 'weekly_off', 'late', 'short_hours', 'overtime')),
  check_in_time TEXT,
  check_out_time TEXT,
  working_hours REAL,
  notes TEXT,
  marked_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id, attendance_date);

CREATE TABLE IF NOT EXISTS employee_advances (
  id TEXT PRIMARY KEY,
  advance_number TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  advance_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank', 'cheque', 'other')),
  payment_account_id TEXT REFERENCES financial_payment_accounts(id),
  reference_number TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'cancelled', 'fully_recovered')),
  amount_recovered REAL NOT NULL DEFAULT 0,
  balance_remaining REAL NOT NULL DEFAULT 0,
  financial_transaction_id TEXT REFERENCES financial_transactions(id),
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advances_employee ON employee_advances(employee_id, status);

CREATE TABLE IF NOT EXISTS advance_recoveries (
  id TEXT PRIMARY KEY,
  advance_id TEXT NOT NULL REFERENCES employee_advances(id),
  payroll_line_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  recovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  run_number TEXT NOT NULL UNIQUE,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'custom')),
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  firm_id TEXT REFERENCES companies(id),
  branch_id TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'attendance_verified', 'calculated', 'submitted',
      'pending_approval', 'approved', 'payment_processing', 'paid', 'cancelled', 'rejected'
    )),
  notes TEXT,
  rejection_reason TEXT,
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  submitted_at TEXT,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_from, period_to, status);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  payment_type TEXT NOT NULL,
  base_rate REAL NOT NULL DEFAULT 0,
  present_days REAL NOT NULL DEFAULT 0,
  half_days REAL NOT NULL DEFAULT 0,
  absent_days REAL NOT NULL DEFAULT 0,
  leave_days REAL NOT NULL DEFAULT 0,
  holiday_days REAL NOT NULL DEFAULT 0,
  weekly_off_days REAL NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  overtime_amount REAL NOT NULL DEFAULT 0,
  gross_wages REAL NOT NULL DEFAULT 0,
  additions_total REAL NOT NULL DEFAULT 0,
  deductions_total REAL NOT NULL DEFAULT 0,
  advance_recovery REAL NOT NULL DEFAULT 0,
  net_payable REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  financial_transaction_id TEXT REFERENCES financial_transactions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_lines(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee ON payroll_lines(employee_id);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id TEXT PRIMARY KEY,
  payroll_line_id TEXT NOT NULL REFERENCES payroll_lines(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('addition', 'deduction')),
  category TEXT NOT NULL CHECK (category IN (
    'overtime', 'bonus', 'incentive', 'other_addition',
    'advance_recovery', 'absence_deduction', 'other_deduction'
  )),
  amount REAL NOT NULL CHECK (amount > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Finance categories for HR integration
INSERT OR IGNORE INTO financial_categories (id, code, name, category_type, is_active, is_system, sort_order, created_at, updated_at) VALUES
  ('fin-cat-exp-overtime', 'OVERTIME', 'Overtime', 'expense', 1, 1, 23, datetime('now'), datetime('now')),
  ('fin-cat-exp-bonus', 'BONUS', 'Bonus', 'expense', 1, 1, 24, datetime('now'), datetime('now')),
  ('fin-cat-exp-advance', 'EMP_ADVANCE', 'Employee Advances', 'expense', 1, 1, 25, datetime('now'), datetime('now'));

-- Attendance & payroll rules (configurable)
INSERT OR IGNORE INTO system_settings (key, value, description, updated_at) VALUES
  ('hr.full_day_hours', '8', 'Full day working hours', datetime('now')),
  ('hr.half_day_hours', '4', 'Half day working hours', datetime('now')),
  ('hr.weekly_off_days', '0', 'Weekly off day numbers (0=Sun, comma-separated)', datetime('now')),
  ('hr.salary_calculation_days', '26', 'Days per month for monthly salary calculation', datetime('now')),
  ('hr.half_day_factor', '0.5', 'Pay factor for half day (0-1)', datetime('now')),
  ('hr.leave_paid_factor', '1', 'Pay factor for approved leave', datetime('now')),
  ('hr.overtime_multiplier', '1.5', 'Overtime pay multiplier on hourly/daily rate', datetime('now')),
  ('hr.payroll_approval_required', 'true', 'Require approval before wage payment', datetime('now')),
  ('hr.payroll_approval_threshold', '50000', 'Total payroll amount above which approval is mandatory (INR)', datetime('now')),
  ('hr.absenteeism_alert_percent', '25', 'Alert when daily absenteeism exceeds this percent', datetime('now'));
