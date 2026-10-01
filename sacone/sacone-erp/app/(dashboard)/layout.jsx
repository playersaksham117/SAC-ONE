'use client';

import { useAuth } from '../../lib/auth-context';
import AppShell from '../../components/AppShell';
import RouteGuard from '../../components/RouteGuard';
import { LoadingState } from '../../components/ui';

export default function DashboardLayout({ children }) {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!session) return null;

  return (
    <RouteGuard>
      <AppShell>{children}</AppShell>
    </RouteGuard>
  );
}
