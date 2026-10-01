'use client';

import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { GridCard, SectionCard } from '../module-ui';
import { useOwnerAppUrl } from '../../lib/app-urls';

const REPORT_LINKS = [
  {
    id: 'ceo',
    title: 'CEO Dashboard',
    description: 'Executive KPIs, profit, cash flow, ageing and alerts.',
    href: '/ceo',
    ownerApp: true,
    external: true,
    icon: '📈',
    permission: 'reports.ceo_dashboard.view',
    hint: 'Opens in SACONE Owner ↗',
  },
  {
    id: 'income-expense',
    title: 'Income & Expense Reports',
    description: 'Income and expense summaries by category and payment mode.',
    href: '/income-expense',
    ownerApp: true,
    external: true,
    icon: '💸',
    permission: 'finance.ledger.view',
    hint: 'Opens in SACONE Owner ↗',
  },
  {
    id: 'banking',
    title: 'Cash & Bank Books',
    description: 'Cash, bank and UPI books with inflow, outflow and net.',
    href: '/business/finance',
    icon: '🏦',
    permission: 'finance.ledger.view',
    hint: 'Open Banking & Cash',
  },
  {
    id: 'sales',
    title: 'Sales Reports',
    description: 'Invoice register, salesperson performance, returns analysis.',
    icon: '💰',
    comingSoon: true,
  },
  {
    id: 'inventory',
    title: 'Inventory Reports',
    description: 'Stock valuation, movement ledger, dead stock and reorder lists.',
    icon: '📊',
    comingSoon: true,
  },
  {
    id: 'purchases',
    title: 'Purchase Reports',
    description: 'Supplier bills, GRN matching, payable ageing exports.',
    icon: '📦',
    comingSoon: true,
  },
  {
    id: 'gst',
    title: 'GST & Tax Reports',
    description: 'GSTR summaries, HSN-wise sales, input tax credit.',
    icon: '🧾',
    comingSoon: true,
  },
];

export default function ReportsHub() {
  const { checkPermission } = useAuth();
  const ownerUrl = useOwnerAppUrl();

  const available = REPORT_LINKS.filter((r) => !r.comingSoon && checkPermission(r.permission));
  const upcoming = REPORT_LINKS.filter((r) => r.comingSoon);

  return (
    <div className="space-y-6 pb-8">
      <SectionCard title="Module Reports" subtitle="Detailed reports live inside each business module.">
        {available.length === 0 ? (
          <p className="text-sm text-slate-500">No module reports available for your role yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((r) => (
              <Link key={r.id} href={r.ownerApp ? `${ownerUrl}${r.href}` : r.href} className="block h-full" {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <GridCard className="h-full">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">{r.icon}</span>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900">{r.title}</h4>
                      <p className="mt-1 text-xs text-slate-500">{r.description}</p>
                      <p className="mt-2 text-[11px] font-medium text-sky-700">{r.hint}</p>
                    </div>
                  </div>
                </GridCard>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Coming Soon" subtitle="Operational exports and scheduled report packs.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((r) => (
            <GridCard key={r.id} className="h-full opacity-75">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">{r.icon}</span>
                <div className="min-w-0">
                  <h4 className="font-semibold text-slate-900">{r.title}</h4>
                  <p className="mt-1 text-xs text-slate-500">{r.description}</p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Planned</p>
                </div>
              </div>
            </GridCard>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
