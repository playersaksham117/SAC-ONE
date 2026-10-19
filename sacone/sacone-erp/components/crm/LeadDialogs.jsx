'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Alert, LoadingState, Modal } from '../ui';
import { SOURCES, STAGES, istDay, money } from './crm-shared';
import {
  ActivityComposer, ActivityList, ContactLinks, DateChips, FollowUpDoneModal, FollowUpRow, StagePill,
} from './CrmParts';

const EMPTY = { name: '', company: '', phone: '', email: '', city: '', source: '', requirement: '', expectedValue: '', assignedTo: '', followUpDate: istDay(), followUpPurpose: '' };

/** New lead, or edit one. */
export function LeadFormModal({ lead, users, canAssign, onClose, onSaved }) {
  const [form, setForm] = useState(() => (lead ? { ...EMPTY, ...lead, expectedValue: lead.expectedValue || '', followUpDate: '' } : EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, expectedValue: Number(form.expectedValue) || 0, assignedTo: form.assignedTo || undefined };
      const saved = lead
        ? await apiRequest(`/api/crm/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/api/crm/leads', { method: 'POST', body: JSON.stringify({ ...body, followUpDate: form.followUpDate || undefined }) });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      size="lg"
      title={lead ? `Edit ${lead.name}` : 'New lead'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="lead-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : lead ? 'Save' : 'Add lead'}</button>
        </>
      )}
    >
      <form id="lead-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alert message={error} /></div>
        <label className="text-sm"><span className="label">Name *</span><input className="input-field" required autoFocus value={form.name} onChange={set('name')} placeholder="Contact person" /></label>
        <label className="text-sm"><span className="label">Mobile</span><input className="input-field" inputMode="tel" value={form.phone || ''} onChange={set('phone')} placeholder="98765 43210" /></label>
        <label className="text-sm"><span className="label">Company / shop</span><input className="input-field" value={form.company || ''} onChange={set('company')} /></label>
        <label className="text-sm"><span className="label">City</span><input className="input-field" value={form.city || ''} onChange={set('city')} /></label>
        <label className="text-sm sm:col-span-2"><span className="label">Requirement</span><textarea className="input-field" rows={2} value={form.requirement || ''} onChange={set('requirement')} placeholder="What do they want?" /></label>
        <label className="text-sm"><span className="label">Expected value (₹)</span><input type="number" min="0" className="input-field" value={form.expectedValue} onChange={set('expectedValue')} /></label>
        <label className="text-sm"><span className="label">Source</span>
          <select className="input-field" value={form.source || ''} onChange={set('source')}>
            <option value="">—</option>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="label">Email</span><input type="email" className="input-field" value={form.email || ''} onChange={set('email')} /></label>
        {canAssign && (
          <label className="text-sm"><span className="label">Assigned to</span>
            <select className="input-field" value={form.assignedTo || ''} onChange={set('assignedTo')}>
              <option value="">{lead ? '—' : 'Me'}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </label>
        )}
        {!lead && (
          <div className="sm:col-span-2">
            <span className="label">First follow-up</span>
            <DateChips value={form.followUpDate} onChange={(d) => setForm({ ...form, followUpDate: d })} allowNone />
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Everything about one lead: stage, contact, follow-ups and activity. */
export function LeadDetailModal({ leadId, users, canAssign, onClose, onChanged, onOpenCustomer }) {
  const { checkPermission } = useAuth();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [doneFor, setDoneFor] = useState(null);
  const canEdit = checkPermission('crm.leads.edit');

  const load = useCallback(async () => {
    try { setLead(await apiRequest(`/api/crm/leads/${leadId}`)); } catch (err) { setError(err.message); }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); onChanged?.(); };
  const act = async (fn) => {
    setError('');
    try { await fn(); await refresh(); } catch (err) { setError(err.message); }
  };
  const setStage = (stage) => act(async () => {
    let lostReason;
    if (stage === 'lost') {
      lostReason = window.prompt('Why was it lost? (price, bought elsewhere, not interested …)');
      if (!lostReason) return;
    }
    await apiRequest(`/api/crm/leads/${leadId}`, { method: 'PUT', body: JSON.stringify({ stage, lostReason }) });
  });
  const convert = () => act(async () => {
    if (!window.confirm(`Make ${lead.company || lead.name} a customer? The lead is marked Won.`)) return;
    await apiRequest(`/api/crm/leads/${leadId}/convert`, { method: 'POST' });
  });
  const remove = async () => {
    if (!window.confirm(`Delete lead ${lead.name} and its history?`)) return;
    try { await apiRequest(`/api/crm/leads/${leadId}`, { method: 'DELETE' }); onChanged?.(); onClose(); } catch (err) { setError(err.message); }
  };
  const reassign = (assignedTo) => act(() => apiRequest(`/api/crm/leads/${leadId}`, { method: 'PUT', body: JSON.stringify({ assignedTo }) }));

  const open = lead?.followUps.filter((f) => f.status === 'open') || [];
  const closed = lead && ['won', 'lost'].includes(lead.stage);

  return (
    <>
      <Modal open size="xl" title={lead ? lead.name : 'Lead'} onClose={onClose}>
        {!lead ? (error ? <Alert message={error} /> : <LoadingState />) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <Alert message={error} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StagePill stage={lead.stage} />
                  {lead.expectedValue > 0 && <span className="text-sm font-semibold text-slate-800">{money(lead.expectedValue)}</span>}
                  {lead.source && <span className="text-xs text-slate-500">via {lead.source}</span>}
                </div>
                {lead.company && <div className="mt-2 font-medium text-slate-800">{lead.company}</div>}
                <div className="mt-1 text-sm text-slate-500">{[lead.city, lead.email].filter(Boolean).join(' · ')}</div>
                <div className="mt-2"><ContactLinks phone={lead.phone} /></div>
                {lead.requirement && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{lead.requirement}</p>}
                {lead.stage === 'lost' && lead.lostReason && <p className="mt-2 text-sm text-slate-500">Lost: {lead.lostReason}</p>}
              </div>

              {canEdit && (
                <div>
                  <span className="label">Stage</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES.map((s) => (
                      <button key={s.id} type="button" disabled={lead.stage === s.id} onClick={() => setStage(s.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${lead.stage === s.id ? `${s.tone} ring-2 ring-offset-1 ring-slate-300` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm">
                <span className="label">Assigned to</span>
                {canAssign && canEdit ? (
                  <select className="input-field" value={lead.assignedTo || ''} onChange={(e) => reassign(e.target.value)}>
                    {!users.some((u) => u.id === lead.assignedTo) && <option value={lead.assignedTo || ''}>{lead.assignedName || '—'}</option>}
                    {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                ) : <div className="text-slate-700">{lead.assignedName || '—'}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {canEdit && <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(true)}>Edit details</button>}
                {lead.customerId
                  ? <button type="button" className="btn-secondary text-sm" onClick={() => onOpenCustomer?.(lead.customerId)}>View customer →</button>
                  : canEdit && checkPermission('parties.customers.create') && lead.stage !== 'lost' && (
                    <button type="button" className="btn-primary text-sm" onClick={convert}>✓ Won: make customer</button>
                  )}
                {checkPermission('crm.leads.delete') && <button type="button" className="btn-danger text-sm" onClick={remove}>Delete</button>}
              </div>
              <p className="text-xs text-slate-400">Added by {lead.createdByName || '—'} on {new Date(lead.createdAt).toLocaleDateString('en-IN')}</p>
            </div>

            <div className="space-y-4">
              {!closed && (
                <div>
                  <span className="label">Open follow-ups</span>
                  {open.length ? (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {open.map((f) => (
                        <FollowUpRow key={f.id} f={{ ...f, partyName: f.purpose || 'Follow-up', purpose: null, partyPhone: null, partyCompany: null, leadStage: lead.stage }}
                          onDone={() => setDoneFor({ ...f, partyName: lead.name })}
                          onCancel={canEdit ? () => act(() => apiRequest(`/api/crm/follow-ups/${f.id}/cancel`, { method: 'POST' })) : null} />
                      ))}
                    </div>
                  ) : <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No follow-up planned. Plan one below so this lead is not forgotten.</p>}
                </div>
              )}
              {canEdit && !closed && <ActivityComposer target={{ leadId }} users={users} canAssign={canAssign} onSaved={refresh} />}
              <div>
                <span className="label">History</span>
                <ActivityList items={lead.activities} />
              </div>
            </div>
          </div>
        )}
      </Modal>
      {editing && <LeadFormModal lead={lead} users={users} canAssign={canAssign} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await refresh(); }} />}
      {doneFor && <FollowUpDoneModal followUp={doneFor} onClose={() => setDoneFor(null)} onSaved={async () => { setDoneFor(null); await refresh(); }} />}
    </>
  );
}
