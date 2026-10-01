import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const employeeRepo = repos.hrEmployees;
const attendanceRepo = repos.hrAttendance;
const advanceRepo = repos.hrAdvances;
const payrollRepo = repos.hrPayroll;
const settingsRepo = repos.hrSettings;
const auditRepo = repos.auditLogs;
const txnRepo = repos.financeTransactions;
const accountRepo = repos.financeAccounts;

const SALARY_CATEGORY_ID = 'fin-cat-exp-salary';
const ADVANCE_CATEGORY_ID = 'fin-cat-exp-advance';
const OVERTIME_CATEGORY_ID = 'fin-cat-exp-overtime';

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcEligibleDays(agg, rules) {
  return round2(
    agg.present
    + agg.half_day * rules.halfDayFactor
    + agg.leave * rules.leavePaidFactor
    + agg.holiday
    + agg.weekly_off
  );
}

function calcGrossWages(employee, agg, rules) {
  const rate = employee.wageRate;
  if (employee.paymentType === 'monthly_salary') {
    const eligible = calcEligibleDays(agg, rules);
    return round2((rate / rules.salaryCalculationDays) * eligible);
  }
  if (employee.paymentType === 'daily_wage') {
    return round2(rate * (agg.present + agg.half_day * rules.halfDayFactor));
  }
  if (employee.paymentType === 'hourly_wage') {
    return round2(rate * agg.totalHours);
  }
  return 0;
}

function calcOvertimeAmount(employee, agg, rules) {
  if (agg.overtime <= 0) return 0;
  if (employee.paymentType === 'hourly_wage') {
    return round2(employee.wageRate * agg.overtime * rules.overtimeMultiplier);
  }
  if (employee.paymentType === 'daily_wage') {
    const hourly = employee.wageRate / rules.fullDayHours;
    return round2(hourly * agg.overtime * rules.overtimeMultiplier);
  }
  const daily = employee.wageRate / rules.salaryCalculationDays;
  const hourly = daily / rules.fullDayHours;
  return round2(hourly * agg.overtime * rules.overtimeMultiplier);
}

export class HrService {
  // ── Bootstrap ───────────────────────────────────────────
  getBootstrap(actor) {
    authService.checkPermission(actor.permissions, 'hr.employees.view');
    return {
      employees: employeeRepo.countActive(),
      departments: employeeRepo.listDepartments(),
      employmentTypes: ['full_time', 'part_time', 'daily_worker', 'contract_worker'],
      paymentTypes: ['monthly_salary', 'daily_wage', 'hourly_wage'],
      attendanceStatuses: ['present', 'absent', 'half_day', 'leave', 'holiday', 'weekly_off', 'late', 'short_hours', 'overtime'],
      payrollStatuses: ['draft', 'attendance_verified', 'calculated', 'submitted', 'pending_approval', 'approved', 'payment_processing', 'paid', 'cancelled', 'rejected'],
      paymentModes: ['cash', 'upi', 'bank', 'cheque', 'other'],
      rules: settingsRepo.getRules(),
      accounts: accountRepo.findAll(),
    };
  }

  // ── Employees ─────────────────────────────────────────
  listEmployees(query, actor) {
    authService.checkPermission(actor.permissions, 'hr.employees.view');
    return employeeRepo.findAll(query);
  }

  getEmployee(id, actor) {
    authService.checkPermission(actor.permissions, 'hr.employees.view');
    const emp = employeeRepo.findById(id);
    if (!emp) throw new AppError('Employee not found', 404);
    return emp;
  }

