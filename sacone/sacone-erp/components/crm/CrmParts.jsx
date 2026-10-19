'use client';

import { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, Modal } from '../ui';
import {
  ACTIVITY_KINDS, KINDS, QUICK_DATES, dayLabel, istDay, kindOf, stageOf, telHref, waHref, whenLabel,
} from './crm-shared';

export function StagePill({ stage }) {
  const s = stageOf(stage);
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

/** Date chips (Today / Tomorrow / …) plus a date box. */
export function DateChips({ value, onChange, allowNone = false }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button type="button" onClick={() => onChange('')} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${!value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>No follow-up</button>
      )}
      {QUICK_DATES.map(([label, days]) => {
        const d = istDay(days);
        return (
          <button key={label} type="button" onClick={() => onChange(d)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${value === d ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
        );
      })}
      <input type="date" className="input-field !min-h-0 w-auto !py-1 text-xs" min={istDay()} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function KindChips({ value, onChange, kinds = KINDS }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {kinds.map((k) => (
        <button key={k.id} type="button" onClick={() => onChange(k.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${value === k.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          {k.icon} {k.label}
        </button>
      ))}
    </div>
  );
}

export function ContactLinks({ phone }) {
  if (!phone) return null;
  return (
    <span className="inline-flex gap-1">
      <a href={telHref(phone)} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">📞 {phone}</a>
      <a href={waHref(phone)} target="_blank" rel="noreferrer" className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100">WhatsApp</a>
    </span>
  );
}

/** One follow-up row: who / what / when, with Done and Cancel. */
export function FollowUpRow({ f, onOpen, onDone, onCancel, showOwner }) {
  const overdue = f.dueDate < istDay();
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${overdue ? 'bg-rose-50' : 'bg-slate-50'}`}>{kindOf(f.kind).icon}</div>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-brand-700">
          {f.partyName}{f.partyCompany ? <span className="font-normal text-slate-500"> · {f.partyCompany}</span> : null}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={overdue ? 'font-semibold text-rose-600' : ''}>{overdue ? `Overdue · ${dayLabel(f.dueDate)}` : dayLabel(f.dueDate)}</span>
          <span>{kindOf(f.kind).label}{f.purpose ? `: ${f.purpose}` : ''}</span>
          {f.leadId ? <StagePill stage={f.leadStage} /> : <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">Customer</span>}
          {showOwner && f.assignedName && <span>· {f.assignedName}</span>}
        </div>
      </div>
      <ContactLinks phone={f.partyPhone} />
      <div className="flex gap-1.5">
        <button type="button" className="btn-primary !min-h-0 !py-1.5 text-xs" onClick={onDone}>✓ Done</button>
        {onCancel && <button type="button" className="btn-secondary !min-h-0 !py-1.5 text-xs" title="Cancel this follow-up" onClick={onCancel}>✕</button>}
      </div>
    </div>
  );
}

/** Close a follow-up: what happened, and the next date (optional). */
export function FollowUpDoneModal({ followUp, onClose, onSaved }) {
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextPurpose, setNextPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/crm/follow-ups/${followUp.id}/done`, { method: 'POST', body: JSON.stringify({ notes, nextDate: nextDate || undefined, nextPurpose: nextPurpose || undefined }) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={`${kindOf(followUp.kind).icon} ${followUp.partyName}: done`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="fu-done" className="btn-primary" disabled={saving || !notes.trim()}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <form id="fu-done" onSubmit={save} className="space-y-4">
        <Alert message={error} />
        {followUp.purpose && <p className="text-sm text-slate-500">Planned: {followUp.purpose}</p>}
        <label className="block text-sm"><span className="label">What happened? *</span>
          <textarea className="input-field" rows={3} autoFocus required placeholder="e.g. Spoke to him, wants a quote for 10 fans" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div>
          <span className="label">Next follow-up</span>
          <DateChips value={nextDate} onChange={setNextDate} allowNone />
          {nextDate && <input className="input-field mt-2" placeholder="Purpose (optional), e.g. Send quote" value={nextPurpose} onChange={(e) => setNextPurpose(e.target.value)} />}
        </div>
      </form>
    </Modal>
  );
}

/** Log a call / visit / note, or book a follow-up, for a lead or a customer. */
export function ActivityComposer({ target, users, canAssign, onSaved }) {
  const [mode, setMode] = useState('log');
  const [kind, setKind] = useState('call');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(istDay(1));
  const [purpose, setPurpose] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (mode === 'log') {
        await apiRequest('/api/crm/activities', { method: 'POST', body: JSON.stringify({ ...target, kind, notes }) });
        setNotes('');
      } else {
        await apiRequest('/api/crm/follow-ups', { method: 'POST', body: JSON.stringify({ ...target, kind: kind === 'note' ? 'call' : kind, dueDate, purpose, assignedTo: assignedTo || undefined }) });
        setPurpose('');
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex gap-1">
        {[['log', 'Log activity'], ['plan', 'Plan follow-up']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === id ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>
      <Alert message={error} />
      <KindChips value={kind} onChange={setKind} kinds={mode === 'log' ? ACTIVITY_KINDS : KINDS} />
      {mode === 'log' ? (
        <textarea className="input-field" rows={2} placeholder="What happened?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      ) : (
        <>
          <DateChips value={dueDate} onChange={setDueDate} />
          <input className="input-field" placeholder="Purpose, e.g. Payment reminder" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          {canAssign && users?.length > 0 && (
            <select className="input-field" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Assign to: me / lead owner</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          )}
        </>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary !min-h-0 !py-1.5 text-sm" disabled={saving || (mode === 'log' ? !notes.trim() : !dueDate)}>
          {saving ? 'Saving…' : mode === 'log' ? 'Save activity' : 'Add follow-up'}
        </button>
      </div>
    </form>
  );
}

/** Activity log entries. */
export function ActivityList({ items }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-400">No activity yet</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-1 ring-slate-200">{kindOf(a.kind).icon}</span>
          <div className={`text-sm ${a.kind === 'stage' ? 'text-slate-500' : 'text-slate-800'}`}>{a.notes}</div>
          <div className="text-xs text-slate-400">{kindOf(a.kind).label} · {a.userName || '—'} · {whenLabel(a.createdAt)}</div>
        </li>
      ))}
    </ol>
  );
}
