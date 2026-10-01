'use client';

import { RequirePermission } from '../../../../lib/auth-context';
import PageHeader from '../../../../components/ui';
import ReportsHub from '../../../../components/reports/ReportsHub';

export default function ReportsPage() {
  return (
    <RequirePermission permission="reports.reports.view">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader
          title="Reports"
          description="Cross-module report hub. The CEO Dashboard and Income & Expense are in the SACONE Owner app."
        />
        <ReportsHub />
      </div>
    </RequirePermission>
  );
}
