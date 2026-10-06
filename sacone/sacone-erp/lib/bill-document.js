/**
 * Printable business documents for the ERP, matching SAC-POS:
 *   58mm / 80mm  thermal receipts (print only)
 *   A5 / A4      document sheets (print and PDF)
 * PDFs come from the browser's print dialog ("Save as PDF") at the exact page size.
 *
 * Every document (sales invoice, purchase order, purchase bill, purchase return) is first
 * mapped to one model, then rendered by the same two layouts:
 *   { title, number, date, meta: [[label, value]], partyLabel, party, partyFallback,
 *     sideBox: { label, rows: [[label, amount]] }, items: [{ name, hsn, qty, rate, discount,
 *     taxable, gstRate, amount }], totals: [[label, amount, grand?]], footer, thanks }
 */

export const PRINT_SIZES = [
  { value: '58mm', label: '58 mm' },
  { value: '80mm', label: '80 mm' },
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
];
export const PDF_SIZES = [
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
];

const isSheet = (size) => size === 'A5' || size === 'A4';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '');
const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');

const METHOD = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', card: 'Card', credit: 'Credit (due)' };

function companyAddress(company) {
  return [company?.addressLine1, company?.addressLine2, company?.city, company?.state, company?.postalCode]
    .filter(Boolean).map(esc).join(', ');
}

function gstRows(doc) {
  if (doc.igstAmount > 0) return [['IGST', doc.igstAmount]];
  if (doc.cgstAmount > 0 || doc.sgstAmount > 0) return [['CGST', doc.cgstAmount], ['SGST', doc.sgstAmount]];
  return doc.gstAmount > 0 ? [['GST', doc.gstAmount]] : [];
}

function partyFrom(name, contact) {
  if (!name) return null;
  return { name, phone: contact?.phone, address: [contact?.address, contact?.city, contact?.state].filter(Boolean).join(', '), gstin: contact?.gstNumber };
}

/* ───────────── mappers ───────────── */

/** Sales invoice (GET /api/pos/sales/:id) + optional customer record. */
export function saleDocument(sale, customer) {
  const discount = Number(sale.itemDiscountTotal || 0) + Number(sale.invoiceDiscount || 0);
  const payments = (sale.payments || []).map((p) => [`${METHOD[p.method] || p.method}${p.reference ? ` (${p.reference})` : ''}`, p.amount]);
  if (sale.amountCredit > 0) payments.push(['Balance due', sale.amountCredit]);
  return {
    title: 'TAX INVOICE',
    number: sale.invoiceNumber,
    date: when(sale.createdAt),
    meta: [['Invoice', sale.invoiceNumber], ['Date', when(sale.createdAt)], ...(sale.createdByName ? [['Cashier', sale.createdByName]] : [])],
    partyLabel: 'Bill to',
    party: sale.customerIsWalkIn ? null : partyFrom(sale.customerName, { ...customer, phone: sale.customerPhone || customer?.phone }),
    partyFallback: 'Walk-in customer',
    sideBox: { label: 'Payment', rows: payments },
    items: (sale.items || []).map((l) => ({
      name: l.productName, hsn: l.hsnCode, qty: l.quantity, rate: l.unitPrice,
      discount: l.discountAmount ? money(l.discountAmount) : null,
      taxable: l.taxableAmount, gstRate: l.gstPercentage, amount: l.lineTotal,
    })),
    totals: [
      ['Subtotal', sale.subtotal],
      ...(discount > 0 ? [['Discount', -discount]] : []),
      ['Taxable value', sale.taxableAmount],
      ...gstRows(sale),
      ['Total', sale.grandTotal, true],
    ],
    footer: 'Thank you for your business. This is a computer-generated invoice.',
    thanks: 'Thank you! Visit again.',
  };
}

const PURCHASE = {
  order: { title: 'PURCHASE ORDER', numberKey: 'poNumber', dateKey: 'orderDate', footer: 'Please supply the items above at the rates shown. Quote the PO number on your invoice.' },
  bill: { title: 'PURCHASE BILL', numberKey: 'billNumber', dateKey: 'billDate', footer: 'Goods received against the supplier invoice shown above.' },
  return: { title: 'PURCHASE RETURN · DEBIT NOTE', numberKey: 'returnNumber', dateKey: 'returnDate', footer: 'Goods returned to the supplier; amount to be adjusted against the bill shown.' },
};

