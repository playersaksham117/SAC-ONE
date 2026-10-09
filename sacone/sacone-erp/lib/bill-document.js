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


/* ───────────── classic GST invoice helpers ───────────── */

/** GST state codes → state names (for "P.O.S." and state code boxes). */
export const GST_STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};
const stateCodeOf = (party) => {
  const code = String(party?.gstStateCode || party?.gstNumber?.slice(0, 2) || '').trim();
  return /^\d{2}$/.test(code) ? code : '';
};

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const three = (n) => (n < 100 ? two(n) : `${ONES[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${two(n % 100)}` : ''}`);
function indian(n) {
  if (n < 1000) return three(n);
  if (n < 100000) return `${two(Math.floor(n / 1000))} THOUSAND${n % 1000 ? ` ${three(n % 1000)}` : ''}`;
  if (n < 10000000) return `${two(Math.floor(n / 100000))} LAKH${n % 100000 ? ` ${indian(n % 100000)}` : ''}`;
  return `${indian(Math.floor(n / 10000000))} CRORE${n % 10000000 ? ` ${indian(n % 10000000)}` : ''}`;
}
/** 1180 → "ONE THOUSAND ONE HUNDRED EIGHTY ONLY" (Indian numbering). */
export function amountInWords(amount) {
  const n = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  return `${rupees ? indian(rupees) : 'ZERO'}${paise ? ` AND ${two(paise)} PAISE` : ''} ONLY`;
}

const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
/** 05/10/2026 (dd/mm/yyyy, as on printed GST invoices). */
const ddmmyyyy = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '');

/** Classic grid rows: gross, discount, taxable and the SGST/CGST/IGST split of each line. */
function classicLines(items, interState) {
  return items.map((l) => {
    const gross = r2(Number(l.quantity) * Number(l.unitPrice));
    const taxable = l.taxableAmount != null ? Number(l.taxableAmount) : gross;
    const gst = l.gstAmount != null ? Number(l.gstAmount) : r2(Number(l.lineTotal || 0) - taxable);
    const half = r2(gst / 2);
    return {
      name: l.productName, hsn: l.hsnCode, qty: l.quantity, uom: l.unit || '', rate: l.unitPrice,
      gross, disc: r2(gross - taxable), taxable, gstRate: Number(l.gstPercentage || 0),
      sgst: interState ? 0 : half, cgst: interState ? 0 : r2(gst - half), igst: interState ? r2(gst) : 0,
    };
  });
}

function classicTotals(lines, net) {
  const sum = (k) => r2(lines.reduce((s, l) => s + Number(l[k] || 0), 0));
  return { qty: lines.reduce((s, l) => s + Number(l.qty || 0), 0), gross: sum('gross'), disc: sum('disc'), taxable: sum('taxable'),
    sgst: sum('sgst'), cgst: sum('cgst'), igst: sum('igst'), net: r2(net) };
}

function classicParty(label, name, contact, phone) {
  if (!name) return { label, name: '', lines: [], phone: '', gstin: '', state: '', stateCode: '' };
  const code = stateCodeOf(contact);
  return {
    label, name,
    lines: [contact?.address, [contact?.city, contact?.postalCode].filter(Boolean).join(' ')].filter(Boolean),
    phone: phone || contact?.phone || '',
    gstin: contact?.gstNumber || '',
    state: contact?.state || GST_STATES[code] || '',
    stateCode: code,
  };
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
    classic: saleClassic(sale, customer),
  };
}

function saleClassic(sale, customer) {
  const interState = Number(sale.igstAmount || 0) > 0;
  const lines = classicLines(sale.items || [], interState);
  const walkIn = sale.customerIsWalkIn || !sale.customerName;
  const billTo = walkIn
    ? classicParty('Detail of Receiver (Billed To)', 'CASH', null, '')
    : classicParty('Detail of Receiver (Billed To)', sale.customerName, customer, sale.customerPhone);
  const shipTo = !walkIn && customer?.shippingAddress
    ? classicParty('Detail of Consignee (Shipped To)', sale.customerName, {
      ...customer, address: customer.shippingAddress, city: customer.shippingCity,
      state: customer.shippingState || customer.state, postalCode: customer.shippingPostal,
    }, sale.customerPhone)
    : { ...billTo, label: 'Detail of Consignee (Shipped To)' };
  return {
    kind: 'sale',
    title: 'Tax Invoice',
    memo: sale.paymentStatus === 'paid' ? 'CASH-MEMO' : 'CREDIT MEMO',
    numberLabel: 'Invoice No.',
    number: sale.invoiceNumber,
    date: ddmmyyyy(sale.createdAt),
    billTo,
    shipTo,
    placeOfSupplyCode: billTo.stateCode,
    agent: sale.salesAgentName || '',
    note: sale.notes || '',
    lines,
    totals: classicTotals(lines, sale.grandTotal),
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
    classic: purchaseClassic(kind, spec, doc, supplier),
  };
}

function purchaseClassic(kind, spec, doc, supplier) {
  const interState = Number(doc.igstAmount || 0) > 0;
  const lines = classicLines(doc.items || [], interState);
  const titles = { order: 'Purchase Order', bill: 'Purchase Bill', return: 'Purchase Return' };
  return {
    kind: 'purchase',
    title: titles[kind],
    memo: kind === 'return' ? 'DEBIT NOTE' : '',
    numberLabel: kind === 'order' ? 'PO No.' : kind === 'bill' ? 'Bill No.' : 'Return No.',
    number: doc[spec.numberKey],
    date: ddmmyyyy(doc[spec.dateKey]),
    extraRef: kind === 'bill' && doc.supplierInvoiceNumber ? ['Supplier Inv. No.', doc.supplierInvoiceNumber]
      : kind === 'return' && doc.billNumber ? ['Against Bill', doc.billNumber]
        : kind === 'order' && doc.expectedDate ? ['Expected', dateOnly(doc.expectedDate)] : null,
    billTo: classicParty(kind === 'order' ? 'Supplier (Order To)' : 'Supplier (Billed From)', doc.supplierName, supplier),
    shipTo: null, // filled with our own address at render time
    deliverToWarehouse: doc.warehouseName || '',
    placeOfSupplyCode: '',
    agent: '',
    note: doc.notes || '',
    lines,
    totals: classicTotals(lines, doc.grandTotal),
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


/* ───────────── classic GST tax invoice (A4 / A5), layout type 1 ───────────── */

function classicHtml(model, company, size, invoice = {}) {
  const c = model.classic;
  const a5 = size === 'A5';
  const page = a5 ? { w: 148, h: 210, m: 5 } : { w: 210, h: 297, m: 6 };
  const fs = a5 ? 6.6 : 9.5;
  const n2 = (v) => Number(v || 0).toFixed(2);
  const blankIfZero = (v) => (Number(v) ? n2(v) : '');
  const t = c.totals;
  const companyCode = stateCodeOf(company);
  const ownParty = {
    label: 'Deliver To', name: company?.businessName || '',
    lines: [company?.addressLine1, company?.addressLine2, [company?.city, company?.postalCode].filter(Boolean).join(' '), c.deliverToWarehouse ? `Warehouse: ${c.deliverToWarehouse}` : ''].filter(Boolean),
    phone: company?.phone || '', gstin: company?.gstNumber || '', state: company?.state || GST_STATES[companyCode] || '', stateCode: companyCode,
  };
  const shipTo = c.shipTo || ownParty;
  const posCode = c.placeOfSupplyCode || companyCode;
  const party = (p) => `
    <div class="plabel">${esc(p.label)}</div>
    <div class="pname">${esc(p.name)}</div>
    ${p.lines.map((l) => `<div class="pline">${esc(l)}</div>`).join('')}
    ${p.phone ? `<div class="pline">Mobile: ${esc(p.phone)}</div>` : ''}
    ${p.gstin ? `<div class="pline">GSTIN: ${esc(p.gstin)}</div>` : ''}
    <div class="pstate"><span>State : ${esc(p.state)}</span><span>State Code : ${esc(p.stateCode)}</span></div>`;
  const cols = '<colgroup><col style="width:4%"><col style="width:18%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:8%"><col style="width:3.5%"><col style="width:6.5%"><col style="width:3.5%"><col style="width:6.5%"><col style="width:3.5%"><col style="width:5.5%"></colgroup>';
  const rows = c.lines.map((l, i) => `<tr>
      <td class="c">${i + 1}</td><td class="b">${esc(l.name)}</td><td>${esc(l.hsn || '')}</td>
      <td class="r">${Number(l.qty || 0).toFixed(3)}</td><td>${esc(l.uom)}</td><td class="r b">${n2(l.rate)}</td>
      <td class="r b">${n2(l.gross)}</td><td class="r">${blankIfZero(l.disc)}</td><td class="r b">${n2(l.taxable)}</td>
      <td class="r">${l.sgst ? `${l.gstRate / 2}` : ''}</td><td class="r">${blankIfZero(l.sgst)}</td>
      <td class="r">${l.cgst ? `${l.gstRate / 2}` : ''}</td><td class="r">${blankIfZero(l.cgst)}</td>
      <td class="r">${l.igst ? `${l.gstRate}` : ''}</td><td class="r">${n2(l.igst)}</td></tr>`).join('');
  const emptyRow = '<tr class="fill">' + '<td></td>'.repeat(15) + '</tr>';
  const terms = String(invoice.terms || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const bank = String(invoice.bankDetails || '').trim();
  const signName = company?.businessName || 'SACONE';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.number)}</title>
<style>
  @page{size:${size} portrait;margin:${page.m}mm}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${fs}px;color:#000}
  .sheet{border:1.5px solid #000;min-height:${page.h - 2 * page.m - 1.5}mm;display:flex;flex-direction:column}
  .row{display:flex;border-bottom:1px solid #000} .row>div{padding:${a5 ? '1.5px 3px' : '3px 5px'}}
  .vr{border-right:1px solid #000}
  .b{font-weight:700} .c{text-align:center} .r{text-align:right} .u{text-decoration:underline}
  .head{position:relative;text-align:center;padding:${a5 ? '2px 4px 3px' : '4px 6px 6px'}!important;width:100%}
  .head .gst{position:absolute;left:${a5 ? 3 : 5}px;top:${a5 ? 2 : 4}px;text-align:left;font-weight:700}
  .head .mob{position:absolute;right:${a5 ? 3 : 5}px;top:${a5 ? 2 : 4}px;font-weight:700}
  .head .ttl{font-weight:700;font-size:${fs * 1.3}px}
  .head .firm{font-family:'Times New Roman',Times,serif;font-weight:700;font-size:${a5 ? 18 : 30}px;letter-spacing:.5px;margin:${a5 ? 1 : 2}px 0}
  .plabel{text-align:center;font-weight:700;font-size:${fs * 1.1}px;margin:${a5 ? 2 : 4}px 0 1px}
  .pname{font-weight:700;font-size:${fs * 1.12}px} .pline{font-weight:700}
  .pstate{display:flex;gap:${a5 ? 14 : 30}px;font-weight:700;margin-top:${a5 ? 3 : 8}px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  .items th{font-weight:700;border:1px solid #000;border-top:0;padding:1px 2px;font-size:${fs * 0.95}px;vertical-align:middle}
  .items td{border-left:1px solid #000;border-right:1px solid #000;padding:${a5 ? '1px 1.5px' : '2px 3px'};vertical-align:top;overflow:hidden;word-wrap:break-word}
  .items tr:first-child td{padding-top:${a5 ? 3 : 6}px}
  .grow{flex:1;display:flex;flex-direction:column} .grow table.fillt{flex:1;height:100%}
  .fillt td{border-left:1px solid #000;border-right:1px solid #000}
  .tot td{border:1px solid #000;padding:1px 3px;font-weight:700}
  .kv{display:grid;grid-template-columns:1fr 1fr;column-gap:8px;row-gap:1px}
  .lbl{font-weight:700}
  .net{font-size:${fs * 1.35}px;font-weight:700;display:flex;justify-content:space-between;border-top:1px solid #000;border-bottom:1px solid #000;padding:${a5 ? 2 : 4}px 3px}
  .terms{font-size:${fs * 0.82}px;font-weight:700}
  .sign{display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-weight:700}
  @media print{.sheet{break-inside:auto}}
</style></head><body>
<div class="sheet">
  <div class="row"><div class="head">
    <div class="gst">GSTIN : ${esc(company?.gstNumber || '')}${c.extraRef ? `<br>${esc(c.extraRef[0])} : ${esc(c.extraRef[1])}` : ''}</div>
    <div class="mob">${company?.phone ? `Mobile: ${esc(company.phone)}` : ''}</div>
    <div class="ttl">${esc(c.title)}</div>
    ${c.kind === 'sale' && invoice.copyLabel ? `<div class="u">${esc(invoice.copyLabel)}</div>` : ''}
    ${c.memo ? `<div class="b">${esc(c.memo)}</div>` : ''}
    <div class="firm">${esc(company?.businessName || 'SACONE')}</div>
    <div class="b">${esc([company?.addressLine1, company?.addressLine2].filter(Boolean).join(', '))}</div>
    <div class="b">${esc([company?.city, company?.postalCode ? `PIN - ${company.postalCode}` : '', company?.state].filter(Boolean).join(' '))}</div>
  </div></div>
  <div class="row">
    <div class="vr" style="width:50%">
      <div style="display:flex;justify-content:space-between"><span class="b">${esc(c.numberLabel)} ${esc(c.number)}</span><span class="b">Dated : ${esc(c.date)}</span></div>
      <div class="b">${c.kind === 'sale' ? 'E-Way Bill No. :' : '&nbsp;'}</div>
    </div>
    <div style="width:50%">
      <div class="b">Mode of Transport :</div>
      <div style="display:flex;justify-content:space-between"><span class="b">Vehicle No. :</span><span class="b">Driver :</span></div>
      <div class="b">Goods Dispatch :</div>
    </div>
  </div>
  <div class="row">
    <div class="vr" style="width:50%">${party(c.billTo)}
      ${c.kind === 'sale' ? `<div class="c b" style="margin-top:${a5 ? 2 : 6}px">P.O.S. ${esc(posCode)}${GST_STATES[posCode] ? `-${esc(GST_STATES[posCode])}` : ''}</div>` : ''}
    </div>
    <div style="width:50%">${party(shipTo)}
      ${c.kind === 'sale' ? `<div class="b" style="margin-top:${a5 ? 2 : 6}px">Tax is Payable On Reverse Charge : NO</div>` : ''}
    </div>
  </div>
  <table class="items">${cols}<thead><tr>
    <th rowspan="2">Sr</th><th rowspan="2">Description of Goods</th><th rowspan="2">HSN/<br>SAC<br>code</th>
    <th rowspan="2">Qty.</th><th rowspan="2">UOM</th><th rowspan="2">Rate</th><th rowspan="2">Total<br>Amount</th>
    <th rowspan="2">Disc.</th><th rowspan="2">Taxable<br>Amount <sup>1</sup></th>
    <th colspan="4">Within State Tax</th><th colspan="2">Central Tax</th></tr>
    <tr><th>Tax%</th><th>SGST <sup>2</sup></th><th>Tax%</th><th>CGST <sup>3</sup></th><th>Tax%</th><th>IGST <sup>4</sup></th></tr>
  </thead><tbody>${rows}</tbody></table>
  <div class="grow"><table class="items fillt">${cols}<tbody>${emptyRow}</tbody></table></div>
  <table class="tot">${cols}<tr>
    <td colspan="3">TOTAL :</td><td class="r">${Number(t.qty).toFixed(3)}</td><td></td><td></td>
    <td class="r">${n2(t.gross)}</td><td class="r">${n2(t.disc)}</td><td class="r">${n2(t.taxable)}</td>
    <td></td><td class="r">${n2(t.sgst)}</td><td></td><td class="r">${n2(t.cgst)}</td><td></td><td class="r">${n2(t.igst)}</td></tr></table>
  <div style="display:flex;flex:0 0 auto">
    <div class="vr" style="width:70%;display:flex;flex-direction:column">
      <div style="display:flex;border-bottom:1px solid #000">
        <div class="vr" style="width:65%;padding:${a5 ? '1px 3px' : '2px 5px'}">
          <div class="kv"><span>Order No. :</span><span>Dated :</span><span>Transport :</span><span>Pvt.Mark :</span>
          <span>GR/RR No. :</span><span>Dated :</span><span>Bags : &nbsp; Case : &nbsp; Cartn. :</span><span>Packages. :</span>
          <span>Weight : &nbsp; Loose :</span><span>Freight to Pay :</span></div>
        </div><div style="width:35%"></div>
      </div>
      <div style="border-bottom:1px solid #000;padding:${a5 ? '1px 3px' : '2px 5px'}"><span class="lbl">Amount In Words :</span> <span class="b">${esc(amountInWords(t.net))}</span></div>
      <div style="padding:${a5 ? '1px 3px' : '2px 5px'};flex:1">
        <div class="b">Agent : ${esc(c.agent)}</div>
        <div class="b u">Note:</div><div>${esc(c.note)}</div>
        ${invoice.declaration ? `<div class="c b" style="margin-top:${a5 ? 2 : 4}px">${esc(invoice.declaration)}</div>` : ''}
      </div>
      <div style="display:flex;border-top:1px solid #000">
        <div class="vr b" style="padding:${a5 ? '1px 3px' : '2px 5px'};width:12%">Our's<br>Bankers</div>
        <div class="b u" style="padding:${a5 ? '1px 3px' : '2px 5px'};flex:1">${esc(bank)}</div>
      </div>
      <div style="display:flex;border-top:1px solid #000;flex:1">
        <div class="vr terms" style="width:60%;padding:${a5 ? '1px 3px' : '2px 5px'}">
          <div class="u">Terms &amp; Conditions:-</div>${terms.map((x, i) => `<div>${i + 1}. ${esc(x)}</div>`).join('')}
        </div>
        <div class="b" style="width:40%;display:flex;align-items:flex-end;padding:${a5 ? '1px 3px' : '2px 5px'}">Customer's Signature</div>
      </div>
    </div>
    <div style="width:30%;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;padding:${a5 ? '1px 3px' : '2px 5px'}"><span>Sub-Total (1+2+3+4) :</span><span>${n2(t.taxable + t.sgst + t.cgst + t.igst)}</span></div>
      ${Math.abs(t.net - (t.taxable + t.sgst + t.cgst + t.igst)) >= 0.01 ? `<div style="display:flex;justify-content:space-between;padding:0 ${a5 ? 3 : 5}px"><span>Round Off :</span><span>${n2(t.net - (t.taxable + t.sgst + t.cgst + t.igst))}</span></div>` : ''}
      <div style="flex:1"></div>
      <div class="net"><span>NET AMOUNT :</span><span>${n2(t.net)}</span></div>
      <div class="sign" style="flex:1;min-height:${a5 ? 14 : 26}mm;padding:${a5 ? '2px 3px' : '4px 5px'}">
        <div>For ${esc(signName)}</div><div>Auth.Signatory</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

/** Invoice layouts for A5 / A4. Type 1 is the classic GST grid (default). */
export const LAYOUTS = [
  { value: 'classic', label: '1 · GST classic' },
  { value: 'modern', label: '2 · Modern' },
];

/**
 * Render a document model in the given paper size.
 * options.layout: 'classic' | 'modern' (A5/A4 only); options.invoice: GET /api/settings/invoice.
 */
export function documentHtml(model, company, size, { layout = 'classic', invoice = {} } = {}) {
  if (!isSheet(size)) return thermalHtml(model, company, size);
  return layout === 'modern' || !model.classic ? sheetHtml(model, company, size) : classicHtml(model, company, size, invoice);
}

/** Sales invoice HTML (kept for callers that pass a raw sale). */
export function billHtml(sale, company, customer, size, options) {
  return documentHtml(saleDocument(sale, customer), company, size, options);
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
