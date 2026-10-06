'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../lib/api';
import { documentHtml, printHtml, saleDocument } from '../../lib/bill-document';
import { DocumentShareService } from '../../lib/document-share';

const TOKEN_KEY = 'sacone.shareToken';

/** Read the link token from the URL fragment (never sent to any server), then clear it from the address bar. */
function takeToken() {
  const fromHash = window.location.hash.slice(1);
  if (fromHash) {
    sessionStorage.setItem(TOKEN_KEY, fromHash);
    window.history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export default function SharedInvoicePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = takeToken();
    if (!token) {
      setError('This page needs the full invoice link. Open it again from the message you received.');
      return;
    }
    fetch(`${getApiBase()}/api/shared-documents/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error?.message || 'This invoice link is not available.');
        setData(payload.data);
      })
      .catch((e) => {
        sessionStorage.removeItem(TOKEN_KEY);
        setError(e.message === 'Failed to fetch' ? 'Could not reach the shop’s server. Try again later.' : e.message);
      });
  }, []);

  const html = useMemo(() => {
    if (!data) return '';
    const model = saleDocument(data.sale, data.customer);
    return documentHtml(model, data.company, 'A4', { layout: data.invoice?.layout || 'classic', invoice: data.invoice || {} });
  }, [data]);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await DocumentShareService.renderPdf(html, 'A4');
      DocumentShareService.downloadBlob(blob, DocumentShareService.shareFileName(data.sale.invoiceNumber));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-3">
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
        )}
        {!data && !error && <p className="p-6 text-center text-sm text-slate-500">Loading invoice…</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
              <div className="text-sm">
                <div className="font-semibold text-slate-900">Invoice {data.sale.invoiceNumber}</div>
                <div className="text-xs text-slate-500">
                  Link valid until {new Date(data.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => printHtml(html)}>🖨 Print</button>
                <button type="button" className="btn-primary" onClick={download} disabled={busy}>{busy ? 'Preparing…' : '⬇ Download PDF'}</button>
              </div>
            </div>
            <iframe
              title={`Invoice ${data.sale.invoiceNumber}`}
              sandbox=""
              srcDoc={html}
              className="h-[80vh] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
            />
          </>
        )}
      </div>
    </main>
  );
}
