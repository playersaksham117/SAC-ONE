'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { printHtml } from '../../lib/bill-document';
import { barcodeValue, LABEL_FIELDS, LABEL_SIZES, labelSettingsFrom, labelsHtml } from '../../lib/labels';
import { Alert, LoadingState, Modal } from '../ui';

/** Print barcode labels for the selected products: size, copies per product, details (from Settings). */
export default function LabelPrintDialog({ products, onClose }) {
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [size, setSize] = useState('50x25');
  const [fields, setFields] = useState([]);
  const [copies, setCopies] = useState(() => Object.fromEntries(products.map((p) => [p.id, 1])));
  const [all, setAll] = useState('1');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest('/api/settings').catch(() => []),
      apiRequest('/api/company').catch(() => null),
    ]).then(([list, comp]) => {
      const s = labelSettingsFrom(Array.isArray(list) ? list : []);
      setSettings(s);
      setSize(s.size);
      setFields(s.fields);
      setCompany(comp);
    });
  }, []);

  const items = products.map((p) => ({ product: p, copies: Number(copies[p.id]) || 0 }));
  const total = items.reduce((s, i) => s + i.copies, 0);
  const noCode = products.filter((p) => !barcodeValue(p));
  const sizeInfo = LABEL_SIZES.find((s) => s.value === size);
  const html = useMemo(
    () => (settings ? labelsHtml(items, { size, fields, company, footer: settings.footer }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, size, fields, company, JSON.stringify(copies)],
  );
  // One label at actual size: the print HTML without its page rules / sheet layout.
  const previewDoc = settings && products[0]
    ? labelsHtml([{ product: products[0], copies: 1 }], { size, fields, company, footer: settings.footer })
      .replace('</style>', 'html,body{overflow:hidden}</style>').replace(/@page\{[^}]*\}/, '').replace(/\.sheet\{[^}]*\}/, '.sheet{display:block}')
    : '';

  const toggle = (key) => setFields((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));
  const print = () => {
    if (!total) { setError('Set at least one label to print.'); return; }
    if (total > 2000) { setError('That is more than 2000 labels; print in smaller batches.'); return; }
    printHtml(html);
  };

  return (
    <Modal
      open
      size="xl"
      title={`Print barcode labels · ${products.length} product${products.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" disabled={!settings || !total} onClick={print}>🖨 Print {total} label{total === 1 ? '' : 's'}</button>
        </>
      )}
    >
      {!settings ? <LoadingState /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <Alert message={error} />
            <label className="block text-sm"><span className="label">Label size</span>
              <select className="input-field" value={size} onChange={(e) => setSize(e.target.value)}>
                <optgroup label="Label printer rolls (one label per page)">
                  {LABEL_SIZES.filter((s) => !s.cols).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </optgroup>
                <optgroup label="A4 label sheets">
                  {LABEL_SIZES.filter((s) => s.cols).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </optgroup>
              </select>
            </label>
            <div>
              <span className="label">Show on the label</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {LABEL_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fields.includes(key)} onChange={() => toggle(key)} />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Defaults come from Settings → Barcode labels; changes here apply to this print only.</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="label !mb-0">Copies</span>
                <span className="flex items-center gap-1 text-xs">
                  All
                  <input type="number" min="0" max="500" className="input-field !min-h-0 w-16 !py-1 text-right" value={all} onChange={(e) => setAll(e.target.value)} />
                  <button type="button" className="btn-secondary !min-h-0 !px-2 !py-1 text-xs" onClick={() => setCopies(Object.fromEntries(products.map((p) => [p.id, Number(all) || 0])))}>Set</button>
                </span>
              </div>
              <div className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{barcodeValue(p) || 'no barcode / SKU'}</div>
                    </div>
                    <input
                      type="number" min="0" max="500"
                      className="input-field !min-h-0 w-20 !py-1 text-right"
                      value={copies[p.id] ?? 0}
                      onChange={(e) => setCopies({ ...copies, [p.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              {noCode.length > 0 && <p className="mt-1 text-xs text-amber-700">{noCode.length} product(s) have no barcode or SKU, so no bars print for them.</p>}
            </div>
          </div>

          <div>
            <span className="label">Preview (first label, actual size)</span>
            <div className="flex min-h-[160px] items-center justify-center rounded-lg bg-slate-100 p-4">
              <iframe
                title="Label preview"
                srcDoc={previewDoc}
                style={{ width: `${sizeInfo?.w || 50}mm`, height: `${sizeInfo?.h || 25}mm`, background: '#fff', border: 0, outline: '1px dashed #94a3b8' }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {sizeInfo?.cols
                ? `A4 sheet: ${sizeInfo.cols} × ${sizeInfo.rows} labels per page. In the print dialog choose A4, scale 100% (no "fit to page"), margins none.`
                : `Label printer: choose your label printer and set the paper to ${sizeInfo?.w} × ${sizeInfo?.h} mm, scale 100%.`}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
