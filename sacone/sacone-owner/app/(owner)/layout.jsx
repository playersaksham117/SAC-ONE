'use client';

import { useAuth } from '../../lib/auth-context';
import OwnerShell from '../../components/OwnerShell';
import { LoadingState } from '../../components/ui';
import { OWNER_PERMISSIONS } from '../../lib/links';

export default function OwnerLayout({ children }) {
  const { loading, session, checkPermission, logout } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><LoadingState /></div>;
  }
  if (!session) return null;

  if (!OWNER_PERMISSIONS.some((p) => checkPermission(p))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">No owner access</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your role ({session.user?.roleName}) can't open the CEO Dashboard or Income &amp; Expense.
            Ask an administrator to grant <code>reports.ceo_dashboard.view</code> or <code>finance.ledger.view</code>.
          </p>
          <button type="button" onClick={logout} className="btn-secondary mt-5">Sign out</button>
        </div>
      </div>
    );
  }

  return <OwnerShell>{children}</OwnerShell>;
}
