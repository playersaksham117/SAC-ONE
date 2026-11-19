'use client';

import { useEffect, useRef } from 'react';
import { amountInWords, money } from '../../lib/bill-document';
import { Alert } from '../ui';

/**
 * Full-screen page for a credit / debit note, laid out like the GST invoice and purchase bill:
 * header with Back, main column (party, details, items) and a summary column on the right with
 * the total in words and the action button. Esc goes back, Ctrl+S saves.
 */
export function NotePage({ title, subtitle, error, main, summary, total, totalLabel, actionLabel, onAction, actionDisabled, saving, onClose, footnote, testId }) {
  const actionRef = useRef(onAction);
  actionRef.current = actionDisabled || saving ? null : onAction;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose?.();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); actionRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-50" data-testid={testId}>
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary !px-3" onClick={onClose}>← Back</button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <Alert message={error} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">{main}</div>
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <NoteCard title="Summary">
              {summary}
              <div className="mt-3 rounded-xl bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{totalLabel}</div>
                <div className="text-3xl font-black tabular-nums text-slate-900" data-testid="note-total">{money(total)}</div>
                {total > 0 && <div className="mt-1 text-xs text-slate-500">{amountInWords(total)}</div>}
              </div>
              <button type="button" className="btn-primary mt-4 w-full !py-3 text-base" onClick={onAction} disabled={actionDisabled || saving} data-testid="note-save">
                {saving ? 'Saving…' : `${actionLabel} (Ctrl+S)`}
              </button>
              <button type="button" className="btn-secondary mt-2 w-full" onClick={onClose}>Cancel</button>
              {footnote && <p className="mt-3 text-xs text-slate-500">{footnote}</p>}
            </NoteCard>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function NoteCard({ title, right, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function SumRow({ label, value, strong = false, muted = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
