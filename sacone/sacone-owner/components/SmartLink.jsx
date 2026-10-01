'use client';

import Link from 'next/link';
import { resolveLink } from '../lib/links';
import { useErpAppUrl } from '../lib/app-urls';

/** Link that routes inside the owner app, opens the ERP in a new tab, or renders plain text. */
export default function SmartLink({ href, className = '', children, hideIfNoPage = false }) {
  const erpUrl = useErpAppUrl();
  const target = resolveLink(href, erpUrl);
  if (!target && hideIfNoPage) return null;
  if (!target) return <span className={className.replace(/text-sky-700|hover:underline/g, '').trim()}>{children}</span>;
  if (target.external) {
    return (
      <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} title="Opens in SACONE ERP">
        {children}
      </a>
    );
  }
  return <Link href={target.href} className={className}>{children}</Link>;
}
