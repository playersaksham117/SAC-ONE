# HR & Wages Module — Employee Attendance and Payroll

## Overview

Practical employee and wage management for small-to-medium businesses. Employee records are **separate from login users** (optional `user_id` link for future self-service).

Integrates with:
- **Finance** — wage payments and advances create posted `financial_transactions` (no duplicate expense)
- **CEO Dashboard** — labour cost KPIs, attendance metrics, alerts

## Database (Migration 012)

| Table | Purpose |
|-------|---------|
| `employees` | Employee master (not login users) |
| `attendance_records` | One record per employee per date (unique) |
| `employee_advances` | Advance tracking with balance recovery |
| `advance_recoveries` | Payroll deduction audit trail |
| `payroll_runs` | Period payroll batches |
| `payroll_lines` | Per-employee wage calculation |
| `payroll_adjustments` | Manual additions/deductions |

Finance categories added: Overtime, Bonus, Employee Advances.

## Payroll Calculation

### Monthly Salary
```
Gross = (Monthly Rate ÷ Salary Calc Days) × Eligible Days
Eligible = Present + (Half Day × Factor) + Leave × Factor + Holiday + Weekly Off
```

### Daily Wage
```
Gross = Daily Rate × (Present + Half Day × Factor)
```

### Hourly Wage
```
Gross = Hourly Rate × Total Working Hours
```

Overtime uses configurable multiplier. Advance recovery reduces net payable without double-counting expense.

## Advance Flow

```
Advance Given (approved → paid)
    → financial_transaction (Employee Advances category — cash out, NOT salary expense)
    → balance_remaining tracked

Payroll calculated
    → advance_recovery deducted from net payable

Wage payment
    → financial_transaction (Salaries & Wages — net amount only)
    → advance_recoveries reduce balance_remaining
```

## Approval Workflow

```
Payroll: draft → calculated → submitted → pending_approval → approved → payment_processing → paid
Advances: draft → approved → paid
```

Rejected/cancelled payroll does not create financial transactions.

## API Endpoints

Base: `/api/hr`

| Area | Key Routes |
|------|------------|
| Employees | GET/POST `/employees`, PUT `/employees/:id` |
| Attendance | GET `/attendance`, GET `/attendance/sheet?date=`, POST `/attendance`, POST `/attendance/bulk` |
| Advances | GET/POST `/advances`, POST `/advances/:id/approve`, POST `/advances/:id/pay` |
| Payroll | GET/POST `/payroll`, POST `/payroll/:id/calculate`, submit, approve, reject |
| Payment | POST `/payroll/lines/:lineId/pay` |
| Reports | GET `/reports`, GET `/bootstrap` |

## Permissions

| Key | Purpose |
|-----|---------|
| `hr.employees.view/create/edit/delete` | Employee master |
| `hr.attendance.view/create/edit/approve` | Attendance |
| `hr.wages.view/create/edit/approve` | Payroll, advances, payments |

## CEO Dashboard

Metrics: total employees, present/absent today, attendance %, monthly wage cost, pending wages, advances outstanding, overtime cost, department labour cost, trends.

Alerts: high absenteeism, pending wage payments, outstanding advances.

## Configurable Rules (system_settings)

- `hr.full_day_hours`, `hr.half_day_hours`, `hr.weekly_off_days`
- `hr.salary_calculation_days`, `hr.half_day_factor`, `hr.leave_paid_factor`
- `hr.overtime_multiplier`, `hr.payroll_approval_required`, `hr.payroll_approval_threshold`
- `hr.absenteeism_alert_percent`

## Test Scenarios

1. Create employee with monthly salary → mark attendance for period → generate payroll → calculate → approve → pay
2. Daily worker: present days × daily rate
3. Advance: create → approve → pay (finance txn) → payroll deducts recovery → wage pay is net only
4. Duplicate payroll period blocked for same employee
5. Void/reject payroll — no financial impact
6. CEO dashboard shows attendance and wage metrics after payment

## Future-Ready

Schema supports check-in/out times, optional `user_id` on employees, extended attendance statuses (late, overtime). Not implemented: mobile self check-in, QR, biometric, GPS, leave module, employee portal.
