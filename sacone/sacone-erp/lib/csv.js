/**
 * CSV export that opens cleanly in Excel / Google Sheets (UTF-8 with BOM, RFC 4180 quoting).
 * columns: [{ label: 'Invoice', value: (row) => row.invoiceNumber }, ...]
 */
export function toCsv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Leading = + - @ would run as a formula in Excel; prefix with a quote.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return lines.join('\r\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
