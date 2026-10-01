'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, RequirePermission } from '../../../lib/auth-context';
import {
  ERP_MODULES,
  HOME_PERMISSION,
  NAV_SECTIONS,
  OWNER_PERMISSIONS,
  QUICK_ACCESS_DEFAULTS,
  getVisibleSections,
  searchModules,
} from '../../../lib/navigation';
import { getRecentModuleIds } from '../../../lib/recent-modules';
import { useOwnerAppUrl } from '../../../lib/app-urls';
import HomeSectionCard, { ModuleCard, toneFor } from '../../../components/HomeSectionCard';

function greeting(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FilterChip({ active, onClick, label, count, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {label}
      <span className={`text-xs tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session, checkPermission } = useAuth();
  const ownerUrl = useOwnerAppUrl();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [recentIds, setRecentIds] = useState([]);
  const searchRef = useRef(null);

  const sections = useMemo(() => getVisibleSections(checkPermission), [checkPermission]);
  const visible = useMemo(() => sections.flatMap((s) => s.modules), [sections]);
  const sectionById = useMemo(() => Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, s])), []);

  useEffect(() => { setRecentIds(getRecentModuleIds()); }, []);

  // "/" focuses search, like most modern apps.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.target?.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const visibleIds = new Set(visible.map((m) => m.id));
  const recent = recentIds.filter((id) => visibleIds.has(id));
  const quickIds = (recent.length >= 3 ? recent : [...recent, ...QUICK_ACCESS_DEFAULTS.filter((id) => !recent.includes(id))])
    .filter((id) => visibleIds.has(id))
    .slice(0, 6);
  const quick = quickIds.map((id) => ERP_MODULES.find((m) => m.id === id)).filter(Boolean);

  const searching = query.trim().length > 0;
  const results = searching ? searchModules(visible, query) : [];
  const shownSections = filter === 'all' ? sections : sections.filter((s) => s.id === filter);

  const now = new Date();
  const firstName = session?.user?.fullName?.split(' ')[0] || 'there';
  const company = session?.company?.businessName;
  const canOwner = OWNER_PERMISSIONS.some((p) => checkPermission(p));

  const onSearchKey = (e) => {
    if (e.key === 'Enter' && results[0]) router.push(results[0].href);
    if (e.key === 'Escape') setQuery('');
  };

  return (
    <RequirePermission permission={HOME_PERMISSION}>
      <div className="mx-auto max-w-7xl space-y-8">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-brand-100 via-sky-100 to-transparent opacity-80 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-gradient-to-tr from-emerald-50 to-transparent blur-2xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">
                {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {greeting(now)}, {firstName} <span aria-hidden="true">👋</span>
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                {company && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">🏢 {company}</span>
                )}
                {session?.user?.roleName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-100">👤 {session.user.roleName}</span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {visible.length} modules · {sections.length} sections
                </span>
              </div>
            </div>

            <div className="w-full lg:max-w-md">
              <label htmlFor="module-search" className="sr-only">Search modules</label>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 shadow-sm backdrop-blur transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
                <span className="text-slate-400"><SearchIcon /></span>
                <input
                  id="module-search"
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder="Search modules — e.g. stock, invoice, users"
                  autoComplete="off"
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {searching ? (
                  <button type="button" onClick={() => setQuery('')} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                    Clear
                  </button>
                ) : (
                  <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 sm:inline">/</kbd>
                )}
              </div>
            </div>
          </div>
        </section>

        {canOwner && !searching && (
          <a
            href={ownerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md sm:p-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl text-white shadow-sm">👑</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">SACONE Owner</span>
              <span className="block text-sm text-slate-500">CEO Dashboard and Income &amp; Expense, kept in their own app.</span>
            </span>
            <span className="hidden shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-emerald-700 sm:inline">Open ↗</span>
          </a>
        )}

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="text-3xl">🔒</div>
            <h2 className="mt-3 font-semibold text-slate-900">No modules available</h2>
            <p className="mt-1 text-sm text-slate-500">Your role doesn't include any modules yet. Ask an administrator to update it in Roles and Permissions.</p>
          </div>
        ) : searching ? (
          /* ── Search results ─────────────────────────────── */
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
              </h2>
              {results.length > 0 && <span className="hidden text-xs text-slate-400 sm:inline">Press Enter to open the first one</span>}
            </div>
            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                No module matches. Try a different word, or{' '}
                <button type="button" onClick={() => setQuery('')} className="font-medium text-brand-600 hover:underline">show all modules</button>.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {results.map((m, i) => (
                  <ModuleCard
                    key={m.id}
                    module={m}
                    tone={toneFor(sectionById[m.section])}
                    sectionLabel={sectionById[m.section]?.label}
                    highlight={i === 0}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* ── Quick access ──────────────────────────────── */}
            {quick.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    {recent.length >= 3 ? 'Recently opened' : 'Quick access'}
                  </h2>
                </div>
                <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
                  {quick.map((m) => {
                    const tone = toneFor(sectionById[m.section]);
                    return (
                      <Link
                        key={m.id}
                        href={m.href}
                        className="group flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-auto"
                      >
                        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ring-1 transition group-hover:scale-105 ${tone.tile}`}>
                          {m.icon}
                        </span>
                        <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-slate-800">{m.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Section filter ────────────────────────────── */}
            {sections.length > 1 && (
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All modules" count={visible.length} />
                {sections.map((s) => (
                  <FilterChip
                    key={s.id}
                    active={filter === s.id}
                    onClick={() => setFilter(s.id)}
                    label={s.label}
                    count={s.modules.length}
                    dot={toneFor(s).dot}
                  />
                ))}
              </div>
            )}

            {/* ── Sections ──────────────────────────────────── */}
            <div className="space-y-10">
              {shownSections.map((section) => (
                <HomeSectionCard key={section.id} section={section} />
              ))}
            </div>
          </>
        )}
      </div>
    </RequirePermission>
  );
}
