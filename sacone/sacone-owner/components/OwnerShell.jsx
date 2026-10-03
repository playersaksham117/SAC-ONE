'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useErpAppUrl } from '../lib/app-urls';
import { LiveIndicator } from '../lib/live';

const NAV = [
  { href: '/ceo', label: 'CEO Dashboard', icon: '📈', permission: 'reports.ceo_dashboard.view' },
  { href: '/income-expense', label: 'Income & Expense', icon: '💸', permission: 'finance.ledger.view' },
];

/** Top-bar shell: two owner modules as tabs, company + user on the right. Works from phone to desktop. */
export default function OwnerShell({ children }) {
  const pathname = usePathname();
  const { session, logout, checkPermission } = useAuth();
  const items = NAV.filter((n) => checkPermission(n.permission));
  const erpUrl = useErpAppUrl();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg">👑</span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-bold tracking-tight">SACONE Owner</span>
              <span className="block max-w-[14rem] truncate text-[11px] text-slate-400">{session?.company?.businessName || 'Business'}</span>
            </span>
          </Link>

          <nav className="scrollbar-none order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:ml-2 sm:w-auto sm:flex-1 sm:px-0">
            {items.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{n.icon}</span>
                  <span className="whitespace-nowrap">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <span className="ml-auto sm:ml-0"><LiveIndicator dark /></span>
          <a href={erpUrl} target="_blank" rel="noopener noreferrer" className="hidden rounded-lg px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-white/15 hover:bg-white/10 hover:text-white md:inline-flex">
            Open ERP ↗
          </a>
          <div className="hidden text-right leading-tight lg:block">
            <div className="text-xs font-semibold">{session?.user?.fullName}</div>
            <div className="text-[11px] text-slate-400">{session?.user?.roleName}</div>
          </div>
          <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-white/15 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</main>
    </div>
  );
}
