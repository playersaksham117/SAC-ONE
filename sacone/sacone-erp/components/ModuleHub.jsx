'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert } from './ui';

/**
 * One module made of several workspaces (e.g. Sales + Warranty Check) shown as switchable views.
 *
 * - The open view is kept in the address (?view=warranty), so links, bookmarks, refresh and the
 *   old module addresses (which redirect here) land on the right view.
 * - A view stays mounted once opened, so switching back keeps its filters, scroll and half-made
 *   work (the POS bill in progress, a stock count, a search).
 * - Views the user has no permission for are not shown.
 *
 * views: [{ id, label, icon, description, allowed, badge?, render: () => node }]
 */
export default function ModuleHub(props) {
  return (
    <Suspense fallback={null}>
      <Hub {...props} />
    </Suspense>
  );
}

function Hub({ title, icon, views }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const visible = views.filter((v) => v.allowed);
  const wanted = params.get('view');
  const active = visible.find((v) => v.id === wanted)?.id || visible[0]?.id;
  const [opened, setOpened] = useState(() => new Set(active ? [active] : []));
  const tabRefs = useRef({});

  useEffect(() => {
    if (active && !opened.has(active)) setOpened((s) => new Set(s).add(active));
  }, [active, opened]);

  const open = useCallback((id) => {
    if (id === active) return;
    const next = new URLSearchParams();
    if (id !== visible[0]?.id) next.set('view', id);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [active, pathname, router, visible]);

  const onKeyDown = (e, index) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const target = visible[(index + step + visible.length) % visible.length];
    open(target.id);
    tabRefs.current[target.id]?.focus();
  };

  if (!visible.length) return <Alert message={`You do not have access to ${title}.`} />;

  const current = visible.find((v) => v.id === active);

  return (
    <div>
      {visible.length > 1 && (
        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm" data-testid="module-hub">
          <div className="flex items-center gap-2 px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {icon ? <span aria-hidden="true" className="text-base">{icon}</span> : null}
            <span>{title}</span>
          </div>
          <div
            role="tablist"
            aria-label={title}
            className={`grid gap-1.5 sm:gap-2 ${visible.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
          >
            {visible.map((v, index) => {
              const on = v.id === active;
              return (
                <button
                  key={v.id}
                  ref={(el) => { tabRefs.current[v.id] = el; }}
                  type="button"
                  role="tab"
                  id={`hub-tab-${v.id}`}
                  aria-selected={on}
                  aria-controls={`hub-view-${v.id}`}
                  tabIndex={on ? 0 : -1}
                  data-testid={`hub-tab-${v.id}`}
                  onClick={() => open(v.id)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className={`group flex min-w-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center transition sm:flex-row sm:items-start sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left ${
                    on
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 hover:bg-white hover:ring-slate-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base sm:h-9 sm:w-9 sm:text-lg ${on ? 'bg-white/10' : 'bg-white ring-1 ring-slate-200'}`}
                  >
                    {v.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-center gap-1 text-xs font-semibold leading-tight sm:justify-start sm:gap-2 sm:text-sm">
                      {v.label}
                      {v.badge > 0 && (
                        <span className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'}`}>
                          {v.badge}
                        </span>
                      )}
                    </span>
                    {v.description ? (
                      <span className={`mt-0.5 hidden text-xs leading-snug sm:block ${on ? 'text-slate-300' : 'text-slate-500'}`}>{v.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {visible.filter((v) => opened.has(v.id) || v.id === current?.id).map((v) => (
        <div
          key={v.id}
          role="tabpanel"
          id={`hub-view-${v.id}`}
          aria-labelledby={`hub-tab-${v.id}`}
          hidden={v.id !== current?.id}
        >
          {v.render()}
        </div>
      ))}
    </div>
  );
}
