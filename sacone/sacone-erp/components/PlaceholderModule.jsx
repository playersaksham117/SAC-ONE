'use client';

import Link from 'next/link';
import { RequirePermission } from '../lib/auth-context';
import PageHeader from './ui';

export default function PlaceholderModule({ module, sectionLabel }) {
  return (
    <RequirePermission permission={module.permission}>
      <PageHeader
        title={module.label}
        description={module.description}
        actions={
          <Link href="/dashboard" className="btn-secondary">
            ← Back to Home
          </Link>
        }
      />

      <div className="card max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-2xl">
            {module.icon}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {sectionLabel}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{module.label}</h3>
            <p className="mt-2 text-sm text-slate-600">
              This module is planned for a future phase. Navigation and permissions are already
              configured — functionality will be added without restructuring routes.
            </p>
            <div className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Coming soon
            </div>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
