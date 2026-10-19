'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Alert, LoadingState } from '../ui';
import { kindOf, money, whenLabel } from './crm-shared';
import { ActivityComposer, FollowUpDoneModal, FollowUpRow, StagePill } from './CrmParts';

const MODE = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', card: 'Card', other: 'Other' };

function TimelineItem({ item }) {
  let icon; let title; let sub;
  if (item.type === 'activity') {
    icon = kindOf(item.kind).icon;
    title = item.notes;
    sub = `${kindOf(item.kind).label} · ${item.userName || '—'}`;
  } else if (item.type === 'invoice') {
    icon = '🧾';
    title = <>Invoice {item.number} · <b>{money(item.amount)}</b></>;
    sub = item.status === 'cancelled' ? 'Cancelled' : item.paymentStatus === 'paid' ? 'Paid' : item.paymentStatus === 'partial' ? 'Part paid' : 'Unpaid';
  } else if (item.type === 'receipt') {
    icon = '💰';
    title = <>Payment received {item.number} · <b>{money(item.amount)}</b></>;
    sub = MODE[item.mode] || item.mode;
  } else {
    icon = '🎯';
    title = <>Lead: {item.name} <StagePill stage={item.stage} /></>;
    sub = 'Enquiry';
  }
  return (
    <li className="relative">
      <span className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-1 ring-slate-200">{icon}</span>
      <div className="text-sm text-slate-800">{title}</div>
      <div className="text-xs text-slate-400">{sub} · {whenLabel(item.at)}</div>
    </li>
  );
}

/** Customer → Activity: calls, visits and notes alongside bills and payments, plus planned follow-ups. */
export default function CustomerActivity({ customerId }) {
  const { checkPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [doneFor, setDoneFor] = useState(null);
  const [filter, setFilter] = useState('all');
  const canLog = checkPermission('crm.activities.create');

  const load = useCallback(async () => {
    try { setData(await apiRequest(`/api/crm/customers/${customerId}/timeline`)); } catch (err) { setError(err.message); }
  }, [customerId]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (!checkPermission('crm.activities.view')) return <p className="text-sm text-slate-500">You do not have access to customer activity.</p>;
  if (!data) return error ? <Alert message={error} /> : <LoadingState />;
  const items = data.items.filter((i) => filter === 'all' || (filter === 'crm' ? ['activity', 'lead'].includes(i.type) : ['invoice', 'receipt'].includes(i.type)));

  return (
    <div className="space-y-4">
      <Alert message={error} />
      {data.followUps.length > 0 && (
        <div>
          <span className="label">Planned follow-ups</span>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {data.followUps.map((f) => (
              <FollowUpRow key={f.id} f={{ ...f, partyName: f.purpose || 'Follow-up', purpose: null, partyPhone: null }} showOwner
                onDone={() => setDoneFor({ ...f, partyName: data.customer.name })}
                onCancel={canLog ? async () => { await apiRequest(`/api/crm/follow-ups/${f.id}/cancel`, { method: 'POST' }); load(); } : null} />
            ))}
          </div>
        </div>
      )}
      {canLog && <ActivityComposer target={{ customerId }} onSaved={load} />}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label !mb-0">Timeline</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            {[['all', 'All'], ['crm', 'Calls & notes'], ['money', 'Bills & payments']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-md px-2.5 py-1 ${filter === id ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
        </div>
        {items.length ? (
          <ol className="relative max-h-[28rem] space-y-3 overflow-auto border-l border-slate-200 pl-5">
            {items.map((i) => <TimelineItem key={`${i.type}-${i.id}`} item={i} />)}
          </ol>
        ) : <p className="py-6 text-center text-sm text-slate-400">Nothing yet</p>}
      </div>
      {doneFor && <FollowUpDoneModal followUp={doneFor} onClose={() => setDoneFor(null)} onSaved={() => { setDoneFor(null); load(); }} />}
    </div>
  );
}
