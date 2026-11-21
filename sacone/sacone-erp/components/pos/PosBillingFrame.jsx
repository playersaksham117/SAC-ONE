'use client';

import { useEffect, useState } from 'react';
import { siblingAppUrl } from '../../lib/api';

const CONFIGURED_POS_URL = process.env.NEXT_PUBLIC_POS_WEB_URL || '';

/**
 * POS billing inside the ERP: the SAC-POS web app (served on port 3002, or NEXT_PUBLIC_POS_WEB_URL)
 * shown in the page. It is the same app as on the phones: it keeps its own terminal pairing and
 * staff PIN sign-in, and its bills sync into SACONE like a phone's.
 */
export default function PosBillingPage() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('checking'); // checking | up | down
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setUrl(siblingAppUrl('pos', 3002, CONFIGURED_POS_URL)); }, []);

  useEffect(() => {
    if (!url) return undefined;
    let live = true;
    setStatus('checking');
    // no-cors: only tells us the server answered, which is all we need before showing the frame
    fetch(`${url}/`, { mode: 'no-cors', cache: 'no-store' })
      .then(() => { if (live) setStatus('up'); })
      .catch(() => { if (live) setStatus('down'); });
    return () => { live = false; };
  }, [url, attempt]);

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="text-sm font-semibold text-slate-800">
          POS Billing <span className="font-normal text-slate-500">· SAC-POS web</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Open in new tab ↗</a> : null}
        </div>
      </div>

      {status === 'down' ? (
        <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-bold text-slate-900">SAC-POS web is not running</h2>
          <p className="mt-2 text-sm text-slate-600">
            Nothing answered at <span className="font-mono">{url}</span>. Start the SAC-POS web server on the shop PC
            (sac-pos: <span className="font-mono">node web-server.mjs</span>), then try again.
          </p>
          <button type="button" className="btn-primary mt-4" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : url && status === 'up' ? (
        <iframe
          key={attempt}
          src={url}
          title="SAC-POS web"
          className="w-full flex-1 border-0 bg-white"
          allow="camera; clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <div className="mt-12 text-center text-sm text-slate-500">Loading SAC-POS…</div>
      )}
    </div>
  );
}
