'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LegacyRoleDetailRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/roles/${params.id}`);
  }, [router, params.id]);

  return null;
}
