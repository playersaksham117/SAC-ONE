import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function num(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function mapEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    department: row.department,
    designation: row.designation,
    firmId: row.firm_id,
    branchId: row.branch_id,
    joiningDate: row.joining_date,
    employmentStatus: row.employment_status,
    employmentType: row.employment_type,
    paymentType: row.payment_type,
    wageRate: num(row.wage_rate),
    paymentDetails: row.payment_details,
    emergencyContact: row.emergency_contact,
    notes: row.notes,
    userId: row.user_id,
    userName: row.user_name || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendance(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    department: row.department || null,
    attendanceDate: row.attendance_date,
    status: row.status,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    workingHours: row.working_hours != null ? num(row.working_hours) : null,
    notes: row.notes,
    markedBy: row.marked_by,
    markedByName: row.marked_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdvance(row) {
  if (!row) return null;
  return {
    id: row.id,
    advanceNumber: row.advance_number,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    advanceDate: row.advance_date,
    amount: num(row.amount),
    paymentMode: row.payment_mode,
    paymentAccountId: row.payment_account_id,
    referenceNumber: row.reference_number,
    reason: row.reason,
    status: row.status,
    amountRecovered: num(row.amount_recovered),
    balanceRemaining: num(row.balance_remaining),
    financialTransactionId: row.financial_transaction_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayrollRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    runNumber: row.run_number,
    periodType: row.period_type,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    firmId: row.firm_id,
    branchId: row.branch_id,
    department: row.department,
    status: row.status,
    notes: row.notes,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name || null,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    lineCount: row.line_count != null ? num(row.line_count) : undefined,
    totalNetPayable: row.total_net != null ? num(row.total_net) : undefined,
    totalPaid: row.total_paid != null ? num(row.total_paid) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayrollLine(row) {
  if (!row) return null;
  return {
    id: row.id,
    payrollRunId: row.payroll_run_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    department: row.department || null,
    paymentType: row.payment_type,
    baseRate: num(row.base_rate),
    presentDays: num(row.present_days),
    halfDays: num(row.half_days),
    absentDays: num(row.absent_days),
    leaveDays: num(row.leave_days),
    holidayDays: num(row.holiday_days),
    weeklyOffDays: num(row.weekly_off_days),
    overtimeHours: num(row.overtime_hours),
    overtimeAmount: num(row.overtime_amount),
    grossWages: num(row.gross_wages),
    additionsTotal: num(row.additions_total),
    deductionsTotal: num(row.deductions_total),
    advanceRecovery: num(row.advance_recovery),
    netPayable: num(row.net_payable),
    amountPaid: num(row.amount_paid),
    paymentStatus: row.payment_status,
    financialTransactionId: row.financial_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EmployeeRepository {
  nextCode() {
    const row = getDatabase().prepare(`
      SELECT employee_code FROM employees WHERE employee_code LIKE 'EMP-%'
      ORDER BY employee_code DESC LIMIT 1
    `).get();
    let seq = 1;
    if (row?.employee_code) {
      const m = row.employee_code.match(/EMP-(\d+)/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `EMP-${String(seq).padStart(4, '0')}`;
  }

  _select() {
    return `
      SELECT e.*, u.full_name as user_name
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
    `;
  }

  findById(id) {
    return mapEmployee(getDatabase().prepare(`${this._select()} WHERE e.id = ?`).get(id));
  }

  findAll(filters = {}) {
    const wh = ['1=1'];
    const p = [];
    if (!filters.includeInactive) {
      wh.push('AND e.is_active = 1');
    }
    if (filters.department) {
      wh.push('AND e.department = ?');
      p.push(filters.department);
    }
    if (filters.firmId) {
      wh.push('AND e.firm_id = ?');
      p.push(filters.firmId);
    }
    if (filters.branchId) {
      wh.push('AND e.branch_id = ?');
      p.push(filters.branchId);
    }
    if (filters.search) {
      wh.push(`AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.phone LIKE ?)`);
      const q = `%${filters.search}%`;
      p.push(q, q, q);
    }
    const limit = Math.min(parseInt(filters.limit || '200', 10) || 200, 500);
    const rows = getDatabase().prepare(`
      ${this._select()}
      WHERE ${wh.join(' ')}
      ORDER BY e.full_name ASC
      LIMIT ?
    `).all(...p, limit);
    return rows.map(mapEmployee);
  }

  codeExists(code, excludeId = null) {
    const row = excludeId
      ? getDatabase().prepare('SELECT id FROM employees WHERE employee_code = ? AND id != ?').get(code, excludeId)
      : getDatabase().prepare('SELECT id FROM employees WHERE employee_code = ?').get(code);
    return Boolean(row);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO employees (
        id, employee_code, full_name, phone, email, department, designation,
        firm_id, branch_id, joining_date, employment_status, employment_type,
        payment_type, wage_rate, payment_details, emergency_contact, notes,
        user_id, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.employeeCode,
      data.fullName,
      data.phone || null,
      data.email || null,
      data.department || null,
      data.designation || null,
      data.firmId || null,
      data.branchId || null,
      data.joiningDate || null,
      data.employmentStatus || 'active',
      data.employmentType || 'full_time',
      data.paymentType || 'monthly_salary',
      num(data.wageRate),
      data.paymentDetails || null,
      data.emergencyContact || null,
      data.notes || null,
      data.userId || null,
      data.isActive !== false ? 1 : 0,
      now,
      now
    );
    return this.findById(id);
  }

  update(id, data) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE employees SET
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        department = COALESCE(?, department),
        designation = COALESCE(?, designation),
        firm_id = COALESCE(?, firm_id),
        branch_id = COALESCE(?, branch_id),
        joining_date = COALESCE(?, joining_date),
        employment_status = COALESCE(?, employment_status),
        employment_type = COALESCE(?, employment_type),
        payment_type = COALESCE(?, payment_type),
        wage_rate = COALESCE(?, wage_rate),
        payment_details = COALESCE(?, payment_details),
        emergency_contact = COALESCE(?, emergency_contact),
        notes = COALESCE(?, notes),
        user_id = COALESCE(?, user_id),
        is_active = COALESCE(?, is_active),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.fullName ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.department ?? null,
      data.designation ?? null,
      data.firmId ?? null,
      data.branchId ?? null,
      data.joiningDate ?? null,
      data.employmentStatus ?? null,
      data.employmentType ?? null,
      data.paymentType ?? null,
      data.wageRate !== undefined ? num(data.wageRate) : null,
      data.paymentDetails ?? null,
      data.emergencyContact ?? null,
      data.notes ?? null,
      data.userId ?? null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : null,
      now,
      id
    );
    return this.findById(id);
  }

  countActive() {
    return getDatabase().prepare('SELECT COUNT(*) as c FROM employees WHERE is_active = 1').get()?.c || 0;
  }

  listDepartments() {
    return getDatabase().prepare(`
      SELECT DISTINCT department as name FROM employees
      WHERE department IS NOT NULL AND department != '' AND is_active = 1
      ORDER BY department
    `).all().map((r) => r.name);
  }
}

export class AttendanceRepository {
  _select() {
    return `
      SELECT a.*, e.full_name as employee_name, e.employee_code, e.department,
             u.full_name as marked_by_name
      FROM attendance_records a
      INNER JOIN employees e ON e.id = a.employee_id
      LEFT JOIN users u ON u.id = a.marked_by
    `;
  }

  findById(id) {
    return mapAttendance(getDatabase().prepare(`${this._select()} WHERE a.id = ?`).get(id));
  }

  findByEmployeeDate(employeeId, date) {
    return mapAttendance(getDatabase().prepare(`
      ${this._select()} WHERE a.employee_id = ? AND a.attendance_date = ?
    `).get(employeeId, date));
  }

  findAll(filters = {}) {
    const wh = ['1=1'];
    const p = [];
    if (filters.employeeId) {
      wh.push('AND a.employee_id = ?');
      p.push(filters.employeeId);
    }
    if (filters.date) {
      wh.push('AND a.attendance_date = ?');
      p.push(filters.date);
    }
    if (filters.dateFrom) {
      wh.push('AND a.attendance_date >= ?');
      p.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      wh.push('AND a.attendance_date <= ?');
      p.push(filters.dateTo);
    }
    if (filters.department) {
      wh.push('AND e.department = ?');
      p.push(filters.department);
    }
    if (filters.status) {
      wh.push('AND a.status = ?');
      p.push(filters.status);
    }
    const rows = getDatabase().prepare(`
      ${this._select()}
      WHERE ${wh.join(' ')}
      ORDER BY a.attendance_date DESC, e.full_name ASC
      LIMIT 500
    `).all(...p);
    return rows.map(mapAttendance);
  }

  upsert(data, markedBy) {
    const existing = this.findByEmployeeDate(data.employeeId, data.attendanceDate);
    const now = nowIso();
    let workingHours = data.workingHours;
    if (workingHours == null && data.checkInTime && data.checkOutTime) {
      workingHours = this.calcHours(data.checkInTime, data.checkOutTime);
    }
    if (existing) {
      getDatabase().prepare(`
        UPDATE attendance_records SET
          status = ?, check_in_time = ?, check_out_time = ?, working_hours = ?,
          notes = ?, marked_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.status,
        data.checkInTime || null,
        data.checkOutTime || null,
        workingHours != null ? num(workingHours) : null,
        data.notes || null,
        markedBy || null,
        now,
        existing.id
      );
      return this.findById(existing.id);
    }
    const id = generateId();
    getDatabase().prepare(`
      INSERT INTO attendance_records (
        id, employee_id, attendance_date, status, check_in_time, check_out_time,
        working_hours, notes, marked_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.employeeId,
      data.attendanceDate,
      data.status,
      data.checkInTime || null,
      data.checkOutTime || null,
      workingHours != null ? num(workingHours) : null,
      data.notes || null,
      markedBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  bulkUpsert(entries, markedBy) {
    const results = [];
    const run = getDatabase().transaction((items) => {
      for (const entry of items) {
        results.push(this.upsert(entry, markedBy));
      }
    });
    run(entries);
    return results;
  }

  calcHours(checkIn, checkOut) {
    const [ih, im] = String(checkIn).split(':').map(Number);
    const [oh, om] = String(checkOut).split(':').map(Number);
    const mins = (oh * 60 + om) - (ih * 60 + im);
    return mins > 0 ? round2(mins / 60) : 0;
  }

  dailySummary(date) {
    const rows = getDatabase().prepare(`
      SELECT status, COUNT(*) as count
      FROM attendance_records
      WHERE attendance_date = ?
      GROUP BY status
    `).all(date);
    const totalEmployees = getDatabase().prepare('SELECT COUNT(*) as c FROM employees WHERE is_active = 1').get()?.c || 0;
    const summary = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, weekly_off: 0, other: 0, totalMarked: 0 };
    for (const r of rows) {
      if (summary[r.status] !== undefined) summary[r.status] = num(r.count);
      else summary.other += num(r.count);
      summary.totalMarked += num(r.count);
    }
    const presentLike = summary.present + summary.half_day * 0.5;
    return {
      date,
      totalEmployees,
      ...summary,
      attendancePercent: totalEmployees ? round2((summary.present + summary.half_day) / totalEmployees * 100) : 0,
    };
  }

  trend(dateFrom, dateTo) {
    return getDatabase().prepare(`
      SELECT attendance_date as day,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) as half_day
      FROM attendance_records
      WHERE attendance_date >= ? AND attendance_date <= ?
      GROUP BY attendance_date
      ORDER BY attendance_date
    `).all(dateFrom, dateTo).map((r) => ({
      day: r.day,
      present: num(r.present),
      absent: num(r.absent),
      halfDay: num(r.half_day),
    }));
  }

  aggregateForEmployee(employeeId, dateFrom, dateTo) {
    const rows = getDatabase().prepare(`
      SELECT status, COUNT(*) as count,
        COALESCE(SUM(working_hours), 0) as total_hours
      FROM attendance_records
      WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ?
      GROUP BY status
    `).all(employeeId, dateFrom, dateTo);
    const agg = {
      present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, weekly_off: 0,
      overtime: 0, late: 0, short_hours: 0, totalHours: 0,
    };
    for (const r of rows) {
      if (agg[r.status] !== undefined) agg[r.status] = num(r.count);
      agg.totalHours += num(r.total_hours);
    }
    return agg;
  }
}

export class EmployeeAdvanceRepository {
  nextNumber() {
    const row = getDatabase().prepare(`
      SELECT advance_number FROM employee_advances WHERE advance_number LIKE 'ADV-%'
      ORDER BY advance_number DESC LIMIT 1
    `).get();
    let seq = 1;
    if (row?.advance_number) {
      const m = row.advance_number.match(/ADV-(\d+)/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `ADV-${String(seq).padStart(5, '0')}`;
  }

  _select() {
    return `
      SELECT a.*, e.full_name as employee_name, e.employee_code,
             u.full_name as created_by_name
      FROM employee_advances a
      INNER JOIN employees e ON e.id = a.employee_id
      LEFT JOIN users u ON u.id = a.created_by
    `;
  }

  findById(id) {
    return mapAdvance(getDatabase().prepare(`${this._select()} WHERE a.id = ?`).get(id));
  }

  findAll(filters = {}) {
    const wh = ['1=1'];
    const p = [];
    if (filters.employeeId) {
      wh.push('AND a.employee_id = ?');
      p.push(filters.employeeId);
    }
    if (filters.status) {
      wh.push('AND a.status = ?');
      p.push(filters.status);
    }
    return getDatabase().prepare(`
      ${this._select()}
      WHERE ${wh.join(' ')}
      ORDER BY a.advance_date DESC
      LIMIT 200
    `).all(...p).map(mapAdvance);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const amt = num(data.amount);
    getDatabase().prepare(`
      INSERT INTO employee_advances (
        id, advance_number, employee_id, advance_date, amount, payment_mode,
        payment_account_id, reference_number, reason, status, balance_remaining,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(
      id,
      data.advanceNumber || this.nextNumber(),
      data.employeeId,
      data.advanceDate,
      amt,
      data.paymentMode,
      data.paymentAccountId || null,
      data.referenceNumber || null,
      data.reason || null,
      amt,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  updateStatus(id, patch) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE employee_advances SET
        status = COALESCE(?, status),
        approved_by = COALESCE(?, approved_by),
        approved_at = COALESCE(?, approved_at),
        paid_at = COALESCE(?, paid_at),
        financial_transaction_id = COALESCE(?, financial_transaction_id),
        amount_recovered = COALESCE(?, amount_recovered),
        balance_remaining = COALESCE(?, balance_remaining),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? null,
      patch.approvedBy ?? null,
      patch.approvedAt ?? null,
      patch.paidAt ?? null,
      patch.financialTransactionId ?? null,
      patch.amountRecovered ?? null,
      patch.balanceRemaining ?? null,
      now,
      id
    );
    return this.findById(id);
  }

  applyRecovery(advanceId, payrollLineId, amount) {
    const now = nowIso();
    const adv = this.findById(advanceId);
    if (!adv) return null;
    const recovery = num(amount);
    const newRecovered = round2(adv.amountRecovered + recovery);
    const newBalance = round2(adv.amount - newRecovered);
    getDatabase().prepare(`
      INSERT INTO advance_recoveries (id, advance_id, payroll_line_id, amount, recovered_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), advanceId, payrollLineId, recovery, now, now);
    const status = newBalance <= 0.009 ? 'fully_recovered' : adv.status;
    return this.updateStatus(advanceId, {
      amountRecovered: newRecovered,
      balanceRemaining: Math.max(0, newBalance),
      status,
    });
  }

  outstandingTotal() {
    return num(getDatabase().prepare(`
      SELECT COALESCE(SUM(balance_remaining), 0) as total
      FROM employee_advances
      WHERE status IN ('paid', 'approved') AND balance_remaining > 0
    `).get()?.total);
  }

  outstandingForEmployee(employeeId) {
    return num(getDatabase().prepare(`
      SELECT COALESCE(SUM(balance_remaining), 0) as total
      FROM employee_advances
      WHERE employee_id = ? AND status IN ('paid', 'approved') AND balance_remaining > 0
    `).get(employeeId)?.total);
  }

  listOutstanding(employeeId) {
    return getDatabase().prepare(`
      SELECT * FROM employee_advances
      WHERE employee_id = ? AND status IN ('paid', 'approved') AND balance_remaining > 0
      ORDER BY advance_date ASC
    `).all(employeeId).map(mapAdvance);
  }
}

export class PayrollRepository {
  nextRunNumber() {
    const row = getDatabase().prepare(`
      SELECT run_number FROM payroll_runs WHERE run_number LIKE 'PR-%'
      ORDER BY run_number DESC LIMIT 1
    `).get();
    let seq = 1;
    if (row?.run_number) {
      const m = row.run_number.match(/PR-(\d+)/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `PR-${String(seq).padStart(5, '0')}`;
  }

  _runSelect() {
    return `
      SELECT r.*, u.full_name as created_by_name, au.full_name as approved_by_name,
        (SELECT COUNT(*) FROM payroll_lines pl WHERE pl.payroll_run_id = r.id) as line_count,
        (SELECT COALESCE(SUM(net_payable), 0) FROM payroll_lines pl WHERE pl.payroll_run_id = r.id) as total_net,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM payroll_lines pl WHERE pl.payroll_run_id = r.id) as total_paid
      FROM payroll_runs r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN users au ON au.id = r.approved_by
    `;
  }

  _lineSelect() {
    return `
      SELECT pl.*, e.full_name as employee_name, e.employee_code, e.department
      FROM payroll_lines pl
      INNER JOIN employees e ON e.id = pl.employee_id
    `;
  }

  findRunById(id) {
    return mapPayrollRun(getDatabase().prepare(`${this._runSelect()} WHERE r.id = ?`).get(id));
  }

  findAllRuns(filters = {}) {
    const wh = ['1=1'];
    const p = [];
    if (filters.status) {
      wh.push('AND r.status = ?');
      p.push(filters.status);
    }
    return getDatabase().prepare(`
      ${this._runSelect()}
      WHERE ${wh.join(' ')}
      ORDER BY r.period_from DESC
      LIMIT 100
    `).all(...p).map(mapPayrollRun);
  }

  createRun(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO payroll_runs (
        id, run_number, period_type, period_from, period_to, firm_id, branch_id,
        department, status, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(
      id,
      data.runNumber || this.nextRunNumber(),
      data.periodType,
      data.periodFrom,
      data.periodTo,
      data.firmId || null,
      data.branchId || null,
      data.department || null,
      data.notes || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findRunById(id);
  }

  updateRunStatus(id, patch) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE payroll_runs SET
        status = COALESCE(?, status),
        rejection_reason = COALESCE(?, rejection_reason),
        approved_by = COALESCE(?, approved_by),
        submitted_at = COALESCE(?, submitted_at),
        approved_at = COALESCE(?, approved_at),
        paid_at = COALESCE(?, paid_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? null,
      patch.rejectionReason ?? null,
      patch.approvedBy ?? null,
      patch.submittedAt ?? null,
      patch.approvedAt ?? null,
      patch.paidAt ?? null,
      now,
      id
    );
    return this.findRunById(id);
  }

  findLineById(id) {
    return mapPayrollLine(getDatabase().prepare(`${this._lineSelect()} WHERE pl.id = ?`).get(id));
  }

  findLinesByRun(runId) {
    return getDatabase().prepare(`
      ${this._lineSelect()}
      WHERE pl.payroll_run_id = ?
      ORDER BY e.full_name ASC
    `).all(runId).map(mapPayrollLine);
  }

  upsertLine(data) {
    const existing = getDatabase().prepare(`
      SELECT id FROM payroll_lines WHERE payroll_run_id = ? AND employee_id = ?
    `).get(data.payrollRunId, data.employeeId);
    const now = nowIso();
    const fields = {
      paymentType: data.paymentType,
      baseRate: num(data.baseRate),
      presentDays: num(data.presentDays),
      halfDays: num(data.halfDays),
      absentDays: num(data.absentDays),
      leaveDays: num(data.leaveDays),
      holidayDays: num(data.holidayDays),
      weeklyOffDays: num(data.weeklyOffDays),
      overtimeHours: num(data.overtimeHours),
      overtimeAmount: num(data.overtimeAmount),
      grossWages: num(data.grossWages),
      additionsTotal: num(data.additionsTotal),
      deductionsTotal: num(data.deductionsTotal),
      advanceRecovery: num(data.advanceRecovery),
      netPayable: num(data.netPayable),
    };
    if (existing) {
      getDatabase().prepare(`
        UPDATE payroll_lines SET
          payment_type = ?, base_rate = ?, present_days = ?, half_days = ?, absent_days = ?,
          leave_days = ?, holiday_days = ?, weekly_off_days = ?, overtime_hours = ?,
          overtime_amount = ?, gross_wages = ?, additions_total = ?, deductions_total = ?,
          advance_recovery = ?, net_payable = ?, updated_at = ?
        WHERE id = ?
      `).run(
        fields.paymentType, fields.baseRate, fields.presentDays, fields.halfDays, fields.absentDays,
        fields.leaveDays, fields.holidayDays, fields.weeklyOffDays, fields.overtimeHours,
        fields.overtimeAmount, fields.grossWages, fields.additionsTotal, fields.deductionsTotal,
        fields.advanceRecovery, fields.netPayable, now, existing.id
      );
      return this.findLineById(existing.id);
    }
    const id = generateId();
    getDatabase().prepare(`
      INSERT INTO payroll_lines (
        id, payroll_run_id, employee_id, payment_type, base_rate,
        present_days, half_days, absent_days, leave_days, holiday_days, weekly_off_days,
        overtime_hours, overtime_amount, gross_wages, additions_total, deductions_total,
        advance_recovery, net_payable, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.payrollRunId, data.employeeId,
      fields.paymentType, fields.baseRate,
      fields.presentDays, fields.halfDays, fields.absentDays,
      fields.leaveDays, fields.holidayDays, fields.weeklyOffDays,
      fields.overtimeHours, fields.overtimeAmount, fields.grossWages,
      fields.additionsTotal, fields.deductionsTotal,
      fields.advanceRecovery, fields.netPayable, now, now
    );
    return this.findLineById(id);
  }

  deleteLinesForRun(runId) {
    getDatabase().prepare('DELETE FROM payroll_lines WHERE payroll_run_id = ?').run(runId);
  }

  updateLinePayment(id, patch) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE payroll_lines SET
        amount_paid = COALESCE(?, amount_paid),
        payment_status = COALESCE(?, payment_status),
        financial_transaction_id = COALESCE(?, financial_transaction_id),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.amountPaid ?? null,
      patch.paymentStatus ?? null,
      patch.financialTransactionId ?? null,
      now,
      id
    );
    return this.findLineById(id);
  }

  hasOverlappingRun(employeeId, periodFrom, periodTo, excludeRunId = null) {
    const row = getDatabase().prepare(`
      SELECT pl.id FROM payroll_lines pl
      INNER JOIN payroll_runs r ON r.id = pl.payroll_run_id
      WHERE pl.employee_id = ?
        AND r.status NOT IN ('cancelled', 'rejected', 'draft')
        AND r.period_from <= ? AND r.period_to >= ?
        ${excludeRunId ? 'AND r.id != ?' : ''}
      LIMIT 1
    `).get(...(excludeRunId
      ? [employeeId, periodTo, periodFrom, excludeRunId]
      : [employeeId, periodTo, periodFrom]));
    return Boolean(row);
  }

  createAdjustment(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO payroll_adjustments (
        id, payroll_line_id, adjustment_type, category, amount, reason,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id, data.payrollLineId, data.adjustmentType, data.category,
      num(data.amount), data.reason || null, data.createdBy || null, now, now
    );
    return getDatabase().prepare('SELECT * FROM payroll_adjustments WHERE id = ?').get(id);
  }

  listAdjustments(payrollLineId) {
    return getDatabase().prepare(`
      SELECT * FROM payroll_adjustments WHERE payroll_line_id = ? ORDER BY created_at
    `).all(payrollLineId);
  }

  monthlyWageCost(monthStart, monthEnd) {
    return num(getDatabase().prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total
      FROM payroll_lines pl
      INNER JOIN payroll_runs r ON r.id = pl.payroll_run_id
      WHERE r.status IN ('approved', 'payment_processing', 'paid')
        AND r.period_from >= ? AND r.period_to <= ?
        AND pl.payment_status IN ('paid', 'partially_paid')
    `).get(monthStart, monthEnd)?.total);
  }

  pendingWagePayments() {
    return num(getDatabase().prepare(`
      SELECT COALESCE(SUM(net_payable - amount_paid), 0) as total
      FROM payroll_lines pl
      INNER JOIN payroll_runs r ON r.id = pl.payroll_run_id
      WHERE r.status IN ('approved', 'payment_processing')
        AND pl.payment_status != 'paid'
    `).get()?.total);
  }

  labourCostByDepartment(dateFrom, dateTo) {
    return getDatabase().prepare(`
      SELECT e.department, COALESCE(SUM(pl.amount_paid), 0) as total
      FROM payroll_lines pl
      INNER JOIN payroll_runs r ON r.id = pl.payroll_run_id
      INNER JOIN employees e ON e.id = pl.employee_id
      WHERE r.status IN ('approved', 'payment_processing', 'paid')
        AND r.period_from >= ? AND r.period_to <= ?
        AND pl.amount_paid > 0
      GROUP BY e.department
      ORDER BY total DESC
    `).all(dateFrom, dateTo).map((r) => ({
      department: r.department || 'Unassigned',
      total: num(r.total),
    }));
  }

  wageCostTrend(dateFrom, dateTo) {
    return getDatabase().prepare(`
      SELECT r.period_from as period, COALESCE(SUM(pl.amount_paid), 0) as total
      FROM payroll_runs r
      INNER JOIN payroll_lines pl ON pl.payroll_run_id = r.id
      WHERE r.status IN ('approved', 'payment_processing', 'paid')
        AND r.period_from >= ? AND r.period_to <= ?
      GROUP BY r.id
      ORDER BY r.period_from
    `).all(dateFrom, dateTo).map((r) => ({
      period: r.period,
      total: num(r.total),
    }));
  }

  overtimeCost(dateFrom, dateTo) {
    return num(getDatabase().prepare(`
      SELECT COALESCE(SUM(pl.overtime_amount), 0) as total
      FROM payroll_lines pl
      INNER JOIN payroll_runs r ON r.id = pl.payroll_run_id
      WHERE r.status IN ('approved', 'payment_processing', 'paid')
        AND r.period_from >= ? AND r.period_to <= ?
    `).get(dateFrom, dateTo)?.total);
  }
}

export class HrSettingsRepository {
  getRules() {
    const db = getDatabase();
    const get = (key, fallback) => {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      return row?.value ?? fallback;
    };
    return {
      fullDayHours: num(get('hr.full_day_hours', '8')),
      halfDayHours: num(get('hr.half_day_hours', '4')),
      weeklyOffDays: String(get('hr.weekly_off_days', '0')).split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => !Number.isNaN(n)),
      salaryCalculationDays: num(get('hr.salary_calculation_days', '26')),
      halfDayFactor: num(get('hr.half_day_factor', '0.5')),
      leavePaidFactor: num(get('hr.leave_paid_factor', '1')),
      overtimeMultiplier: num(get('hr.overtime_multiplier', '1.5')),
      payrollApprovalRequired: ['1', 'true', 'yes', 'on'].includes(String(get('hr.payroll_approval_required', 'true')).toLowerCase()),
      payrollApprovalThreshold: num(get('hr.payroll_approval_threshold', '50000')),
      absenteeismAlertPercent: num(get('hr.absenteeism_alert_percent', '25')),
    };
  }
}
