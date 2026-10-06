'use client';

import { useEffect, useRef, useState } from 'react';
import { DocumentShareService } from '../../lib/document-share';

const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Share one document through the OS share sheet (Web Share API), with fallbacks.
 *   pdf():     Promise<{ html, size }> for the current PDF choice
 *   share:     { number, amount, links?: { status(), create(), revoke() } }
 */
export default function ShareSection({ pdf, share }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(null); // prepared PDF waiting for a fresh click (Safari)
  const [linkInfo, setLinkInfo] = useState(null);
  const [link, setLink] = useState(null);
  const canShare = useRef(false);
  const fileName = DocumentShareService.shareFileName(share.number);
  const message = DocumentShareService.invoiceShareMessage(share.number, share.amount, link?.url);

  useEffect(() => {
    canShare.current = DocumentShareService.canShareFiles();
    share.links?.status().then(setLinkInfo).catch(() => setLinkInfo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const makePdf = async () => {
    const { html, size } = pdf();
    return DocumentShareService.renderPdf(html, size);
  };

  const openSheet = async (blob) => {
    const result = await DocumentShareService.sharePdf(blob, fileName, { title: `Invoice ${share.number}`, text: message });
    if (result === 'needs-gesture') {
      setReady(blob);
      setNote('PDF ready. Tap “Open share sheet” to choose an app.');
    } else {
      setReady(null);
      if (result === 'unsupported') setNote('This browser can’t share files. Use Download PDF, Copy link or WhatsApp below.');
    }
  };

  const shareNative = () => run('share', async () => openSheet(ready || await makePdf()));
  const download = () => run('download', async () => DocumentShareService.downloadBlob(await makePdf(), fileName));

  const copyLink = () => run('link', async () => {
    const created = link || await share.links.create();
    setLink(created);
    setLinkInfo((s) => (s ? { ...s, activeLinks: (s.activeLinks || 0) + (link ? 0 : 1) } : s));
    try {
      await DocumentShareService.copyText(created.url);
      setNote(`Link copied. It stops working ${when(created.expiresAt)}.`);
    } catch {
      setNote(`Copy this link (works until ${when(created.expiresAt)}): ${created.url}`);
    }
  });

  const revoke = () => run('revoke', async () => {
    const { revoked } = await share.links.revoke();
    setLink(null);
    setLinkInfo((s) => (s ? { ...s, activeLinks: 0 } : s));
    setNote(revoked ? `${revoked} link${revoked === 1 ? '' : 's'} switched off.` : 'No active links.');
  });

  const linksOn = Boolean(linkInfo?.enabled);

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Share invoice</h4>
      <p className="mb-3 text-xs text-slate-500">
        Opens your device’s share sheet: WhatsApp, Telegram, Gmail, Nearby Share, AirDrop, Files and other installed apps.
        You choose the app and the recipient and send it yourself.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={shareNative} disabled={Boolean(busy)}>
          {busy === 'share' ? 'Preparing PDF…' : ready ? '↗ Open share sheet' : '↗ Share invoice'}
        </button>
        <button type="button" className="btn-secondary" onClick={download} disabled={Boolean(busy)}>
          {busy === 'download' ? 'Preparing…' : '⬇ Download PDF'}
        </button>
        {share.links && (
          <button
            type="button"
            className="btn-secondary"
            onClick={copyLink}
            disabled={Boolean(busy) || !linksOn}
            title={linksOn ? `Creates a link that works for ${linkInfo.ttlHours} hours` : 'Invoice links are off on this server'}
          >
            {busy === 'link' ? 'Creating…' : '🔗 Copy invoice link'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => DocumentShareService.openWhatsAppMessage(message)} disabled={Boolean(busy)}>
          WhatsApp message
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {note && <p className="mt-2 text-xs text-slate-600">{note}</p>}
      <p className="mt-2 text-xs text-slate-500">
        WhatsApp message opens WhatsApp with the invoice number and amount{link ? ' and the link' : ''} filled in; attach the downloaded PDF if needed.
        {share.links && !linksOn && linkInfo && ' Links need the server’s public https address (PUBLIC_DOCUMENT_BASE_URL).'}
      </p>
      {linksOn && linkInfo.activeLinks > 0 && (
        <button type="button" className="mt-2 text-xs font-medium text-red-600 hover:underline" onClick={revoke} disabled={Boolean(busy)}>
          Switch off {linkInfo.activeLinks} active link{linkInfo.activeLinks === 1 ? '' : 's'} to this invoice
        </button>
      )}
    </section>
  );
}
