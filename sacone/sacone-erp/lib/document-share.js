import { getApiBase } from './api';

/** Open server-rendered document HTML in a print window */
export async function openDocumentPrint(quotationId, apiRequest, onPrintRecorded) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sacone_token') : null;
  const res = await fetch(`/api/proxy-document?path=${encodeURIComponent(`/api/pos/quotations/${quotationId}/document`)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => null);

  let html;
  if (res?.ok) {
    html = await res.text();
  } else {
    html = await apiRequest(`/api/pos/quotations/${quotationId}/document`, { raw: true });
  }

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    throw new Error('Pop-up blocked — allow pop-ups to print');
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
  };
  if (onPrintRecorded) {
    await apiRequest(`/api/pos/quotations/${quotationId}/print`, { method: 'POST' });
    onPrintRecorded();
  }
}

export async function downloadDocumentPdf(quotationId, quotationNumber, apiRequest) {
  await apiRequest(`/api/pos/quotations/${quotationId}/pdf`, { method: 'POST' });
  const html = await fetchDocumentHtml(quotationId, apiRequest);
  const win = window.open('', '_blank');
  if (!win) throw new Error('Pop-up blocked');
  win.document.write(html);
  win.document.close();
  win.document.title = `${quotationNumber}.pdf`;
  win.focus();
  setTimeout(() => win.print(), 400);
}

async function fetchDocumentHtml(quotationId, apiRequest) {
  const base = getApiBase();
  const token = typeof window !== 'undefined' ? localStorage.getItem('sacone_token') : null;
  const res = await fetch(`${base}/api/pos/quotations/${quotationId}/document`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to load document');
  return res.text();
}

export function openWhatsAppShare({ url }) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openMailtoFallback({ mailto }) {
  if (mailto) window.location.href = mailto;
}
