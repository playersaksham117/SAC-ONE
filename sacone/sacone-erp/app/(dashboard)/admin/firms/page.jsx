'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal } from '../../../../components/ui';

/** Financial year containing today (India), e.g. '2026-27'. */
function thisYear() {
  const ist = new Date(Date.now() + 330 * 60000);
  const start = ist.getUTCMonth() + 1 >= 4 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const yearsBack = (n) => Array.from({ length: n }, (_, i) => {
  const s = Number(thisYear().slice(0, 4)) - i;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
});

const EMPTY = { name: '', gstNumber: '', state: '', city: '', firstFinancialYear: thisYear() };

export default function FirmsPage() {
  const { session, refreshSession } = useAuth();
  const isOwner = session?.user?.roleSlug === 'owner_admin';
  const [firms, setFirms] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
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

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const firm = await apiRequest('/api/firms', { method: 'POST', body: JSON.stringify(form) });
      setAdding(false);
      setForm(EMPTY);
      setMessage(`"${firm.name}" is ready with its own empty books. Switch to it from the header to add its products, parties and opening stock.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (firm, patch, done) => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/firms/${firm.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      setMessage(done);
      setEditing(null);
      await load();
      if (firm.id === session?.firm?.id) refreshSession();
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
        actions={<button type="button" className="btn-primary" onClick={() => { setError(''); setAdding(true); }}>+ Add firm</button>}
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
                <tr key={f.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{f.name}</div>
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
                      <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setEditing({ ...f })}>Edit</button>
                      {!f.isPrimary && (
                        <button
                          type="button"
                          className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
                          disabled={saving}
                          onClick={() => {
                            if (f.isActive && !window.confirm(`Switch off "${f.name}"? Nobody can open it and its POS phones stop syncing until you switch it on again. Its books are kept.`)) return;
                            update(f, { isActive: !f.isActive }, f.isActive ? `"${f.name}" switched off. Its books are kept.` : `"${f.name}" switched on.`);
                          }}
                        >
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
        The owner can open every firm. A firm&apos;s address, GSTIN and invoice details are edited in Company Settings while that firm is open.
      </p>

      <Modal
        open={adding}
        title="Add firm"
        onClose={() => setAdding(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)} disabled={saving}>Cancel</button>
            <button type="submit" form="firm-form" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create firm'}</button>
          </>
        )}
      >
        <form id="firm-form" onSubmit={create} className="space-y-4">
          <label className="block text-sm"><span className="label">Firm name *</span>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="label">GSTIN</span>
              <input className="input-field uppercase" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} maxLength={15} />
            </label>
            <label className="block text-sm"><span className="label">Books start from</span>
              <select className="input-field" value={form.firstFinancialYear} onChange={(e) => setForm({ ...form, firstFinancialYear: e.target.value })}>
                {yearsBack(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="label">City</span>
              <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">State</span>
              <input className="input-field" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </label>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            The new firm starts with empty books, a walk-in customer and a main warehouse. Nothing is copied from your other firms.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        title={editing ? `Edit ${editing.name}` : 'Edit firm'}
        onClose={() => setEditing(null)}
        footer={editing && (
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !editing.name.trim()}
              onClick={() => update(editing, { name: editing.name, firstFinancialYear: editing.firstFinancialYear }, 'Firm saved.')}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        {editing && (
          <div className="space-y-4">
            <label className="block text-sm"><span className="label">Firm name</span>
              <input className="input-field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} />
            </label>
            <label className="block text-sm"><span className="label">Earliest financial year offered</span>
              <select className="input-field" value={editing.firstFinancialYear || thisYear()} onChange={(e) => setEditing({ ...editing, firstFinancialYear: e.target.value })}>
                {yearsBack(10).map((y) => <option key={y} value={y}>FY {y}</option>)}
              </select>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
