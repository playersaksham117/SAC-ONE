'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import FirmForm from '../../../../components/firms/FirmForm';

export default function FirmsPage() {
  const { session, refreshSession } = useAuth();
  const isOwner = session?.user?.roleSlug === 'owner_admin';
  const [firms, setFirms] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // undefined = form closed, null = adding a firm, id = editing that firm
  const [formFor, setFormFor] = useState(undefined);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setFirms(await apiRequest('/api/firms'));
      setError('');
    } catch (e) {
      setError(e.message);
      setFirms([]);
    }
  };
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  const openForm = (id) => {
    setError('');
    setMessage('');
    setFormFor(id);
  };

  const saved = async (firm, wasEditing) => {
    setFormFor(undefined);
    setMessage(wasEditing
      ? `"${firm.name}" saved.`
      : `"${firm.name}" is ready with its own empty books. Switch to it from the header to add its products, parties and opening stock.`);
    await load();
    if (firm.id === session?.firm?.id) refreshSession();
  };

  const toggleActive = async (firm) => {
    if (firm.isActive && !window.confirm(`Switch off "${firm.name}"? Nobody can open it and its POS phones stop syncing until you switch it on again. Its books are kept.`)) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/firms/${firm.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !firm.isActive }) });
      setMessage(firm.isActive ? `"${firm.name}" switched off. Its books are kept.` : `"${firm.name}" switched on.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <>
        <PageHeader title="Firms" description="Separate books per firm" />
        <Alert type="error" message="Only the owner can manage firms." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Firms"
        description="Each firm keeps fully separate books: its own products, customers, suppliers, stock, invoices and accounts."
        actions={<button type="button" className="btn-primary" onClick={() => openForm(null)}>+ Add firm</button>}
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {!firms ? <LoadingState /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Firm</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Financial years</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {firms.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button type="button" className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={() => openForm(f.id)}>
                      {f.name}
                    </button>
                    <div className="text-xs text-slate-500">
                      {[f.city, f.state].filter(Boolean).join(', ') || '—'}
                      {f.isPrimary && ' · first firm'}
                      {session?.firm?.id === f.id && ' · open now'}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{f.gstNumber || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{f.financialYears.join(', ')}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {f.isActive ? 'Active' : 'Switched off'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={() => openForm(f.id)}>Edit</button>
                      {!f.isPrimary && (
                        <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" disabled={saving} onClick={() => toggleActive(f)}>
                          {f.isActive ? 'Switch off' : 'Switch on'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Who may open which firm is set per user in <Link href="/admin/users" className="text-brand-600 hover:underline">Users → Edit</Link>.
        The owner can open every firm. Invoice layout, bank details and terms are set in System Settings while that firm is open.
      </p>

      {formFor !== undefined && (
        <FirmForm firmId={formFor} onClose={() => setFormFor(undefined)} onSaved={saved} />
      )}
    </>
  );
}
