'use client';

import { useEffect } from 'react';
import { ownerAppUrl, useOwnerAppUrl } from '../../../../lib/app-urls';

/** Legacy route — the CEO Dashboard now lives in the separate SACONE Owner web app. */
export default function CeoDashboardMovedPage() {
  const ownerUrl = useOwnerAppUrl();
  useEffect(() => { window.location.replace(`${ownerAppUrl()}/ceo`); }, []);
  return (
    <p className="py-16 text-center text-sm text-slate-500">
      The CEO Dashboard moved to SACONE Owner. <a className="font-medium text-brand-600 hover:underline" href={`${ownerUrl}/ceo`}>Open it</a>.
    </p>
  );
}
