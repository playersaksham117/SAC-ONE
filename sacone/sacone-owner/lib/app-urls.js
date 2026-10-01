'use client';

import { useEffect, useState } from 'react';
import { siblingAppUrl } from './api';

const CONFIGURED_ERP_URL = process.env.NEXT_PUBLIC_ERP_URL || '';

/** SACONE ERP web app. */
export function erpAppUrl() {
  return siblingAppUrl('erp', 3000, CONFIGURED_ERP_URL);
}

/** Same, resolved after mount so server and client render the same first HTML. */
export function useErpAppUrl() {
  const [url, setUrl] = useState(() => (CONFIGURED_ERP_URL || 'http://localhost:3000').replace(/\/$/, ''));
  useEffect(() => { setUrl(erpAppUrl()); }, []);
  return url;
}
