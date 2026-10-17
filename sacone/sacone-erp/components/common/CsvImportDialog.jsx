'use client';

import { useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { Alert, Modal } from '../ui';


/** Split one CSV line, honouring "quoted, values". */
function cells(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Import records from a .csv file (choose or drop) or pasted text, with a preview, a template
 * download and per-row errors. Used for products, customers and suppliers.
 *   endpoint: POST target ({ csv }) returning { created, updated, errors: [{ row, message, ... }] }
 *   columns: known columns (others are shown as ignored); required: must be present (an entry
 *   may be an array of alternative names, e.g. ['name', 'customer_name'])
 *   aliases: extra accepted column names; template: CSV text; help: note under the box
 */
export default function CsvImportDialog({
  title, endpoint, columns, required = [], aliases = [], template, templateName = 'template.csv', noun = 'record', help, onClose, onImported,
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const preview = useMemo(() => {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
    if (!lines.length) return null;
    const headers = cells(lines[0]).map((h) => h.toLowerCase().trim().replace(/[\s-]+/g, '_'));
    return {
      headers,
      rows: lines.slice(1, 6).map(cells),
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
    reader.onload = () => { setText(String(reader.result || '')); setFileName(file.name); setResult(null); setError(''); };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!preview?.count) { setError(`Choose a CSV file with a header row and at least one ${noun}.`); return; }
    if (preview.missing.length) { setError(`The file needs these columns: ${preview.missing.join(', ')}`); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({ csv: text }) });
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
          <button type="button" className="btn-primary" disabled={saving || !preview?.count || preview.missing.length > 0} onClick={submit}>
            {saving ? 'Importing…' : preview?.count ? `Import ${preview.count} ${noun}${preview.count === 1 ? '' : 's'}` : 'Import'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <Alert message={error} />

        {result ? (
          <div className="space-y-3">
            <Alert type="success" message={`Import complete: ${result.created} created, ${result.updated} updated${result.errors?.length ? `, ${result.errors.length} with errors` : ''}.`} />
            {result.errors?.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-red-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-red-50 text-left text-red-800"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Problem</th></tr></thead>
                  <tbody className="divide-y divide-red-100">
                    {result.errors.map((e, i) => (
                      <tr key={i}><td className="px-3 py-1.5">{e.row}</td><td className="px-3 py-1.5 font-mono">{e.sku || e.name || '—'}</td><td className="px-3 py-1.5">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                onChange={(e) => { setText(e.target.value); setFileName(''); setResult(null); }}
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
