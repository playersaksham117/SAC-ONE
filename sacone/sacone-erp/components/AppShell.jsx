'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { getSidebarNavigation, findModuleByPath, OWNER_PERMISSIONS } from '../lib/navigation';
import { useOwnerAppUrl } from '../lib/app-urls';
import { LiveIndicator } from '../lib/live';
import { recordModuleVisit } from '../lib/recent-modules';

/** Financial year containing today (India), e.g. '2026-27'. */
function currentFinancialYear() {
  const ist = new Date(Date.now() + 330 * 60000);
  const start = ist.getUTCMonth() + 1 >= 4 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Which firm and year this screen shows, with a link back to the picker. */
function FirmYearBadge({ session }) {
  if (!session?.firm) return null;
  return (
    <Link
      href="/select-firm"
      title="Switch firm or financial year"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
    >
      <span className="truncate">{session.firm.name}</span>
      {session.financialYear && <span className="shrink-0 text-brand-500">· FY {session.financialYear.code}</span>}
      <span className="shrink-0 text-brand-500">⇄</span>
    </Link>
  );
}

function NavLink({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <span className="text-base">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({ sections, pathname, isHome, session, logout, onNavigate, canOwner }) {
  const ownerUrl = useOwnerAppUrl();
  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="border-b border-slate-800 px-6 py-5 transition hover:bg-slate-800/50"
      >
        <div className="text-lg font-bold tracking-tight">SACONE</div>
        <div className="mt-1 text-xs text-slate-400">Business Management</div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavLink item={{ href: '/dashboard', label: 'Home', icon: '🏠' }} active={isHome} onNavigate={onNavigate} />
        {sections.map((section) => (
          <div key={section.id} className="mt-5">
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  onNavigate={onNavigate}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-4">
        {canOwner && (
          <a
            href={ownerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-600/15 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-600/25 hover:text-emerald-200"
          >
            <span>👑</span>
            <span className="flex-1">SACONE Owner</span>
            <span className="text-xs">↗</span>
          </a>
        )}
        <div className="mb-3 rounded-lg bg-slate-800 px-3 py-2">
          <div className="truncate text-sm font-medium">{session?.user?.fullName}</div>
          <div className="truncate text-xs text-slate-400">{session?.user?.roleName}</div>
        </div>
        <button type="button" onClick={logout} className="btn-secondary w-full text-slate-700">
          Sign out
        </button>
      </div>
    </>
  );
}

/**
 * Responsive ERP shell.
 *  ≥ lg : fixed sidebar
 *  < lg : top bar + off-canvas drawer (phones / tablets)
 */
export default function AppShell({ children }) {
  const pathname = usePathname();
  const { session, logout, checkPermission } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebarSections = getSidebarNavigation(checkPermission);
  const currentModule = findModuleByPath(pathname);
  const isHome = pathname === '/dashboard';
  const title = isHome ? 'Home' : currentModule?.label || 'SACONE ERP';

  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => { if (currentModule) recordModuleVisit(currentModule.id); }, [currentModule?.id]); // feeds Home "Recently opened"
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const canOwner = OWNER_PERMISSIONS.some((p) => checkPermission(p));
  const sidebarProps = { sections: sidebarSections, pathname, isHome, session, logout, canOwner };

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-900 text-white lg:flex">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-slate-900 text-white shadow-2xl">
            <Sidebar {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 lg:py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{title}</h1>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <FirmYearBadge session={session} />
                {!isHome && currentModule && (
                  <span className="hidden truncate text-xs text-slate-400 md:inline">{currentModule.description}</span>
                )}
              </div>
            </div>
            <LiveIndicator />
            {!isHome && (
              <Link href="/dashboard" className="btn-secondary hidden text-sm sm:inline-flex">
                ← Home
              </Link>
            )}
          </div>
        </header>
        {session?.financialYear && session.financialYear.code !== currentFinancialYear() && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
            Showing <b>FY {session.financialYear.code}</b> ({session.financialYear.from} to {session.financialYear.to}).
            New entries are dated today and belong to FY {currentFinancialYear()}.{' '}
            <Link href="/select-firm" className="font-semibold underline">Switch year</Link>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
