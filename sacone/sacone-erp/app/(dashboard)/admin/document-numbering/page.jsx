'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';

export default function DocumentNumberingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [firmForm, setFirmForm] = useState({});

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
          <h3 className="mb-3 font-semibold">Document series</h3>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Current #</th>
                <th className="px-3 py-2">Next #</th>
              </tr>
            </thead>
            <tbody>
              {(data?.series || []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 capitalize">{s.documentType.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 font-mono">{s.docPrefix}</td>
                  <td className="px-3 py-2">{s.currentNumber}</td>
                  <td className="px-3 py-2 font-semibold">{String(s.nextNumber).padStart(data.firm?.numberPadding || 4, '0')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