/** Purchase order / bill / return (GET /api/purchases/{orders|bills|returns}/:id) + supplier record. */
export function purchaseDocument(kind, doc, supplier) {
  const spec = PURCHASE[kind];
  const meta = [[kind === 'order' ? 'PO' : kind === 'bill' ? 'Bill' : 'Return', doc[spec.numberKey]], ['Date', dateOnly(doc[spec.dateKey])]];
  if (kind === 'order' && doc.expectedDate) meta.push(['Expected', dateOnly(doc.expectedDate)]);
  if (kind === 'bill' && doc.supplierInvoiceNumber) meta.push(['Supplier inv.', doc.supplierInvoiceNumber]);
  if (kind === 'bill' && doc.poNumber) meta.push(['PO', doc.poNumber]);
  if (kind === 'return' && doc.billNumber) meta.push(['Against bill', doc.billNumber]);
  if (doc.warehouseName) meta.push(['Warehouse', doc.warehouseName]);

  const side = kind === 'bill'
    ? { label: 'Payment', rows: [['Paid', doc.amountPaid], ['Payable', doc.amountPayable], ...(doc.dueDate ? [[`Due ${dateOnly(doc.dueDate)}`, null]] : [])] }
    : { label: 'Status', rows: [[String(doc.status || '').replace(/_/g, ' '), null]] };

  const taxable = (doc.items || []).reduce((s, l) => s + Number(l.taxableAmount ?? 0), 0);
  return {
    title: spec.title,
    number: doc[spec.numberKey],
    date: dateOnly(doc[spec.dateKey]),
    meta,
    partyLabel: 'Supplier',
    party: partyFrom(doc.supplierName, supplier),
    partyFallback: '—',
    sideBox: side,
    items: (doc.items || []).map((l) => ({
      name: l.productName, hsn: l.hsnCode, qty: l.quantity, rate: l.unitPrice,
      discount: l.discountPercent ? `${l.discountPercent}%` : null,
      taxable: l.taxableAmount ?? null, gstRate: l.gstPercentage, amount: l.lineTotal,
    })),
    totals: [
      ...(taxable > 0 ? [['Taxable value', taxable]] : [['Subtotal', doc.subtotal]]),
      ...gstRows(doc),
      ['Total', doc.grandTotal, true],
    ],
    footer: spec.footer,
    thanks: '',
  };
}

/* ───────────── layouts ───────────── */

function amountCell(value) {
  return value === null || value === undefined ? '' : (value < 0 ? `−${money(-value)}` : money(value));
}

function thermalHtml(model, company, size) {
  const narrow = size === '58mm';
  const rows = model.items.map((l) => `
    <tr><td colspan="3" class="name">${esc(l.name)}${l.hsn && !narrow ? ` <span class="muted">HSN ${esc(l.hsn)}</span>` : ''}</td></tr>
    <tr><td>${qty(l.qty)} × ${money(l.rate)}${l.discount ? ` −${esc(l.discount)}` : ''}</td>
        <td class="muted">${l.gstRate ?? 0}%</td><td class="r">${money(l.amount)}</td></tr>`).join('');
  const party = model.party
    ? `<tr><td>${esc(model.partyLabel)}</td><td class="r">${esc(model.party.name)}${model.party.phone ? `<br>${esc(model.party.phone)}` : ''}${model.party.gstin ? `<br>GSTIN ${esc(model.party.gstin)}` : ''}</td></tr>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(model.number)}</title>
<style>
  @page{margin:0}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${narrow ? 10 : 12}px;color:#000;margin:0;width:${size};padding:${narrow ? '2mm' : '3mm'}}
  h1{font-size:${narrow ? 13 : 16}px;margin:0 0 2px;text-align:center} .c{text-align:center} .muted{color:#333;font-size:${narrow ? 9 : 11}px}
  table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top} .r{text-align:right;white-space:nowrap}
  .name{padding-top:5px;font-weight:600;word-break:break-word} hr{border:0;border-top:1px dashed #000;margin:6px 0}
  .total td{font-size:${narrow ? 13 : 15}px;font-weight:700;padding-top:3px}
</style></head><body>
  <h1>${esc(company?.businessName || 'SACONE')}</h1>
  ${companyAddress(company) ? `<div class="c muted">${companyAddress(company)}</div>` : ''}
  ${company?.gstNumber ? `<div class="c muted">GSTIN ${esc(company.gstNumber)}</div>` : ''}
  ${company?.phone ? `<div class="c muted">Ph ${esc(company.phone)}</div>` : ''}
  <hr><div class="c"><b>${esc(model.title)}</b></div>
  <table>${model.meta.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`).join('')}${party}</table><hr>
  <table>${rows}</table><hr>
  <table>${model.totals.map(([k, v, grand]) => `<tr${grand ? ' class="total"' : ''}><td>${esc(grand ? String(k).toUpperCase() : k)}</td><td class="r">${amountCell(v)}</td></tr>`).join('')}</table>
  ${model.sideBox?.rows.length ? `<hr><table>${model.sideBox.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${amountCell(v)}</td></tr>`).join('')}</table>` : ''}
  ${model.thanks ? `<hr><div class="c muted">${esc(model.thanks)}</div>` : ''}
</body></html>`;
}

function sheetHtml(model, company, size) {
  const a5 = size === 'A5';
  const items = model.items;
  const anyDiscount = items.some((l) => l.discount);
  const showTaxable = !a5 && items.some((l) => l.taxable !== null && l.taxable !== undefined);
  const rows = items.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.name)}${l.hsn ? `<div class="muted">HSN ${esc(l.hsn)}</div>` : ''}</td>
      <td class="r">${qty(l.qty)}</td>
      <td class="r">${money(l.rate)}</td>
      ${anyDiscount ? `<td class="r">${l.discount ? esc(l.discount) : '—'}</td>` : ''}
      ${showTaxable ? `<td class="r">${l.taxable !== null && l.taxable !== undefined ? money(l.taxable) : ''}</td>` : ''}
      <td class="r">${l.gstRate ?? 0}%</td>
      <td class="r b">${money(l.amount)}</td>
    </tr>`).join('');
  const p = model.party;
  const partyHtml = p
    ? `<div class="b">${esc(p.name)}</div>${p.phone ? `<div>${esc(p.phone)}</div>` : ''}${p.address ? `<div>${esc(p.address)}</div>` : ''}${p.gstin ? `<div>GSTIN ${esc(p.gstin)}</div>` : ''}`
    : `<div class="b">${esc(model.partyFallback)}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(model.number)}</title>
