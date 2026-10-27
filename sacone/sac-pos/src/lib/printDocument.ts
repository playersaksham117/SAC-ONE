import * as Print from 'expo-print';
import { Platform } from 'react-native';

export interface PrintJob {
  html: string;
  /** Page size in points (1 pt = 1/72 inch); omit for receipt rolls (width from the HTML). */
  width?: number;
  height?: number;
  margins?: Print.PageMargins;
}

/**
 * Print an HTML document (bill, receipt, labels). Phones: the system print dialog. SAC-POS web:
 * the document alone in a hidden frame, so the browser prints (or "Save as PDF") the bill and
 * not the app screen; the page size goes in as CSS @page.
 */
export async function printDocument(job: PrintJob): Promise<void> {
  if (Platform.OS !== 'web') {
    await Print.printAsync(job);
    return;
  }
  const pt = (n: number) => `${Math.round((n / 72) * 25.4 * 10) / 10}mm`;
  const m = job.margins;
  const pageCss = `@page { ${job.width && job.height ? `size: ${pt(job.width)} ${pt(job.height)};` : ''} margin: ${m ? `${pt(m.top ?? 0)} ${pt(m.right ?? 0)} ${pt(m.bottom ?? 0)} ${pt(m.left ?? 0)}` : '0'}; }`;
  // A bill that sets its own @page (size + margin) is laid out for exactly that page: adding
  // other margins would push a one-page bill onto a second page.
  const html = /@page\s*\{/.test(job.html)
    ? job.html
    : job.html.includes('</head>')
    ? job.html.replace('</head>', `<style>${pageCss}</style></head>`)
    : `<!doctype html><html><head><meta charset="utf-8"><style>${pageCss}</style></head><body>${job.html}</body></html>`;

  await new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    document.body.appendChild(frame);
    const done = () => { setTimeout(() => frame.remove(), 1000); resolve(); };
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) { done(); return; }
      // images (logo, QR, signature) first, then the print dialog
      const imgs = Array.from(win.document.images);
      Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }))))
        .then(() => {
          win.focus();
          win.print();
          done();
        });
    };
    frame.srcdoc = html;
  });
}
