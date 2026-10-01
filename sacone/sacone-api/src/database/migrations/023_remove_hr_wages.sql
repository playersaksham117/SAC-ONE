-- Remove the HR & Wages module: its tables, permissions and approval rules.
UPDATE sales_agents SET employee_id = NULL WHERE employee_id IS NOT NULL;
DELETE FROM approval_rules WHERE module = 'hr';
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE permission_key LIKE 'hr.%');
DELETE FROM permissions WHERE permission_key LIKE 'hr.%';
DELETE FROM features WHERE module_id IN (SELECT id FROM modules WHERE code = 'hr');
DELETE FROM modules WHERE code = 'hr';
DROP TABLE IF EXISTS payroll_adjustments;
DROP TABLE IF EXISTS payroll_lines;
DROP TABLE IF EXISTS payroll_runs;
DROP TABLE IF EXISTS advance_recoveries;
DROP TABLE IF EXISTS employee_advances;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS employees;
DELETE FROM system_settings WHERE key LIKE 'hr.%';