<style>
  @page{size:${size} portrait;margin:${a5 ? '8mm' : '12mm'}}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${a5 ? 10 : 12}px;color:#111;margin:0}
  h1{font-size:${a5 ? 16 : 20}px;margin:0} h2{font-size:${a5 ? 12 : 14}px;margin:0;letter-spacing:.08em}
  .muted{color:#555;font-size:${a5 ? 9 : 10.5}px} .b{font-weight:700} .c{text-align:center} .r{text-align:right;white-space:nowrap}
  .head{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #111;padding-bottom:8px}
  .meta td{padding:1px 0 1px 10px}
  .party{display:flex;justify-content:space-between;gap:12px;margin:10px 0}
  .party .box{flex:1;border:1px solid #ccc;border-radius:4px;padding:6px 8px}
  .label{font-size:${a5 ? 8.5 : 9.5}px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:2px}
  table{width:100%;border-collapse:collapse}
  .items th{background:#f1f3f5;font-size:${a5 ? 9 : 10.5}px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:5px 4px;border-bottom:1px solid #999}
  .items th.r{text-align:right} .items td{padding:5px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  .items tr{page-break-inside:avoid}
  .bottom{display:flex;justify-content:space-between;gap:16px;margin-top:10px;page-break-inside:avoid}
  .sum{width:${a5 ? '55%' : '45%'}} .sum td{padding:2px 0} .grand td{border-top:2px solid #111;font-size:${a5 ? 13 : 15}px;font-weight:700;padding-top:5px}
  .foot{margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;page-break-inside:avoid}
  .sign{border-top:1px solid #555;padding-top:4px;min-width:140px;text-align:center}
  .cap{text-transform:capitalize}
  @media print{.items th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
  <div class="head">
    <div>
      <h1>${esc(company?.businessName || 'SACONE')}</h1>
      ${companyAddress(company) ? `<div class="muted">${companyAddress(company)}</div>` : ''}
      ${company?.phone ? `<div class="muted">Ph ${esc(company.phone)}</div>` : ''}
      ${company?.gstNumber ? `<div class="muted">GSTIN <b>${esc(company.gstNumber)}</b>${company.gstStateCode ? ` · State ${esc(company.gstStateCode)}` : ''}</div>` : ''}
    </div>
    <div class="r">
      <h2>${esc(model.title)}</h2>
      <table class="meta">${model.meta.map(([k, v], i) => `<tr><td class="muted">${esc(k)}</td><td class="r${i === 0 ? ' b' : ''}">${esc(v)}</td></tr>`).join('')}</table>
    </div>
  </div>
  <div class="party">
    <div class="box"><div class="label">${esc(model.partyLabel)}</div>${partyHtml}</div>
    ${model.sideBox ? `<div class="box"><div class="label">${esc(model.sideBox.label)}</div><table>${model.sideBox.rows.map(([k, v]) => `<tr><td class="cap">${esc(k)}</td><td class="r">${amountCell(v)}</td></tr>`).join('')}</table></div>` : ''}
  </div>
  <table class="items">
    <thead><tr>
      <th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>
      ${anyDiscount ? '<th class="r">Disc</th>' : ''}${showTaxable ? '<th class="r">Taxable</th>' : ''}<th class="r">GST</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="muted">${items.length} item${items.length === 1 ? '' : 's'} · ${qty(items.reduce((s, l) => s + Number(l.qty || 0), 0))} qty</div>
    <table class="sum">${model.totals.map(([k, v, grand]) => `<tr${grand ? ' class="grand"' : ''}><td>${esc(k)}</td><td class="r">${amountCell(v)}</td></tr>`).join('')}</table>
  </div>
  <div class="foot">
    <div class="muted">${esc(model.footer)}</div>
    <div class="sign muted">For ${esc(company?.businessName || 'SACONE')}<br><br>Authorised signatory</div>
  </div>
</body></html>`;
}

/** Render a document model in the given paper size. */
export function documentHtml(model, company, size) {
  return isSheet(size) ? sheetHtml(model, company, size) : thermalHtml(model, company, size);
}

/** Sales invoice HTML (kept for callers that pass a raw sale). */
export function billHtml(sale, company, customer, size) {
  return documentHtml(saleDocument(sale, customer), company, size);
}

/** Print HTML through a hidden frame; the dialog's "Save as PDF" destination gives the PDF. */
export function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    // Some browsers never fire afterprint for iframes.
    setTimeout(cleanup, 60_000);
  }, 250);
}
