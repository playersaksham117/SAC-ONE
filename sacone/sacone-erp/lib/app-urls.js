'use client';

import { useEffect, useState } from 'react';
import { siblingAppUrl } from './api';

const CONFIGURED_OWNER_URL = process.env.NEXT_PUBLIC_OWNER_APP_URL || '';

/** SACONE Owner web app (CEO Dashboard, Income & Expense). */
export function ownerAppUrl() {
  return siblingAppUrl('owner', 3001, CONFIGURED_OWNER_URL);
}

/** Same, resolved after mount so server and client render the same first HTML. */
export function useOwnerAppUrl() {
  const [url, setUrl] = useState(() => (CONFIGURED_OWNER_URL || 'http://localhost:3001').replace(/\/$/, ''));
  useEffect(() => { setUrl(ownerAppUrl()); }, []);
  return url;
}
