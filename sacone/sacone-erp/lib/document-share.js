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

/* ───────────── DocumentShareService (browser) ─────────────
 * Native OS sharing through the Web Share API (navigator.share with the PDF file). The user
 * picks WhatsApp, Telegram, Gmail, Nearby Share, AirDrop, Files … and sends it themselves.
 * Fallbacks: download the PDF, copy a short-lived link, or open WhatsApp with a pre-filled
 * message. Nothing here knows about sales, GST or auth.
 */

const PAGE_MM = { A4: [210, 297], A5: [148, 210] };
const PX_PER_MM = 96 / 25.4;

/** Strip control / bidi characters and collapse whitespace. */
export function cleanText(value, max = 80) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** "INV/24-25/1025" → "Invoice-INV-24-25-1025.pdf". */
export function shareFileName(documentNumber, prefix = 'Invoice') {
  const safe = cleanText(documentNumber, 60).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.');
  return `${prefix}-${safe || 'document'}.pdf`;
}

/** Caption with number, amount and thanks only — no customer data. `link` is a short-lived share link. */
export function invoiceShareMessage(documentNumber, amount, link, label = 'Invoice') {
  const total = `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = `${label} ${cleanText(documentNumber, 40)} | Amount ${total} | Thank you for your business.`;
  return link ? `${text}\n${link}` : text;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** True when a capture came out empty (foreignObject drawing is not supported everywhere). */
function isBlank(canvas) {
  try {
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The PDF libraries, loaded on first use. A tab left open while the ERP was updated (or across
 * sleep) can no longer fetch them ("Loading chunk … failed"): say to reload instead of that.
 */
async function loadPdfLibraries() {
  try {
    return await Promise.all([import('jspdf'), import('html2canvas')]);
  } catch (e) {
    if (e?.name === 'ChunkLoadError' || /Loading chunk|dynamically imported module|_next\/undefined/i.test(String(e?.message))) {
      throw new Error('The ERP was updated while this page was open. Reload the page (press F5) and try again.');
    }
    throw e;
  }
}

/** Render invoice HTML (A4 / A5) to a PDF Blob in the browser. Nothing is uploaded. */
export async function renderPdf(html, size = 'A4') {
  const [pageW, pageH] = PAGE_MM[size] || PAGE_MM.A4;
  const margin = Number(/@page\s*\{[^}]*margin:\s*([\d.]+)mm/.exec(html)?.[1] ?? 8);
  const contentW = pageW - 2 * margin;
  const contentH = pageH - 2 * margin;

  const [{ jsPDF }, { default: html2canvas }] = await loadPdfLibraries();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin');
  Object.assign(frame.style, {
    position: 'fixed', left: '-10000px', top: '0', border: '0',
    width: `${Math.round(contentW * PX_PER_MM)}px`, height: `${Math.round(contentH * PX_PER_MM)}px`,
  });
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    await doc.fonts?.ready;
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; }))));
    await nextFrame();

    // Capture the whole document (a sheet a hair taller than the page must not lose its bottom
    // border), at 3x (~290 dpi) for crisp text and lines.
    const width = Math.ceil(Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth));
    const height = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
    frame.style.height = `${height}px`;
    await nextFrame();
    const options = { scale: 3, backgroundColor: '#ffffff', logging: false, useCORS: true, width, height, windowWidth: width, windowHeight: height, x: 0, y: 0, scrollX: 0, scrollY: 0 };
    let canvas;
    try {
      // The browser's own layout: text sits in its rows exactly as on screen (html2canvas's own
      // text drawing puts it a little low, onto the cell borders).
      canvas = await html2canvas(doc.documentElement, { ...options, foreignObjectRendering: true });
      if (isBlank(canvas)) throw new Error('blank capture');
    } catch {
      canvas = await html2canvas(doc.body, options);
    }

    const pdf = new jsPDF({ unit: 'mm', format: size.toLowerCase(), orientation: 'portrait', compress: true });
    let mmPerPx = contentW / canvas.width;
    const fullH = canvas.height * mmPerPx;
    // One page that came out up to 4% too tall (rounding, a long address) is shrunk onto the
    // page and centred, instead of spilling a sliver onto page 2.
    if (fullH > contentH && fullH <= contentH * 1.04) {
      mmPerPx = contentH / canvas.height;
      const w = canvas.width * mmPerPx;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, margin, w, contentH, undefined, 'FAST');
      return pdf.output('blob');
    }
    if (fullH <= contentH) {
      // fits: centred across the page, top margin as set by the document
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, contentW, fullH, undefined, 'FAST');
      return pdf.output('blob');
    }
    const pagePx = Math.floor(contentH / mmPerPx);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    for (let y = 0, page = 0; y < canvas.height; y += pagePx, page += 1) {
      const h = Math.min(pagePx, canvas.height - y);
      if (page > 0 && h * mmPerPx < 2) break; // sub-2 mm sliver from layout rounding
      slice.height = h;
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentW, h * mmPerPx, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

export function canShareFiles() {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(['%PDF'])], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/**
 * Open the OS share sheet with the PDF.
 * Returns 'shared' | 'cancelled' | 'unsupported' | 'needs-gesture' (call again from a fresh click).
 */
export async function sharePdf(blob, fileName, { title, text } = {}) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (typeof navigator === 'undefined' || !navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title, text });
    return 'shared';
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
    if (e?.name === 'NotAllowedError') return 'needs-gesture';
    throw e;
  }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', left: '-10000px' });
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy failed — select and copy the link manually');
}

/** WhatsApp (app or web) with the message pre-filled; the user chooses the chat and taps send. */
export function openWhatsAppMessage(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

export const DocumentShareService = {
  renderPdf, sharePdf, canShareFiles, downloadBlob, copyText, openWhatsAppMessage, shareFileName, invoiceShareMessage,
};
