'use client';

import { useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { Alert, Modal } from '../ui';


/**
 * Split CSV text into rows of cells: quoted cells may hold commas, quotes ("") and line breaks;
 * the separator (comma, semicolon or tab) is taken from the header line. Blank rows are dropped.
 */
function parseTable(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const nl = src.indexOf('\n');
  const first = nl === -1 ? src : src.slice(0, nl);
  const sep = [',', ';', '\t'].sort((x, y) => first.split(y).length - first.split(x).length)[0];
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** Rows that were skipped or failed: row number, record, reason. */
function IssueTable({ title, items, tone }) {
  if (!items?.length) return null;
  const c = tone === 'red'
    ? { box: 'border-red-200', head: 'bg-red-50 text-red-800', div: 'divide-red-100' }
    : { box: 'border-amber-200', head: 'bg-amber-50 text-amber-800', div: 'divide-amber-100' };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-600">{title} ({items.length})</div>
      <div className={`max-h-56 overflow-auto rounded-lg border ${c.box}`}>
        <table className="min-w-full text-xs">
          <thead className={`text-left ${c.head}`}><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Reason</th></tr></thead>
          <tbody className={`divide-y ${c.div}`}>
            {items.map((e, i) => (
              <tr key={i}><td className="px-3 py-1.5">{e.row}</td><td className="px-3 py-1.5">{[e.name, e.sku].filter(Boolean).join(' · ') || '—'}</td><td className="px-3 py-1.5">{e.message}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Import records from a .csv file (choose or drop) or pasted text, with a preview, a template
 * download and per-row errors. Used for products, customers and suppliers.
 *   endpoint: POST target ({ csv }) returning { created, updated, errors: [{ row, message, ... }] }
 *   columns: known columns (others are shown as ignored); required: must be present (an entry
 *   may be an array of alternative names, e.g. ['name', 'customer_name'])
 *   aliases: extra accepted column names; template: CSV text; help: note under the box
 *   checkFirst: the endpoint accepts { dryRun: true }; "Check file" shows what would be added,
 *   updated and skipped (nothing saved) before the real import
 */
export default function CsvImportDialog({
  title, endpoint, columns, required = [], aliases = [], template, templateName = 'template.csv', noun = 'record', help, checkFirst = false, onClose, onImported,
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [check, setCheck] = useState(null);
  const inputRef = useRef(null);

  const preview = useMemo(() => {
    const lines = parseTable(text);
    if (!lines.length) return null;
    const headers = lines[0].map((h) => h.toLowerCase().trim().replace(/[\s-]+/g, '_'));
    return {
      headers,
      rows: lines.slice(1, 6),
      count: lines.length - 1,
      missing: required.filter((k) => ![].concat(k).some((h) => headers.includes(h))).map((k) => [].concat(k)[0]),
      unknown: headers.filter((h) => h && !columns.includes(h) && !aliases.includes(h)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const readFile = (file) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text/.test(file.type)) {
      setError('Choose a .csv file (in Excel: File → Save As → CSV UTF-8).');
      return;
    }
    if (file.size > 4 * 1024 * 1024) { setError('That file is larger than 4 MB; split it into smaller files.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || '')); setFileName(file.name); setResult(null); setCheck(null); setError(''); };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const submit = async (dryRun = false) => {
    if (!preview?.count) { setError(`Choose a CSV file with a header row and at least one ${noun}.`); return; }
    if (preview.missing.length) { setError(`The file needs these columns: ${preview.missing.join(', ')}`); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(dryRun ? { csv: text, dryRun: true } : { csv: text }) });
      if (dryRun) { setCheck(res); return; }
      setResult(res);
      onImported?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={title}
      onClose={onClose}
      footer={result ? (
        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
      ) : (
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {checkFirst && !check ? (
            <button type="button" className="btn-primary" disabled={saving || !preview?.count || preview.missing.length > 0} onClick={() => submit(true)}>
              {saving ? 'Checking…' : 'Check file'}
            </button>
          ) : checkFirst ? (
            <>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => setCheck(null)}>Back</button>
              <button type="button" className="btn-primary" disabled={saving || !(check.created + check.updated)} onClick={() => submit(false)}>
                {saving ? 'Importing…' : `Import ${check.created + check.updated} ${noun}${check.created + check.updated === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" disabled={saving || !preview?.count || preview.missing.length > 0} onClick={() => submit(false)}>
              {saving ? 'Importing…' : preview?.count ? `Import ${preview.count} ${noun}${preview.count === 1 ? '' : 's'}` : 'Import'}
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        <Alert message={error} />

        {result ? (
          <div className="space-y-3">
            <Alert type="success" message={`Import complete: ${result.created} created, ${result.updated} updated${result.skipped?.length ? `, ${result.skipped.length} skipped` : ''}${result.errors?.length ? `, ${result.errors.length} with errors` : ''}.`} />
            <IssueTable title="Barcode changed (it belonged to another product)" items={result.barcodes} tone="amber" />
            <IssueTable title="Skipped (not imported)" items={result.skipped} tone="amber" />
            <IssueTable title="Errors (not imported)" items={result.errors} tone="red" />
          </div>
        ) : check ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['New', check.created, 'text-emerald-700'], ['Update', check.updated, 'text-sky-700'], ['Skip', check.skipped?.length || 0, 'text-amber-700'], ['Errors', check.errors?.length || 0, 'text-red-700']].map(([l, n, c]) => (
                <div key={l} className="rounded-lg border border-slate-200 px-3 py-2"><div className="text-xs text-slate-500">{l}</div><div className={`text-xl font-semibold ${c}`}>{n}</div></div>
              ))}
            </div>
            <p className="text-xs text-slate-500">Nothing is saved yet. Skipped rows and rows with errors will not be imported: fix them in the file and choose it again, or import the rest.</p>
            <IssueTable title="Barcode will be changed (it belongs to another product)" items={check.barcodes} tone="amber" />
            <IssueTable title="Will be skipped" items={check.skipped} tone="amber" />
            <IssueTable title="Errors" items={check.errors} tone="red" />
          </div>
        ) : (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
            >
              <div className="text-3xl">📄</div>
              <div className="mt-2 font-medium text-slate-800">{fileName || 'Choose a CSV file or drop it here'}</div>
              <div className="mt-1 text-xs text-slate-500">{fileName && preview ? `${preview.count} ${noun} row${preview.count === 1 ? '' : 's'} found · click to choose another` : 'Excel: File → Save As → CSV UTF-8 (.csv)'}</div>
              <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => downloadCsv(templateName, template)}>⬇ Download template</button>
              <button type="button" className="text-slate-500 hover:underline" onClick={() => setPasteOpen((v) => !v)}>{pasteOpen ? 'Hide paste box' : 'Or paste CSV text'}</button>
            </div>

            {pasteOpen && (
              <textarea
                className="input-field min-h-[140px] font-mono text-xs"
                value={text}
                onChange={(e) => { setText(e.target.value); setFileName(''); setResult(null); setCheck(null); }}
                placeholder={`${columns.slice(0, 6).join(',')},...`}
              />
            )}

            {preview && (
              <div className="space-y-2">
                {preview.missing.length > 0 && <Alert message={`Missing required column${preview.missing.length > 1 ? 's' : ''}: ${preview.missing.join(', ')}`} />}
                {preview.unknown.length > 0 && <p className="text-xs text-amber-700">Ignored columns: {preview.unknown.join(', ')}</p>}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>{preview.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((r, i) => (
                        <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{r[j] ?? ''}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.count > preview.rows.length && <p className="text-xs text-slate-500">Showing the first {preview.rows.length} of {preview.count} rows.</p>}
              </div>
            )}

            {help && <p className="text-xs text-slate-500">{help}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
