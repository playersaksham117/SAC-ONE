'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal } from '../../../../components/ui';
import { EmptyPanel, SectionCard } from '../../../../components/module-ui';

const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function PeriodStatus({ label, s }) {
  if (!s) return <span className="text-xs text-slate-400">No {label.toLowerCase()}</span>;
  return (
    <div className={`rounded-lg px-2.5 py-1.5 text-xs ${s.active ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
      <div className="font-semibold">{label} {s.period} · {s.active ? 'Active' : 'Expired'}</div>
      <div>{s.active ? `till ${ddmmyyyy(s.till)} · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left` : `ended ${ddmmyyyy(s.till)}`}</div>
    </div>
  );
}

/** Add / correct the serial numbers of one invoice line. */
function SerialsModal({ result, line, onClose, onSaved }) {
  const [text, setText] = useState(line.serials.join('\n'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/pos/sales/${result.saleId}/items/${line.itemId}/serials`, { method: 'PUT', body: JSON.stringify({ serialNumbers: text }) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal open title={`Serial numbers · ${line.productName}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
      <Alert message={error} />
      <p className="mb-2 text-sm text-slate-600">Invoice {result.invoiceNumber} · {line.quantity} unit{line.quantity === 1 ? '' : 's'}. One serial per line (scan or type).</p>
      <textarea className="input-field font-mono" rows={Math.min(10, Math.max(3, line.quantity))} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}

export default function WarrantyCheckPage() {
  const { checkPermission } = useAuth();
  const canEditSerials = checkPermission('pos.sales.create');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const input = useRef(null);

  const search = async (value = q) => {
    if (value.trim().length < 2) return;
    setBusy(true);
    setError('');
    try { setData(await apiRequest(`/api/warranty/check?q=${encodeURIComponent(value.trim())}`)); } catch (err) { setError(err.message); setData(null); } finally { setBusy(false); }
  };
  useEffect(() => { input.current?.focus(); }, []);

  return (
    <RequirePermission permission="pos.sales.view" fallback={<Alert message="You do not have access to sales." />}>
      <PageHeader title="Warranty Check" description="Scan or type an invoice number or a product's serial number to see its warranty and guarantee from the invoice date." />
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="mb-5 flex max-w-2xl gap-2">
        <input ref={input} className="input-field text-lg" placeholder="Invoice no. or serial no." value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || q.trim().length < 2}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      <Alert message={error} />

      {data && !data.results.length && <EmptyPanel title="Nothing found" description={`No invoice or serial number matches “${data.query}”.`} />}
      <div className="space-y-4">
        {data?.results.map((r) => (
          <SectionCard key={r.saleId}
            title={<span>Invoice {r.invoiceNumber}{r.status === 'cancelled' ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Cancelled</span> : null}</span>}
            subtitle={`${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${r.customerName ? `${r.customerName}${r.customerPhone ? ` · ${r.customerPhone}` : ''}` : 'Walk-in customer'}${r.matchedSerial ? ` · serial ${r.matchedSerial}` : ''}`}
            noPadding>
            <div className="divide-y divide-slate-100">
              {r.lines.map((l) => {
                const hit = r.matchedSerial && l.serials.includes(r.matchedSerial);
                return (
                  <div key={l.itemId} className={`grid gap-3 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr] ${hit ? 'bg-amber-50/60' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{l.productName}</div>
                      <div className="text-xs text-slate-500">{l.sku} · Qty {l.quantity}{l.quantityReturned ? ` · ${l.quantityReturned} returned` : ''}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {l.serials.map((s) => <span key={s} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${s === r.matchedSerial ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{s}</span>)}
                        {canEditSerials && r.status !== 'cancelled' && (
                          <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setEditing({ result: r, line: l })}>
                            {l.serials.length ? 'Edit serials' : '+ Add serial no.'}
                          </button>
                        )}
                      </div>
                    </div>
                    <PeriodStatus label="Warranty" s={l.warranty} />
                    <PeriodStatus label="Guarantee" s={l.guarantee} />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
      {editing && <SerialsModal result={editing.result} line={editing.line} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); search(); }} />}
    </RequirePermission>
  );
}
