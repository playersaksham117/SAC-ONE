'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';

const LABELS = { tax_invoice: 'Invoice (cash & credit)' };
const label = (type) => LABELS[type] || type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function DocumentNumberingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [firmForm, setFirmForm] = useState({});
  const [rows, setRows] = useState({});
  const [savingRow, setSavingRow] = useState('');
  const { session } = useAuth();
  // Only the owner may change a series (format, opening / next number).
  const isOwner = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/document-numbering');
      setData(res);
      setFirmForm({
        firmPrefix: res.firm?.firmPrefix || '',
        documentNumberFormat: res.firm?.documentNumberFormat || '{FIRM}/{DOC}/{NUMBER}/{FY}',
        simpleNumberFormat: res.firm?.simpleNumberFormat || '{FIRM}/{NUMBER}/{FY}',
        numberPadding: res.firm?.numberPadding ?? 4,
        fyResetNumbering: res.firm?.fyResetNumbering !== false,
        authorizedSignatory: res.firm?.authorizedSignatory || '',
      });
      setRows(Object.fromEntries((res.series || []).map((s) => [s.documentType, {
        formatTemplate: s.formatTemplate || '',
        nextNumber: String(s.nextNumber),
      }])));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveFirm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/document-numbering/firm', { method: 'PUT', body: JSON.stringify(firmForm) });
      setMessage('Document numbering settings saved');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRow = async (s) => {
    const row = rows[s.documentType] || {};
    setSavingRow(s.documentType);
    setError('');
    setMessage('');
    try {
      if ((row.formatTemplate || '') !== (s.formatTemplate || '')) {
        await apiRequest(`/api/document-numbering/series/${s.documentType}`, { method: 'PUT', body: JSON.stringify({ formatTemplate: row.formatTemplate.trim() }) });
      }
      if (Number(row.nextNumber) !== s.nextNumber) {
        await apiRequest(`/api/document-numbering/series/${s.documentType}/next-number`, { method: 'PUT', body: JSON.stringify({ nextNumber: Number(row.nextNumber) }) });
      }
      setMessage(`${label(s.documentType)} series saved`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRow('');
    }
  };

  if (loading) return <LoadingState message="Loading numbering settings…" />;

  return (
    <RequirePermission permission="core.document_numbering.view">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Document Numbering"
          description="Configure firm prefix, financial year series, and document formats (e.g. SE/Q/0001/26-27)."
        />
        <Alert type="error" message={error} />
        <Alert type="success" message={message} />

        <form onSubmit={saveFirm} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Firm settings</h3>
          <p className="text-sm text-slate-500">
            Firm: <strong>{data?.firm?.businessName}</strong> · FY: <strong>{data?.financialYear}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Firm prefix (override)
              <input className="input-field mt-1 uppercase" value={firmForm.firmPrefix} onChange={(e) => setFirmForm((p) => ({ ...p, firmPrefix: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-sm">Number padding
              <input className="input-field mt-1" type="number" min="3" max="8" value={firmForm.numberPadding} onChange={(e) => setFirmForm((p) => ({ ...p, numberPadding: Number(e.target.value) }))} />
            </label>
            <label className="text-sm sm:col-span-2">Format template
              <input className="input-field mt-1 font-mono text-xs" value={firmForm.documentNumberFormat} onChange={(e) => setFirmForm((p) => ({ ...p, documentNumberFormat: e.target.value }))} />
              <span className="text-xs text-slate-400">Tokens: {'{FIRM}'} {'{DOC}'} {'{NUMBER}'} {'{FY}'}</span>
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={firmForm.fyResetNumbering} onChange={(e) => setFirmForm((p) => ({ ...p, fyResetNumbering: e.target.checked }))} />
              Reset sequence every financial year (1 Apr – 31 Mar)
            </label>
            <label className="text-sm sm:col-span-2">Authorized signatory
              <input className="input-field mt-1" value={firmForm.authorizedSignatory} onChange={(e) => setFirmForm((p) => ({ ...p, authorizedSignatory: e.target.value }))} />
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>Save settings</button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Document series</h3>
          <p className="mb-3 text-sm text-slate-500">
            {isOwner
              ? 'Set the format and the next (opening) number of each series, e.g. continue invoices from 0151. Cash and credit invoices share the invoice series. Numbers already on a bill are skipped.'
              : 'Only the firm admin can change a series.'}
          </p>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">Next number</th>
                <th className="px-3 py-2">Next document</th>
                {isOwner ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {[...(data?.series || [])].sort((a, b) => (b.documentType === 'tax_invoice') - (a.documentType === 'tax_invoice')).map((s) => {
                const row = rows[s.documentType] || {};
                const changed = (row.formatTemplate || '') !== (s.formatTemplate || '') || Number(row.nextNumber) !== s.nextNumber;
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{label(s.documentType)}</td>
                    <td className="px-3 py-2">
                      {isOwner ? (
                        <input className="input-field w-48 font-mono text-xs" value={row.formatTemplate ?? ''} placeholder={data.firm?.documentNumberFormat}
                          onChange={(e) => setRows((p) => ({ ...p, [s.documentType]: { ...row, formatTemplate: e.target.value } }))} />
                      ) : <span className="font-mono text-xs">{s.formatTemplate || data.firm?.documentNumberFormat}</span>}
                    </td>
                    <td className="px-3 py-2">{s.currentNumber || '—'}</td>
                    <td className="px-3 py-2">
                      {isOwner ? (
                        <input className="input-field w-24" type="number" min="1" value={row.nextNumber ?? ''}
                          onChange={(e) => setRows((p) => ({ ...p, [s.documentType]: { ...row, nextNumber: e.target.value } }))} />
                      ) : String(s.nextNumber).padStart(data.firm?.numberPadding || 4, '0')}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">{s.nextPreview}</td>
                    {isOwner ? (
                      <td className="px-3 py-2">
                        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={!changed || savingRow === s.documentType || !(Number(row.nextNumber) >= 1)} onClick={() => saveRow(s)}>
                          {savingRow === s.documentType ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
