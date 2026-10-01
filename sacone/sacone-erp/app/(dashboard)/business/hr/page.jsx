'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal, StatusBadge } from '../../../../components/ui';
import {
  StatCard, SectionCard, ModuleTabs, GridCard, StatusPill,
  SkeletonGrid, SkeletonBlock, EmptyPanel, Toolbar,
} from '../../../../components/module-ui';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function moneyFull(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_MAP = {
  draft: 'bg-slate-100 text-slate-700',
  calculated: 'bg-blue-100 text-blue-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-700',
  payment_processing: 'bg-sky-100 text-sky-700',
  paid: 'bg-emerald-200 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
};

const ATTENDANCE_STATUSES = [
  ['present', 'Present', '✓'],
  ['absent', 'Absent', '✗'],
  ['half_day', 'Half Day', '½'],
  ['leave', 'Leave', 'L'],
  ['holiday', 'Holiday', 'H'],
  ['weekly_off', 'Off', 'O'],
];

const EMPTY_EMP = {
  fullName: '', phone: '', email: '', department: '', designation: '',
  joiningDate: '', employmentType: 'full_time', paymentType: 'monthly_salary',
  wageRate: '', paymentDetails: '', emergencyContact: '', notes: '', isActive: true,
};

const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'employees', label: 'Employees' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'advances', label: 'Advances' },
  { id: 'dashboard', label: 'Reports' },
];

