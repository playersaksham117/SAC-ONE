import { AppError } from './http.js';

/**
 * Parse CSV text from a file or paste (Excel "CSV UTF-8" included): drops the byte-order mark,
 * handles "quoted, values", doubled "" quotes and line breaks inside quotes, and normalises
 * headers ("Selling Price" / "selling-price" → selling_price).
 * Returns { headers, rows: [{ line, data: { header: value } }] } skipping blank lines.
 */
export function parseCsv(text, { required = [] } = {}) {
  const src = String(text || '').replace(/^﻿/, '');
  if (!src.trim()) throw new AppError('CSV content is required', 400);

  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false;
      else { if (ch === '\n') line += 1; field += ch; }
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      record.push(field.trim());
      records.push({ line: recordLine, cells: record });
      record = []; field = ''; line += 1; recordLine = line;
    } else field += ch;
  }
  if (field !== '' || record.length) { record.push(field.trim()); records.push({ line: recordLine, cells: record }); }

  const nonEmpty = records.filter((r) => r.cells.some((c) => c !== ''));
  if (nonEmpty.length < 2) throw new AppError('CSV must include a header and at least one row', 400);
  const headers = nonEmpty[0].cells.map((h) => h.toLowerCase().trim().replace(/[\s-]+/g, '_'));
  for (const key of required) { // an entry may be [name, ...alternatives]
    const names = [].concat(key);
    if (!names.some((h) => headers.includes(h))) throw new AppError(`CSV missing required column: ${names[0]}`, 400);
  }
  return {
    headers,
    rows: nonEmpty.slice(1).map((r) => ({ line: r.line, data: Object.fromEntries(headers.map((h, i) => [h, r.cells[i] ?? ''])) })),
  };
}

/** "1", "yes", "true", "y" → true; "0", "no", "false", "n" → false; else the fallback. */
export function csvBool(value, fallback) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['1', 'yes', 'true', 'y'].includes(v)) return true;
  if (['0', 'no', 'false', 'n'].includes(v)) return false;
  return fallback;
}

/** Number from a CSV cell ("1,500.50", "₹ 200"), or undefined when blank. */
export function csvNumber(value) {
  const v = String(value ?? '').replace(/[₹,\s]/g, '');
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AppError(`"${value}" is not a number`, 400);
  return n;
}
