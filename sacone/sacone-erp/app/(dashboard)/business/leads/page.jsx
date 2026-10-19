'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert } from '../../../../components/ui';
import { EmptyPanel, ModuleTabs, SectionCard, SkeletonGrid, StatCard } from '../../../../components/module-ui';
import { STAGES, dayLabel, istDay, money } from '../../../../components/crm/crm-shared';
import { ContactLinks, FollowUpDoneModal, FollowUpRow, StagePill } from '../../../../components/crm/CrmParts';
import { LeadDetailModal, LeadFormModal } from '../../../../components/crm/LeadDialogs';

export default function LeadsPage() {
  const { checkPermission } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('today');
  const [summary, setSummary] = useState(null);
  const [followUps, setFollowUps] = useState(null);
  const [leads, setLeads] = useState(null);
  const [users, setUsers] = useState([]);
  const [stage, setStage] = useState('open');
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('all');
  const [mineOnly, setMineOnly] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [openLead, setOpenLead] = useState(null);
  const [doneFor, setDoneFor] = useState(null);

  const seesAll = Boolean(summary?.seesAll);
  const canCreate = checkPermission('crm.leads.create');

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ stage, q: search.trim(), assigned: owner });
      const [s, f, l] = await Promise.all([
        apiRequest('/api/crm/summary'),
        apiRequest(`/api/crm/follow-ups?mine=${mineOnly ? '1' : '0'}`),
        apiRequest(`/api/crm/leads?${params}`),
      ]);
      setSummary(s);
      setFollowUps(f);
      setLeads(l);
    } catch (err) {
      setError(err.message);
    }
  }, [stage, search, owner, mineOnly]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);
  useEffect(() => { apiRequest('/api/crm/users').then(setUsers).catch(() => {}); }, []);
  useLiveRefresh(load, { tables: ['crm_leads', 'crm_followups', 'crm_activities'] });

  const openFollowUp = (f) => {
    if (f.leadId) setOpenLead(f.leadId);
    else router.push(`/business/crm?customer=${f.customerId}`);
  };
  const cancelFollowUp = async (f) => {
    if (!window.confirm('Cancel this follow-up?')) return;
    try { await apiRequest(`/api/crm/follow-ups/${f.id}/cancel`, { method: 'POST' }); await load(); } catch (err) { setError(err.message); }
  };

  const fuGroup = (title, items, tone) => items.length > 0 && (
    <SectionCard noPadding title={<span className={tone}>{title} · {items.length}</span>}>
      <div className="divide-y divide-slate-100">
        {items.map((f) => (
          <FollowUpRow key={f.id} f={f} showOwner={!mineOnly} onOpen={() => openFollowUp(f)} onDone={() => setDoneFor(f)} onCancel={() => cancelFollowUp(f)} />
        ))}
      </div>
    </SectionCard>
  );

  const total = followUps ? followUps.overdue.length + followUps.dueToday.length + followUps.upcoming.length : 0;

  return (
    <RequirePermission permission="crm.leads.view" fallback={<Alert message="You do not have access to CRM." />}>
      <PageHeader
        title="Leads & Follow-ups"
        description="Every enquiry in one place: who to call today, where each lead stands, and what was said."
        actions={canCreate && <button type="button" className="btn-primary" onClick={() => setCreating(true)}>+ New lead</button>}
      />
      <Alert message={error} />

      {!summary ? <SkeletonGrid /> : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Due today" value={summary.dueToday} icon="📅" tone={summary.dueToday ? 'info' : 'default'} />
          <StatCard label="Overdue" value={summary.overdue} icon="⏰" tone={summary.overdue ? 'danger' : 'default'} />
          <StatCard label="Open leads" value={summary.openLeads.c} hint={money(summary.openLeads.v)} icon="🎯" />
          <StatCard label="Won this month" value={summary.wonThisMonth.c} hint={money(summary.wonThisMonth.v)} icon="🏆" tone="success" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ModuleTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'today', label: 'Follow-ups', badge: (summary?.dueToday || 0) + (summary?.overdue || 0) },
            { id: 'leads', label: 'Leads' },
          ]}
        />
        {tab === 'today' && seesAll && (
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            {[[true, 'Mine'], [false, 'Everyone']].map(([v, label]) => (
              <button key={label} type="button" onClick={() => setMineOnly(v)} className={`rounded-md px-3 py-1.5 ${mineOnly === v ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {tab === 'today' && followUps && (
        total === 0 ? (
          <EmptyPanel title="Nothing to follow up" description="No calls or visits due in the next 7 days. Add a lead or plan a follow-up from a lead or customer." />
        ) : (
          <div className="space-y-4">
            {fuGroup('Overdue', followUps.overdue, 'text-rose-600')}
            {fuGroup('Today', followUps.dueToday, 'text-slate-900')}
            {fuGroup('Next 7 days', followUps.upcoming, 'text-slate-500')}
          </div>
        )
      )}

      {tab === 'leads' && leads && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[{ id: 'open', label: 'All open' }, ...STAGES].map((s) => {
              const count = s.id === 'open'
                ? ['new', 'contacted', 'quoted'].reduce((n, k) => n + (leads.counts[k]?.count || 0), 0)
                : leads.counts[s.id]?.count || 0;
              return (
                <button key={s.id} type="button" onClick={() => setStage(s.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${stage === s.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                  {s.label} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            <input className="input-field !min-h-0 ml-auto w-full !py-1.5 sm:w-60" placeholder="Search name, mobile, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {seesAll && (
              <select className="input-field !min-h-0 w-full !py-1.5 sm:w-44" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">Everyone</option>
                <option value="me">Mine</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            )}
          </div>

          {leads.items.length === 0 ? (
            <EmptyPanel title="No leads here" description={canCreate ? 'Add your first enquiry with “+ New lead”.' : 'Leads assigned to you will appear here.'} />
          ) : (
            <SectionCard noPadding>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Lead</th>
                      <th className="px-4 py-2.5">Stage</th>
                      <th className="px-4 py-2.5">Next follow-up</th>
                      <th className="px-4 py-2.5 text-right">Value</th>
                      <th className="px-4 py-2.5">Owner</th>
                      <th className="px-4 py-2.5">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leads.items.map((l) => {
                      const overdue = l.nextFollowUp && l.nextFollowUp < istDay();
                      return (
                        <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenLead(l.id)}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{l.name}</div>
                            <div className="text-xs text-slate-500">{[l.company, l.city].filter(Boolean).join(' · ') || l.requirement || '—'}</div>
                          </td>
                          <td className="px-4 py-3"><StagePill stage={l.stage} /></td>
                          <td className={`px-4 py-3 text-xs ${overdue ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>
                            {l.nextFollowUp ? `${overdue ? 'Overdue · ' : ''}${dayLabel(l.nextFollowUp)}` : ['won', 'lost'].includes(l.stage) ? '—' : <span className="text-amber-600">Not planned</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{l.expectedValue ? money(l.expectedValue) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{l.assignedName || '—'}</td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><ContactLinks phone={l.phone} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {creating && (
        <LeadFormModal users={users} canAssign={seesAll} onClose={() => setCreating(false)}
          onSaved={async (saved) => { setCreating(false); await load(); setOpenLead(saved.id); }} />
      )}
      {openLead && (
        <LeadDetailModal leadId={openLead} users={users} canAssign={seesAll} onClose={() => setOpenLead(null)} onChanged={load}
          onOpenCustomer={(id) => router.push(`/business/crm?customer=${id}`)} />
      )}
      {doneFor && <FollowUpDoneModal followUp={doneFor} onClose={() => setDoneFor(null)} onSaved={async () => { setDoneFor(null); await load(); }} />}
    </RequirePermission>
  );
}
