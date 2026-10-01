'use client';

import { Fragment, useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const loadLogs = async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (moduleFilter) query.set('module', moduleFilter);
      const data = await apiRequest(`/api/audit-logs?${query.toString()}`);
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useLiveRefresh(() => loadLogs(true), { tables: ['audit_logs'] });
  useEffect(() => {
    loadLogs();
  }, [moduleFilter]);

  return (
    <RequirePermission permission="core.audit_log.view">
      <PageHeader
        title="Audit Log"
        description="Track user actions, changes, and system events."
      />

      <Alert type="error" message={error} />

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-slate-600" htmlFor="moduleFilter">Filter by module</label>
        <select
          id="moduleFilter"
          className="input-field w-48"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="">All modules</option>
          <option value="core">Core</option>
        </select>
        <span className="text-sm text-slate-500">{total} entries</span>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Timestamp</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Module</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Record</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{log.userName || 'System'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase">{log.action}</span>
                    </td>
                    <td className="px-4 py-3">{log.module}</td>
                    <td className="px-4 py-3 text-slate-600">{log.recordType}{log.recordId ? ` #${log.recordId.slice(0, 8)}` : ''}</td>
                    <td className="px-4 py-3">
                      {(log.previousValue || log.newValue) && (
                        <button
                          type="button"
                          className="text-brand-600 hover:underline"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          {expandedId === log.id ? 'Hide' : 'View'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          {log.previousValue && (
                            <div>
                              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Previous</div>
                              <pre className="overflow-x-auto rounded bg-white p-3 text-xs text-slate-700">{JSON.stringify(log.previousValue, null, 2)}</pre>
                            </div>
                          )}
                          {log.newValue && (
                            <div>
                              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">New</div>
                              <pre className="overflow-x-auto rounded bg-white p-3 text-xs text-slate-700">{JSON.stringify(log.newValue, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePermission>
  );
}
