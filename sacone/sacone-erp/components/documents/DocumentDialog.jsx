'use client';

import { useEffect, useState } from 'react';
import { PDF_SIZES, PRINT_SIZES, printHtml } from '../../lib/bill-document';
import { downloadCsv, toCsv } from '../../lib/csv';
import { Alert, LoadingState, Modal } from '../ui';

/** Per-browser remembered choice (paper size), guarded because storage can be unavailable. */
function useStoredChoice(key, fallback, allowed) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && allowed.includes(saved)) setValue(saved);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (next) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
  };
  return [value, update];
}

export const ITEM_CSV_COLUMNS = [
  { label: '#', value: (l) => l.index },
  { label: 'Item', value: (l) => l.productName },
  { label: 'SKU', value: (l) => l.sku },
  { label: 'HSN', value: (l) => l.hsnCode },
  { label: 'Qty', value: (l) => l.quantity },
  { label: 'Rate', value: (l) => l.unitPrice },
  { label: 'Discount', value: (l) => l.discountAmount ?? (l.discountPercent ? `${l.discountPercent}%` : '') },
  { label: 'Taxable', value: (l) => l.taxableAmount },
  { label: 'GST %', value: (l) => l.gstPercentage },
  { label: 'GST', value: (l) => l.gstAmount },
  { label: 'Amount', value: (l) => l.lineTotal },
];

/**
 * Print (58mm / 80mm / A5 / A4), Save PDF (A5 / A4) and line-item CSV for one document.
 *   load(): Promise<{ summary: [[label, value]], html: (size) => string, items: [], csvName }>
 */
export default function DocumentDialog({ title, load, onClose, documentLabel = 'invoice' }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [printSize, setPrintSize] = useStoredChoice('sacone.printSize', 'A4', PRINT_SIZES.map((p) => p.value));
  const [pdfSize, setPdfSize] = useStoredChoice('sacone.pdfSize', 'A4', PDF_SIZES.map((p) => p.value));

  useEffect(() => {
    let cancelled = false;
    load().then((d) => { if (!cancelled) setDoc(d); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsCsv = () => downloadCsv(
    `${doc.csvName}-items.csv`,
    toCsv((doc.items || []).map((l, i) => ({ ...l, index: i + 1 })), ITEM_CSV_COLUMNS),
  );

  return (
    <Modal open title={title} onClose={onClose} size="lg">
      <Alert message={error} />
      {!doc ? (!error && <LoadingState />) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {doc.summary.map(([label, value]) => (
              <div key={label}><div className="text-xs text-slate-500">{label}</div><div className="font-medium">{value}</div></div>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Print</h4>
            <div className="flex flex-wrap gap-2">
              {PRINT_SIZES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPrintSize(p.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${printSize === p.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary mt-3 w-full sm:w-auto" onClick={() => printHtml(doc.html(printSize))}>
              🖨 Print {PRINT_SIZES.find((p) => p.value === printSize)?.label} {printSize.endsWith('mm') ? 'receipt' : documentLabel}
            </button>
            {printSize.endsWith('mm') && (
              <p className="mt-2 text-xs text-slate-500">Choose your thermal printer and its {printSize} paper in the print dialog.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">PDF</h4>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {PDF_SIZES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPdfSize(p.value)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium ${pdfSize === p.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-secondary" onClick={() => printHtml(doc.html(pdfSize))}>📄 Save PDF</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">In the dialog that opens, pick <b>Save as PDF</b> as the destination.</p>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">CSV</h4>
              <p className="text-xs text-slate-500">Line items with HSN, quantity, rate, discount and GST.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={itemsCsv}>⬇ Items CSV</button>
          </section>
        </div>
      )}
    </Modal>
  );
}
