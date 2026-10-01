'use client';

import { RequirePermission } from '../../../lib/auth-context';
import PageHeader from '../../../components/ui';
import CeoDashboardView from '../../../components/reports/CeoDashboardView';

export default function CeoDashboardPage() {
  return (
    <RequirePermission
      permission="reports.ceo_dashboard.view"
      fallback={<p className="py-16 text-center text-sm text-slate-500">Your role can't view the CEO Dashboard.</p>}
    >
      <div className="space-y-5">
        <PageHeader title="CEO Dashboard" description="Executive KPIs, charts and business alerts — consolidated owner view." />
        <CeoDashboardView />
      </div>
    </RequirePermission>
  );
}
