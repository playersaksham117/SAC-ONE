'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from '../components/ui';

/** Entry: send the user to the first owner module their role allows. */
export default function OwnerIndex() {
  const { session, loading, checkPermission } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (checkPermission('reports.ceo_dashboard.view')) router.replace('/ceo');
    else router.replace('/income-expense');
  }, [loading, session, router, checkPermission]);

  return <LoadingState />;
}