export default function HrPage() {
  const { checkPermission } = useAuth();
  const canViewEmp = checkPermission('hr.employees.view');
  const canCreateEmp = checkPermission('hr.employees.create');
  const canEditEmp = checkPermission('hr.employees.edit');
  const canViewAtt = checkPermission('hr.attendance.view');
  const canMarkAtt = checkPermission('hr.attendance.create');
  const canViewWages = checkPermission('hr.wages.view');
  const canCreateWages = checkPermission('hr.wages.create');
  const canApproveWages = checkPermission('hr.wages.approve');

  const [tab, setTab] = useState('attendance');
  const [bootstrap, setBootstrap] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [employees, setEmployees] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceSheet, setAttendanceSheet] = useState(null);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [reports, setReports] = useState(null);

  const [empModal, setEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [editingEmp, setEditingEmp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [payrollModal, setPayrollModal] = useState(false);
  const [payrollForm, setPayrollForm] = useState({ periodType: 'monthly', periodFrom: '', periodTo: '', department: '', notes: '' });
  const [advanceModal, setAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ employeeId: '', amount: '', paymentMode: 'cash', reason: '' });

  const loadedRef = useRef(new Set());

  useEffect(() => {
    apiRequest('/api/hr/bootstrap')
      .then(setBootstrap)
      .catch((e) => setError(e.message))
      .finally(() => setBootLoading(false));
  }, []);

  const loadTab = useCallback(async (t, force = false, silent = false) => {
    if (!force && loadedRef.current.has(t)) return;
    if (!silent) setTabLoading(true);
    setError('');
    try {
      if (t === 'employees' && canViewEmp) {
        setEmployees(await apiRequest('/api/hr/employees'));
      }
      if (t === 'attendance' && canViewAtt) {
        setAttendanceSheet(await apiRequest(`/api/hr/attendance/sheet?date=${attendanceDate}`));
      }
      if (t === 'payroll' && canViewWages) {
        setPayrollRuns(await apiRequest('/api/hr/payroll'));
      }
      if (t === 'advances' && canViewWages) {
        setAdvances(await apiRequest('/api/hr/advances'));
      }
      if (t === 'dashboard') {
        setReports(await apiRequest('/api/hr/reports'));
      }
      loadedRef.current.add(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setTabLoading(false);
    }
  }, [attendanceDate, canViewEmp, canViewAtt, canViewWages]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  // Other tabs reload when opened next; the visible one refreshes now. The attendance
  // sheet is edited in place before saving, so it is never replaced underneath the user.
  useLiveRefresh(() => {
    loadedRef.current.clear();
    if (tab !== 'attendance') loadTab(tab, true, true);
    else loadedRef.current.add('attendance');
  });

  useEffect(() => {
    if (tab === 'attendance' && canViewAtt) {
      loadedRef.current.delete('attendance');
      loadTab('attendance', true);
    }
  }, [attendanceDate, tab, canViewAtt, loadTab]);

  const invalidate = (...keys) => keys.forEach((k) => loadedRef.current.delete(k));

  const saveEmployee = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...empForm, wageRate: Number(empForm.wageRate || 0) };
      if (editingEmp) {
        await apiRequest(`/api/hr/employees/${editingEmp.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setMessage('Employee updated');
      } else {
        await apiRequest('/api/hr/employees', { method: 'POST', body: JSON.stringify(body) });
        setMessage('Employee created');
      }
      setEmpModal(false);
      invalidate('employees', 'attendance', 'dashboard');
      loadTab('employees', true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const bulkSaveAttendance = async () => {
    if (!attendanceSheet?.rows) return;
    setSaving(true);
    try {
      const entries = attendanceSheet.rows.filter((r) => r._status).map((r) => ({
        employeeId: r.employee.id, status: r._status,
        checkInTime: r._checkIn || null, checkOutTime: r._checkOut || null,
      }));
      if (!entries.length) { setError('Mark at least one employee'); return; }
      await apiRequest('/api/hr/attendance/bulk', { method: 'POST', body: JSON.stringify({ date: attendanceDate, entries }) });
      setMessage('Attendance saved');
      invalidate('attendance', 'dashboard');
      loadTab('attendance', true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const createPayroll = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const run = await apiRequest('/api/hr/payroll', { method: 'POST', body: JSON.stringify(payrollForm) });
      setMessage(`Payroll ${run.runNumber} created`);
      setPayrollModal(false);
      invalidate('payroll', 'dashboard');
      await loadTab('payroll', true);
      setSelectedPayroll(run);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const payrollAction = async (id, action, body = {}) => {
    try {
      const result = await apiRequest(`/api/hr/payroll/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setMessage(`Payroll ${action} successful`);
      invalidate('payroll', 'dashboard');
      await loadTab('payroll', true);
      if (selectedPayroll?.id === id) {
        setSelectedPayroll(action === 'calculate' ? result : await apiRequest(`/api/hr/payroll/${id}`));
      }
    } catch (err) { setError(err.message); }
  };

  const payLine = async (lineId, paymentMode = 'upi') => {
    try {
      await apiRequest(`/api/hr/payroll/lines/${lineId}/pay`, { method: 'POST', body: JSON.stringify({ paymentMode }) });
      setMessage('Wage payment recorded');
      invalidate('payroll', 'dashboard');
      if (selectedPayroll) setSelectedPayroll(await apiRequest(`/api/hr/payroll/${selectedPayroll.id}`));
      loadTab('payroll', true);
    } catch (err) { setError(err.message); }
  };

  const saveAdvance = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/hr/advances', {
        method: 'POST',
        body: JSON.stringify({ ...advanceForm, amount: Number(advanceForm.amount), advanceDate: new Date().toISOString().slice(0, 10) }),
      });
      setMessage('Advance created');
      setAdvanceModal(false);
      invalidate('advances', 'dashboard');
      loadTab('advances', true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const advanceAction = async (id, action) => {
    try {
      await apiRequest(`/api/hr/advances/${id}/${action}`, { method: 'POST', body: '{}' });
      setMessage(`Advance ${action} successful`);
      invalidate('advances', 'dashboard');
      loadTab('advances', true);
    } catch (err) { setError(err.message); }
  };

  const updateSheetRow = (idx, field, value) => {
    setAttendanceSheet((prev) => {
      const rows = [...prev.rows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, rows };
    });
  };

  const quickMarkAll = (status) => {
    setAttendanceSheet((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => ({ ...r, _status: status })),
    }));
  };

  if (!canViewEmp) {
    return <RequirePermission permission="hr.employees.view"><div /></RequirePermission>;
  }

  const summary = attendanceSheet?.summary;

  return (
    <RequirePermission permission="hr.employees.view">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="HR & Wages"
          description="Attendance, payroll and wage management for your team."
          actions={(
            <div className="flex flex-wrap gap-2">
              {canCreateEmp && tab === 'employees' && (
                <button type="button" className="btn-primary" onClick={() => { setEditingEmp(null); setEmpForm({ ...EMPTY_EMP }); setEmpModal(true); }}>
                  + Employee
                </button>
              )}
              {canCreateWages && tab === 'payroll' && (
                <button type="button" className="btn-primary" onClick={() => setPayrollModal(true)}>+ Payroll</button>
              )}
              {canCreateWages && tab === 'advances' && (
                <button type="button" className="btn-secondary" onClick={() => setAdvanceModal(true)}>+ Advance</button>
              )}
            </div>
          )}
        />

        {!bootLoading && bootstrap && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Team Size" value={bootstrap.employees ?? '—'} icon="👥" compact />
            <StatCard label="Departments" value={bootstrap.departments?.length ?? 0} icon="🏢" compact />
            <StatCard label="Pay Types" value={bootstrap.paymentTypes?.length ?? 3} hint="Salary · Daily · Hourly" icon="💰" compact />
            <StatCard label="Approval Threshold" value={money(bootstrap.rules?.payrollApprovalThreshold)} hint="Payroll above needs approval" tone="info" icon="✓" compact />
          </div>
        )}

        <ModuleTabs tabs={TABS} active={tab} onChange={setTab} />

        <Alert type="error" message={error} />
        <Alert type="success" message={message} />
        {message && <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setMessage('')}>Dismiss</button>}

        {bootLoading ? <SkeletonGrid count={4} /> : null}

        {/* ── Reports ── */}
        {tab === 'dashboard' && !bootLoading && (
          tabLoading && !reports ? <SkeletonGrid count={4} /> : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Employees" value={reports?.employees?.total ?? 0} tone="dark" icon="👥" />
                <StatCard label="Present Today" value={reports?.attendanceToday?.present + (reports?.attendanceToday?.half_day || 0) || 0} tone="success" hint={`${reports?.attendanceToday?.attendancePercent ?? 0}% attendance`} icon="✓" />
                <StatCard label="Monthly Wage Cost" value={money(reports?.payroll?.monthlyWageCost)} tone="info" icon="📊" />
                <StatCard label="Advances Due" value={money(reports?.advances?.outstanding)} tone="warning" icon="💸" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Labour by Department" subtitle="Paid wages in period">
                  {(reports?.payroll?.labourByDepartment || []).length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {reports.payroll.labourByDepartment.map((d) => (
                        <div key={d.department} className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">{d.department}</div>
                          <div className="font-semibold tabular-nums">{moneyFull(d.total)}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400">No wage payments in period</p>}
                </SectionCard>
                <SectionCard title="Pending Payments" subtitle="Approved payroll awaiting payout">
                  <StatCard label="Amount Pending" value={moneyFull(reports?.payroll?.pendingPayments)} tone="warning" compact />
                </SectionCard>
              </div>
            </div>
          )
        )}

        {/* ── Employees ── */}
        {tab === 'employees' && !bootLoading && (
          tabLoading && !employees.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-36" />)}</div>
          ) : employees.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((e) => (
                <GridCard key={e.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-lg font-bold text-slate-600">
                      {e.fullName.charAt(0).toUpperCase()}
                    </div>
                    <StatusBadge active={e.isActive} />
                  </div>
                  <h4 className="mt-3 font-semibold text-slate-900">{e.fullName}</h4>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{e.employeeCode}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.department && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{e.department}</span>}
                    <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 capitalize">{e.paymentType.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Rate</div>
                      <div className="font-bold tabular-nums text-slate-900">{moneyFull(e.wageRate)}</div>
                    </div>
                    {canEditEmp && (
                      <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50" onClick={() => {
                        setEditingEmp(e);
                        setEmpForm({
                          fullName: e.fullName, phone: e.phone || '', email: e.email || '',
                          department: e.department || '', designation: e.designation || '',
                          joiningDate: e.joiningDate || '', employmentType: e.employmentType,
                          paymentType: e.paymentType, wageRate: String(e.wageRate),
                          paymentDetails: e.paymentDetails || '', emergencyContact: e.emergencyContact || '',
                          notes: e.notes || '', isActive: e.isActive,
                        });
                        setEmpModal(true);
                      }}>Edit</button>
                    )}
                  </div>
                </GridCard>
              ))}
            </div>
          ) : (
            <EmptyPanel title="No employees yet" description="Add your first team member to start tracking attendance and payroll." action={canCreateEmp && <button type="button" className="btn-primary" onClick={() => { setEditingEmp(null); setEmpForm({ ...EMPTY_EMP }); setEmpModal(true); }}>+ Add Employee</button>} />
          )
        )}

        {/* ── Attendance ── */}
        {tab === 'attendance' && canViewAtt && !bootLoading && (
          <div className="space-y-4">
            <Toolbar>
              <input type="date" className="input-field max-w-[160px]" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
              {summary && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{summary.present} present</span>
                  <span className="rounded-lg bg-rose-50 px-2 py-1 font-medium text-rose-700">{summary.absent} absent</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 font-medium text-slate-600">{summary.attendancePercent}% rate</span>
                </div>
              )}
              {canMarkAtt && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => quickMarkAll('present')}>All Present</button>
                  <button type="button" className="btn-primary text-xs" disabled={saving} onClick={bulkSaveAttendance}>Save</button>
                </div>
              )}
            </Toolbar>

            {summary && (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Present" value={summary.present} tone="success" compact />
                <StatCard label="Absent" value={summary.absent} tone="danger" compact />
                <StatCard label="Half Day" value={summary.half_day} tone="warning" compact />
                <StatCard label="Leave" value={summary.leave} tone="info" compact />
                <StatCard label="Holiday" value={summary.holiday} compact />
                <StatCard label="Marked" value={`${summary.totalMarked}/${summary.totalEmployees}`} compact />
              </div>
            )}

            {tabLoading && !attendanceSheet ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-40" />)}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {attendanceSheet?.rows?.map((row, idx) => {
                  const status = row._status || row.attendance?.status || '';
                  return (
                    <GridCard key={row.employee.id} className="!p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                          {row.employee.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{row.employee.fullName}</div>
                          <div className="truncate text-[11px] text-slate-400">{row.employee.department || row.employee.employeeCode}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {ATTENDANCE_STATUSES.map(([v, l, icon]) => (
                          <button
                            key={v}
                            type="button"
                            disabled={!canMarkAtt}
                            onClick={() => updateSheetRow(idx, '_status', v)}
                            className={`rounded-lg py-1.5 text-[10px] font-semibold transition ${
                              status === v
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            } disabled:opacity-60`}
                            title={l}
                          >
                            {icon} {l.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <input type="time" className="input-field !py-1.5 text-xs" placeholder="In"
                          value={row._checkIn || row.attendance?.checkInTime || ''}
                          onChange={(e) => updateSheetRow(idx, '_checkIn', e.target.value)}
                          disabled={!canMarkAtt}
                        />
                        <input type="time" className="input-field !py-1.5 text-xs" placeholder="Out"
                          value={row._checkOut || row.attendance?.checkOutTime || ''}
                          onChange={(e) => updateSheetRow(idx, '_checkOut', e.target.value)}
                          disabled={!canMarkAtt}
                        />
                      </div>
                    </GridCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Payroll ── */}
        {tab === 'payroll' && canViewWages && !bootLoading && (
          <div className="grid gap-4 lg:grid-cols-5">
            <SectionCard title="Payroll Runs" subtitle={`${payrollRuns.length} runs`} className="lg:col-span-2" noPadding>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto p-3 sm:p-4">
                {tabLoading && !payrollRuns.length ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-20" />)
                ) : payrollRuns.length ? payrollRuns.map((r) => (
                  <GridCard key={r.id} selected={selectedPayroll?.id === r.id} onClick={async () => setSelectedPayroll(await apiRequest(`/api/hr/payroll/${r.id}`))} className="!p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold">{r.runNumber}</span>
                      <StatusPill status={r.status} map={STATUS_MAP} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{r.periodFrom} → {r.periodTo}</div>
                    <div className="mt-2 text-lg font-bold tabular-nums">{moneyFull(r.totalNetPayable)}</div>
                  </GridCard>
                )) : <EmptyPanel title="No payroll runs" description="Create a payroll run for a period." />}
              </div>
            </SectionCard>

            <SectionCard
              title={selectedPayroll ? selectedPayroll.runNumber : 'Wage Sheet'}
              subtitle={selectedPayroll ? `${selectedPayroll.periodFrom} → ${selectedPayroll.periodTo}` : 'Select a run'}
              className="lg:col-span-3"
              action={selectedPayroll && (
                <div className="flex flex-wrap gap-2">
                  {canCreateWages && selectedPayroll.status === 'draft' && (
                    <button type="button" className="btn-secondary text-xs" onClick={() => payrollAction(selectedPayroll.id, 'calculate')}>Calculate</button>
                  )}
                  {canCreateWages && selectedPayroll.status === 'calculated' && (
                    <button type="button" className="btn-primary text-xs" onClick={() => payrollAction(selectedPayroll.id, 'submit')}>Submit</button>
                  )}
                  {canApproveWages && selectedPayroll.status === 'pending_approval' && (
                    <>
                      <button type="button" className="btn-primary text-xs" onClick={() => payrollAction(selectedPayroll.id, 'approve')}>Approve</button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => payrollAction(selectedPayroll.id, 'reject', { reason: 'Rejected' })}>Reject</button>
                    </>
                  )}
                </div>
              )}
            >
              {selectedPayroll ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedPayroll.lines?.map((l) => (
                    <GridCard key={l.id} className="!p-3">
                      <div className="font-semibold">{l.employeeName}</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>Present {l.presentDays}</span>
                        <span>Absent {l.absentDays}</span>
                        <span>Gross {money(l.grossWages)}</span>
                        <span>Advance −{money(l.advanceRecovery)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-lg font-bold tabular-nums">{moneyFull(l.netPayable)}</span>
                        <div className="flex items-center gap-2">
                          <StatusPill status={l.paymentStatus} map={{ unpaid: 'bg-amber-100 text-amber-800', partially_paid: 'bg-sky-100 text-sky-700', paid: 'bg-emerald-100 text-emerald-700' }} />
                          {canCreateWages && ['approved', 'payment_processing'].includes(selectedPayroll.status) && l.paymentStatus !== 'paid' && (
                            <button type="button" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700" onClick={() => payLine(l.id, 'upi')}>Pay</button>
                          )}
                        </div>
                      </div>
                    </GridCard>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="Select a payroll run" description="Choose a run from the list to view wage lines and process payments." />
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Advances ── */}
        {tab === 'advances' && canViewWages && !bootLoading && (
          tabLoading && !advances.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}</div>
          ) : advances.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {advances.map((a) => (
                <GridCard key={a.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{a.employeeName}</div>
                      <div className="font-mono text-xs text-slate-400">{a.advanceNumber}</div>
                    </div>
                    <StatusPill status={a.status} map={STATUS_MAP} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Given</div>
                      <div className="font-bold tabular-nums">{moneyFull(a.amount)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Balance</div>
                      <div className="font-bold tabular-nums text-amber-700">{moneyFull(a.balanceRemaining)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                    {canApproveWages && a.status === 'draft' && (
                      <button type="button" className="btn-secondary flex-1 text-xs" onClick={() => advanceAction(a.id, 'approve')}>Approve</button>
                    )}
                    {canCreateWages && a.status === 'approved' && (
                      <button type="button" className="btn-primary flex-1 text-xs" onClick={() => advanceAction(a.id, 'pay')}>Pay Out</button>
                    )}
                  </div>
                </GridCard>
              ))}
            </div>
          ) : (
            <EmptyPanel title="No advances" description="Employee advances appear here once created." action={canCreateWages && <button type="button" className="btn-primary" onClick={() => setAdvanceModal(true)}>+ New Advance</button>} />
          )
        )}

        {/* Modals unchanged structure */}
        <Modal open={empModal} title={editingEmp ? 'Edit Employee' : 'New Employee'} onClose={() => setEmpModal(false)} size="lg"
          footer={<><button type="button" className="btn-secondary" onClick={() => setEmpModal(false)}>Cancel</button><button type="submit" form="emp-form" className="btn-primary" disabled={saving}>Save</button></>}>
          <form id="emp-form" onSubmit={saveEmployee} className="grid gap-3 sm:grid-cols-2">
            <input required className="input-field" placeholder="Full name" value={empForm.fullName} onChange={(e) => setEmpForm((f) => ({ ...f, fullName: e.target.value }))} />
            <input className="input-field" placeholder="Phone" value={empForm.phone} onChange={(e) => setEmpForm((f) => ({ ...f, phone: e.target.value }))} />
            <input className="input-field" placeholder="Department" value={empForm.department} onChange={(e) => setEmpForm((f) => ({ ...f, department: e.target.value }))} />
            <input className="input-field" placeholder="Designation" value={empForm.designation} onChange={(e) => setEmpForm((f) => ({ ...f, designation: e.target.value }))} />
            <select className="input-field" value={empForm.employmentType} onChange={(e) => setEmpForm((f) => ({ ...f, employmentType: e.target.value }))}>
              {bootstrap?.employmentTypes?.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="input-field" value={empForm.paymentType} onChange={(e) => setEmpForm((f) => ({ ...f, paymentType: e.target.value }))}>
              {bootstrap?.paymentTypes?.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <input required type="number" step="0.01" className="input-field" placeholder="Wage/Salary rate" value={empForm.wageRate} onChange={(e) => setEmpForm((f) => ({ ...f, wageRate: e.target.value }))} />
            <input type="date" className="input-field" value={empForm.joiningDate} onChange={(e) => setEmpForm((f) => ({ ...f, joiningDate: e.target.value }))} />
            <input className="input-field sm:col-span-2" placeholder="Bank/UPI details" value={empForm.paymentDetails} onChange={(e) => setEmpForm((f) => ({ ...f, paymentDetails: e.target.value }))} />
          </form>
        </Modal>

        <Modal open={payrollModal} title="New Payroll Run" onClose={() => setPayrollModal(false)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setPayrollModal(false)}>Cancel</button><button type="submit" form="payroll-form" className="btn-primary" disabled={saving}>Create</button></>}>
          <form id="payroll-form" onSubmit={createPayroll} className="space-y-3">
            <select className="input-field w-full" value={payrollForm.periodType} onChange={(e) => setPayrollForm((f) => ({ ...f, periodType: e.target.value }))}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
            <input required type="date" className="input-field w-full" value={payrollForm.periodFrom} onChange={(e) => setPayrollForm((f) => ({ ...f, periodFrom: e.target.value }))} />
            <input required type="date" className="input-field w-full" value={payrollForm.periodTo} onChange={(e) => setPayrollForm((f) => ({ ...f, periodTo: e.target.value }))} />
            <input className="input-field w-full" placeholder="Department filter (optional)" value={payrollForm.department} onChange={(e) => setPayrollForm((f) => ({ ...f, department: e.target.value }))} />
          </form>
        </Modal>

        <Modal open={advanceModal} title="Employee Advance" onClose={() => setAdvanceModal(false)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setAdvanceModal(false)}>Cancel</button><button type="submit" form="adv-form" className="btn-primary" disabled={saving}>Create</button></>}>
          <form id="adv-form" onSubmit={saveAdvance} className="space-y-3">
            <select required className="input-field w-full" value={advanceForm.employeeId} onChange={(e) => setAdvanceForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
            {!employees.length && <button type="button" className="text-xs text-brand-600" onClick={() => { setTab('employees'); loadTab('employees', true); }}>Load employees first</button>}
            <input required type="number" className="input-field w-full" placeholder="Amount" value={advanceForm.amount} onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))} />
            <select className="input-field w-full" value={advanceForm.paymentMode} onChange={(e) => setAdvanceForm((f) => ({ ...f, paymentMode: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
            </select>
            <input className="input-field w-full" placeholder="Reason" value={advanceForm.reason} onChange={(e) => setAdvanceForm((f) => ({ ...f, reason: e.target.value }))} />
          </form>
        </Modal>
      </div>
    </RequirePermission>
  );
}
