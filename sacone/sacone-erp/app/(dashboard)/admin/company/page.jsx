'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import FirmForm from '../../../../components/firms/FirmForm';
import FirmAdminDialog from '../../../../components/firms/FirmAdminDialog';

/**
 * Company & Firms: the open firm's company profile (what used to be Company Settings) and,
 * for the group owner, every firm with its own books and admins: add, edit, switch off.
 */
export default function CompanyAndFirmsPage() {
  const { session, refreshSession, checkPermission } = useAuth();
  const isOwner = session?.user?.roleSlug === 'owner_admin';
  const canEdit = checkPermission('core.company.edit');
  const [firms, setFirms] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // undefined = pop-up closed, null = adding a firm, id = editing that firm
  const [formFor, setFormFor] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [adminFor, setAdminFor] = useState(null);
  // Remount the "This firm" form after a pop-up edit of the same firm.
  const [currentKey, setCurrentKey] = useState(0);

  const loadFirms = async () => {
    if (!isOwner) return;
    try {
      setFirms(await apiRequest('/api/firms'));
    } catch (e) {
      setError(e.message);
      setFirms([]);
    }
  };
  useEffect(() => { loadFirms(); }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = (id) => {
    setError('');
    setMessage('');
    setFormFor(id);
  };

  const savedFromPopup = async (firm, wasEditing) => {
    setFormFor(undefined);
    setMessage(wasEditing
      ? `"${firm.name}" saved.`
      : `"${firm.name}" is ready with its own empty books. Switch to it from the header to add its products, parties and opening stock.`);
    await loadFirms();
    if (firm.id === session?.firm?.id) {
      setCurrentKey((k) => k + 1);
      refreshSession();
    }
  };

  const savedCurrent = () => {
    refreshSession(); // header and invoices show the new name
    loadFirms();
  };

  const toggleActive = async (firm) => {
    if (firm.isActive && !window.confirm(`Switch off "${firm.name}"? Nobody can open it and its POS phones stop syncing until you switch it on again. Its books are kept.`)) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/firms/${firm.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !firm.isActive }) });
      setMessage(firm.isActive ? `"${firm.name}" switched off. Its books are kept.` : `"${firm.name}" switched on.`);
      await loadFirms();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequirePermission permission="core.company.view">
      <PageHeader
        title="Company & Firms"
        description="Business profile, GST and invoice details of each firm. Each firm keeps fully separate books."
        actions={isOwner && <button type="button" className="btn-primary" onClick={() => openForm(null)}>+ Add firm</button>}
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            This firm{session?.firm?.name ? `: ${session.firm.name}` : ''}
          </h2>
          <span className="text-xs text-slate-500">
            {canEdit ? 'Changes apply to the firm open now.' : 'View only: you do not have permission to edit the company profile.'}
          </span>
        </div>
        {session?.firm ? (
          <div className="max-w-4xl">
            <FirmForm key={`${session.firm.id}-${currentKey}`} current readOnly={!canEdit} canSetYears={isOwner} onSaved={savedCurrent} />
          </div>
        ) : <LoadingState />}
      </section>

      {isOwner && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">All firms</h2>
            <span className="text-xs text-slate-500">Only the group owner sees this list.</span>
          </div>
          {!firms ? <LoadingState /> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Firm</th>
                    <th className="px-4 py-3">GSTIN</th>
                    <th className="px-4 py-3">Admins</th>
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
                      <td className="px-4 py-3 text-xs">
                        {(f.admins || []).length
                          ? f.admins.map((a) => (
                            <div key={a.id} className={a.isActive ? 'text-slate-700' : 'text-slate-400 line-through'}>{a.fullName} <span className="text-slate-400">· {a.email}</span></div>
                          ))
                          : <span className="text-amber-700">No admin yet</span>}
                        <div className="text-slate-400">{f.userCount || 0} user{f.userCount === 1 ? '' : 's'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{f.financialYears.join(', ')}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {f.isActive ? 'Active' : 'Switched off'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={() => openForm(f.id)}>Edit</button>
                          {f.isActive && (
                            <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => { setError(''); setMessage(''); setAdminFor(f); }}>+ Admin</button>
                          )}
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
            Each firm has its own users and roles. Its admin adds the rest of its staff in <Link href="/admin/users" className="text-brand-600 hover:underline">Users</Link> while
            signed in to that firm; staff can open their own firm only. As group owner you open every firm and are not listed among any firm&apos;s users.
            Invoice layout, bank details and terms are in System Settings while that firm is open.
          </p>
        </section>
      )}

      {adminFor && (
        <FirmAdminDialog
          firm={adminFor}
          onClose={() => setAdminFor(null)}
          onCreated={async (admin) => {
            setAdminFor(null);
            setMessage(`${admin.fullName} is now admin of "${adminFor.name}". They sign in with ${admin.email} and see only that firm.`);
            await loadFirms();
          }}
        />
      )}

      {formFor !== undefined && (
        <FirmForm firmId={formFor} onClose={() => setFormFor(undefined)} onSaved={savedFromPopup} />
      )}
    </RequirePermission>
  );
}