  createEmployee(data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.employees.create');
    if (!data.fullName) throw new AppError('Full name is required', 400);
    const code = data.employeeCode || employeeRepo.nextCode();
    if (employeeRepo.codeExists(code)) throw new AppError('Employee code already exists', 409);
    const emp = employeeRepo.create({ ...data, employeeCode: code });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'hr', recordType: 'employee', recordId: emp.id,
      newValue: emp, ...getRequestMeta(req),
    });
    return emp;
  }

  updateEmployee(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.employees.edit');
    const existing = this.getEmployee(id, actor);
    const updated = employeeRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'hr', recordType: 'employee', recordId: id,
      previousValue: existing, newValue: updated, ...getRequestMeta(req),
    });
    return updated;
  }

  // ── Attendance ──────────────────────────────────────────
  listAttendance(query, actor) {
    authService.checkPermission(actor.permissions, 'hr.attendance.view');
    return attendanceRepo.findAll(query);
  }

  getDailySheet(date, query, actor) {
    authService.checkPermission(actor.permissions, 'hr.attendance.view');
    const employees = employeeRepo.findAll({
      department: query.department,
      firmId: query.firmId,
      branchId: query.branchId,
    });
    const records = attendanceRepo.findAll({ date });
    const byEmployee = Object.fromEntries(records.map((r) => [r.employeeId, r]));
    return {
      date,
      summary: attendanceRepo.dailySummary(date),
      rows: employees.map((e) => ({
        employee: e,
        attendance: byEmployee[e.id] || null,
      })),
    };
  }

  markAttendance(data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.attendance.create');
    if (!data.employeeId || !data.attendanceDate || !data.status) {
      throw new AppError('Employee, date and status are required', 400);
    }
    const existing = attendanceRepo.findByEmployeeDate(data.employeeId, data.attendanceDate);
    const record = attendanceRepo.upsert(data, actor.user.id);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: existing ? 'update' : 'create',
      module: 'hr', recordType: 'attendance', recordId: record.id,
      previousValue: existing || undefined, newValue: record, ...getRequestMeta(req),
    });
    return record;
  }

  bulkAttendance(data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.attendance.create');
    if (!data.date || !Array.isArray(data.entries) || !data.entries.length) {
      throw new AppError('Date and entries array required', 400);
    }
    const entries = data.entries.map((e) => ({
      ...e,
      attendanceDate: data.date,
    }));
    const results = attendanceRepo.bulkUpsert(entries, actor.user.id);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'bulk_create', module: 'hr', recordType: 'attendance',
      recordId: data.date, newValue: { count: results.length, date: data.date },
      ...getRequestMeta(req),
    });
    return { saved: results.length, records: results };
  }

  // ── Advances ────────────────────────────────────────────
  listAdvances(query, actor) {
    authService.checkPermission(actor.permissions, 'hr.wages.view');
    return advanceRepo.findAll(query);
  }

  createAdvance(data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    if (!data.employeeId || !data.amount || !data.paymentMode) {
      throw new AppError('Employee, amount and payment mode required', 400);
    }
    const adv = advanceRepo.create({
      ...data,
      advanceDate: data.advanceDate || nowIso().slice(0, 10),
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'hr', recordType: 'employee_advance', recordId: adv.id,
      newValue: adv, ...getRequestMeta(req),
    });
    return adv;
  }

  approveAdvance(id, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.approve');
    const adv = advanceRepo.findById(id);
    if (!adv) throw new AppError('Advance not found', 404);
    if (adv.status !== 'draft') throw new AppError('Only draft advances can be approved', 400);
    const now = nowIso();
    const updated = advanceRepo.updateStatus(id, {
      status: 'approved',
      approvedBy: actor.user.id,
      approvedAt: now,
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'approve', module: 'hr', recordType: 'employee_advance', recordId: id,
      previousValue: { status: adv.status }, newValue: { status: 'approved' },
      ...getRequestMeta(req),
    });
    return updated;
  }

  payAdvance(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    const adv = advanceRepo.findById(id);
    if (!adv) throw new AppError('Advance not found', 404);
    if (adv.status !== 'approved') throw new AppError('Advance must be approved before payment', 400);
    if (adv.financialTransactionId) throw new AppError('Advance already paid', 400);

    const paymentAccountId = data.paymentAccountId || accountRepo.findAll().find((a) => a.accountType === adv.paymentMode)?.id;
    if (!paymentAccountId) throw new AppError('Payment account required', 400);

    const employee = employeeRepo.findById(adv.employeeId);
    const txn = txnRepo.create({
      transactionDate: nowIso().slice(0, 10),
      transactionType: 'expense',
      categoryId: ADVANCE_CATEGORY_ID,
      amount: adv.amount,
      paymentAccountId,
      paymentMode: adv.paymentMode,
      referenceNumber: adv.advanceNumber,
      description: `Employee advance — ${employee?.fullName || adv.employeeId}`,
      source: 'manual_expense',
      status: 'posted',
      createdBy: actor.user.id,
      notes: `HR advance ${adv.advanceNumber}. Not counted as salary expense.`,
    });
    txnRepo.updateStatus(txn.id, {
      status: 'posted',
      postedAt: nowIso(),
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
    });

    const updated = advanceRepo.updateStatus(id, {
      status: 'paid',
      paidAt: nowIso(),
      financialTransactionId: txn.id,
    });

    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'pay', module: 'hr', recordType: 'employee_advance', recordId: id,
      newValue: { status: 'paid', financialTransactionId: txn.id },
      ...getRequestMeta(req),
    });
    return { advance: updated, financialTransaction: txnRepo.findById(txn.id) };
  }

  // ── Payroll ─────────────────────────────────────────────
  listPayrollRuns(query, actor) {
    authService.checkPermission(actor.permissions, 'hr.wages.view');
    return payrollRepo.findAllRuns(query);
  }

  getPayrollRun(id, actor) {
    authService.checkPermission(actor.permissions, 'hr.wages.view');
    const run = payrollRepo.findRunById(id);
    if (!run) throw new AppError('Payroll run not found', 404);
    const lines = payrollRepo.findLinesByRun(id);
    return { ...run, lines };
  }

  createPayrollRun(data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    if (!data.periodFrom || !data.periodTo || !data.periodType) {
      throw new AppError('Period type, from and to dates required', 400);
    }
    const run = payrollRepo.createRun({ ...data, createdBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'hr', recordType: 'payroll_run', recordId: run.id,
      newValue: run, ...getRequestMeta(req),
    });
    return run;
  }

  calculatePayroll(runId, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    const run = payrollRepo.findRunById(runId);
    if (!run) throw new AppError('Payroll run not found', 404);
    if (!['draft', 'attendance_verified', 'calculated'].includes(run.status)) {
      throw new AppError('Payroll cannot be recalculated in current status', 400);
    }

    const rules = settingsRepo.getRules();
    payrollRepo.deleteLinesForRun(runId);

    const employees = employeeRepo.findAll({
      department: run.department || undefined,
      firmId: run.firmId || undefined,
      branchId: run.branchId || undefined,
    });

    const lines = [];
    for (const emp of employees) {
      if (payrollRepo.hasOverlappingRun(emp.id, run.periodFrom, run.periodTo, runId)) {
        continue;
      }
      const agg = attendanceRepo.aggregateForEmployee(emp.id, run.periodFrom, run.periodTo);
      const overtimeAmount = calcOvertimeAmount(emp, agg, rules);
      const grossWages = round2(calcGrossWages(emp, agg, rules) + overtimeAmount);
      const outstanding = advanceRepo.outstandingForEmployee(emp.id);
      const advanceRecovery = round2(Math.min(outstanding, grossWages));
      const netPayable = round2(Math.max(0, grossWages - advanceRecovery));

      const line = payrollRepo.upsertLine({
        payrollRunId: runId,
        employeeId: emp.id,
        paymentType: emp.paymentType,
        baseRate: emp.wageRate,
        presentDays: agg.present,
        halfDays: agg.half_day,
        absentDays: agg.absent,
        leaveDays: agg.leave,
        holidayDays: agg.holiday,
        weeklyOffDays: agg.weekly_off,
        overtimeHours: agg.overtime,
        overtimeAmount,
        grossWages,
        additionsTotal: 0,
        deductionsTotal: advanceRecovery,
        advanceRecovery,
        netPayable,
      });
      lines.push(line);
    }

    const updated = payrollRepo.updateRunStatus(runId, { status: 'calculated' });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'calculate', module: 'hr', recordType: 'payroll_run', recordId: runId,
      newValue: { lineCount: lines.length, status: 'calculated' },
      ...getRequestMeta(req),
    });
    return { ...updated, lines };
  }

  submitPayroll(runId, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    const run = payrollRepo.findRunById(runId);
    if (!run) throw new AppError('Payroll run not found', 404);
    if (run.status !== 'calculated') throw new AppError('Payroll must be calculated before submit', 400);

    const rules = settingsRepo.getRules();
    const totalNet = payrollRepo.findLinesByRun(runId).reduce((s, l) => s + l.netPayable, 0);
    let nextStatus = 'submitted';
    if (rules.payrollApprovalRequired && totalNet >= rules.payrollApprovalThreshold) {
      nextStatus = 'pending_approval';
    } else if (!rules.payrollApprovalRequired) {
      nextStatus = 'approved';
    } else if (actor.permissions.includes('hr.wages.approve') || actor.permissions.includes('*')) {
      nextStatus = 'approved';
    } else {
      nextStatus = 'pending_approval';
    }

    const now = nowIso();
    const patch = {
      status: nextStatus,
      submittedAt: now,
      ...(nextStatus === 'approved' ? { approvedBy: actor.user.id, approvedAt: now } : {}),
    };
    const updated = payrollRepo.updateRunStatus(runId, patch);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'submit', module: 'hr', recordType: 'payroll_run', recordId: runId,
      newValue: { status: nextStatus }, ...getRequestMeta(req),
    });
    return updated;
  }

  approvePayroll(runId, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.approve');
    const run = payrollRepo.findRunById(runId);
    if (!run) throw new AppError('Payroll run not found', 404);
    if (!['submitted', 'pending_approval'].includes(run.status)) {
      throw new AppError('Payroll is not pending approval', 400);
    }
    const now = nowIso();
    const updated = payrollRepo.updateRunStatus(runId, {
      status: 'approved',
      approvedBy: actor.user.id,
      approvedAt: now,
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'approve', module: 'hr', recordType: 'payroll_run', recordId: runId,
      newValue: { status: 'approved' }, ...getRequestMeta(req),
    });
    return updated;
  }

  rejectPayroll(runId, { reason } = {}, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.approve');
    const run = payrollRepo.findRunById(runId);
    if (!run) throw new AppError('Payroll run not found', 404);
    const updated = payrollRepo.updateRunStatus(runId, {
      status: 'rejected',
      rejectionReason: reason || 'Rejected',
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'reject', module: 'hr', recordType: 'payroll_run', recordId: runId,
      newValue: { status: 'rejected', reason }, ...getRequestMeta(req),
    });
    return updated;
  }

  payPayrollLine(lineId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.create');
    const line = payrollRepo.findLineById(lineId);
    if (!line) throw new AppError('Payroll line not found', 404);
    const run = payrollRepo.findRunById(line.payrollRunId);
    if (!['approved', 'payment_processing', 'paid'].includes(run.status)) {
      throw new AppError('Payroll must be approved before payment', 400);
    }
    if (line.paymentStatus === 'paid') throw new AppError('Line already fully paid', 400);
    if (line.financialTransactionId) throw new AppError('Payment already recorded', 400);

    const amount = data.amount != null ? round2(data.amount) : line.netPayable;
    if (amount <= 0) throw new AppError('Payment amount must be positive', 400);
    if (amount > line.netPayable + 0.01) throw new AppError('Payment exceeds net payable', 400);

    const paymentMode = data.paymentMode || 'cash';
    const paymentAccountId = data.paymentAccountId || accountRepo.findAll().find((a) => a.accountType === paymentMode)?.id;
    if (!paymentAccountId) throw new AppError('Payment account required', 400);

    const employee = employeeRepo.findById(line.employeeId);
    const categoryId = line.overtimeAmount > 0 && amount === line.overtimeAmount
      ? OVERTIME_CATEGORY_ID
      : SALARY_CATEGORY_ID;

    const txn = txnRepo.create({
      transactionDate: data.paymentDate || nowIso().slice(0, 10),
      transactionType: 'expense',
      categoryId,
      amount,
      paymentAccountId,
      paymentMode,
      referenceNumber: `${run.runNumber}-${line.employeeCode}`,
      description: `Wage payment — ${employee?.fullName} (${run.periodFrom} to ${run.periodTo})`,
      source: 'manual_expense',
      status: 'posted',
      createdBy: actor.user.id,
      notes: `Payroll line ${lineId}`,
    });
    txnRepo.updateStatus(txn.id, {
      status: 'posted',
      postedAt: nowIso(),
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
    });

    if (line.advanceRecovery > 0) {
      const advances = advanceRepo.listOutstanding(line.employeeId);
      let remaining = line.advanceRecovery;
      for (const adv of advances) {
        if (remaining <= 0) break;
        const recover = round2(Math.min(remaining, adv.balanceRemaining));
        advanceRepo.applyRecovery(adv.id, lineId, recover);
        remaining = round2(remaining - recover);
      }
    }

    const amountPaid = round2(line.amountPaid + amount);
    const paymentStatus = amountPaid >= line.netPayable - 0.01 ? 'paid' : 'partially_paid';
    const updatedLine = payrollRepo.updateLinePayment(lineId, {
      amountPaid,
      paymentStatus,
      financialTransactionId: txn.id,
    });

    const allLines = payrollRepo.findLinesByRun(run.id);
    const allPaid = allLines.every((l) => l.paymentStatus === 'paid');
    if (allPaid) {
      payrollRepo.updateRunStatus(run.id, { status: 'paid', paidAt: nowIso() });
    } else {
      payrollRepo.updateRunStatus(run.id, { status: 'payment_processing' });
    }

    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'pay', module: 'hr', recordType: 'payroll_line', recordId: lineId,
      newValue: { amount, financialTransactionId: txn.id, paymentStatus },
      ...getRequestMeta(req),
    });
    return { line: updatedLine, financialTransaction: txnRepo.findById(txn.id) };
  }

  addAdjustment(lineId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'hr.wages.edit');
    const line = payrollRepo.findLineById(lineId);
    if (!line) throw new AppError('Payroll line not found', 404);
    const adj = payrollRepo.createAdjustment({
      ...data,
      payrollLineId: lineId,
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'hr', recordType: 'payroll_adjustment', recordId: adj.id,
      newValue: adj, ...getRequestMeta(req),
    });
    return adj;
  }

  // ── Reports ─────────────────────────────────────────────
  getReports(query, actor) {
    authService.checkPermission(actor.permissions, 'hr.attendance.view');
    const dateFrom = query.dateFrom || new Date().toISOString().slice(0, 10);
    const dateTo = query.dateTo || dateFrom;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;

    return {
      period: { dateFrom, dateTo },
      employees: { total: employeeRepo.countActive(), departments: employeeRepo.listDepartments() },
      attendanceToday: attendanceRepo.dailySummary(today),
      attendanceTrend: attendanceRepo.trend(dateFrom, dateTo),
      advances: {
        outstanding: advanceRepo.outstandingTotal(),
        list: advanceRepo.findAll({ status: 'paid' }).filter((a) => a.balanceRemaining > 0),
      },
      payroll: {
        pendingPayments: payrollRepo.pendingWagePayments(),
        monthlyWageCost: payrollRepo.monthlyWageCost(monthStart, today),
        overtimeCost: payrollRepo.overtimeCost(monthStart, today),
        labourByDepartment: payrollRepo.labourCostByDepartment(dateFrom, dateTo),
        wageCostTrend: payrollRepo.wageCostTrend(dateFrom, dateTo),
      },
      rules: settingsRepo.getRules(),
    };
  }

  getCeoMetrics(dateFrom, dateTo) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const rules = settingsRepo.getRules();
    const attendanceToday = attendanceRepo.dailySummary(today);
    return {
      totalEmployees: employeeRepo.countActive(),
      presentToday: attendanceToday.present + attendanceToday.half_day,
      absentToday: attendanceToday.absent,
      attendancePercent: attendanceToday.attendancePercent,
      monthlyWageCost: payrollRepo.monthlyWageCost(monthStart, today),
      pendingWagePayments: payrollRepo.pendingWagePayments(),
      advancesOutstanding: advanceRepo.outstandingTotal(),
      overtimeCost: payrollRepo.overtimeCost(dateFrom?.slice(0, 10) || monthStart, dateTo?.slice(0, 10) || today),
      attendanceTrend: attendanceRepo.trend(
        dateFrom?.slice(0, 10) || addDays(today, -30),
        dateTo?.slice(0, 10) || today
      ),
      labourByDepartment: payrollRepo.labourCostByDepartment(
        dateFrom?.slice(0, 10) || monthStart,
        dateTo?.slice(0, 10) || today
      ),
      wageCostTrend: payrollRepo.wageCostTrend(
        dateFrom?.slice(0, 10) || monthStart,
        dateTo?.slice(0, 10) || today
      ),
      rules,
    };
  }
}

export const hrService = new HrService();
