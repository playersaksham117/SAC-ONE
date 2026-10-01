'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { findModuleByPath, HOME_PERMISSION } from '../lib/navigation';

export default function RouteGuard({ children }) {
  const pathname = usePathname();
  const { checkPermission, loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !session) return;

    if (pathname === '/dashboard') {
      if (!checkPermission(HOME_PERMISSION)) {
        router.replace('/login');
      }
      return;
    }

    const mod = findModuleByPath(pathname);
    if (mod && !checkPermission(mod.permission)) {
      router.replace('/dashboard');
    }
  }, [pathname, loading, session, checkPermission, router]);

  return children;
}
