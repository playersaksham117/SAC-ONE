'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyRedirect({ target }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return null;
}
