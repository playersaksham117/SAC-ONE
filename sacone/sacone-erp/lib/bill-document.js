/**
 * Printable sales invoices for the ERP, matching SAC-POS:
 *   58mm / 80mm  thermal receipts (print only)
 *   A5 / A4      tax-invoice sheets (print and PDF)
 * PDFs come from the browser's print dialog ("Save as PDF") at the exact page size.
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
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '');

const METHOD = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', card: 'Card', credit: 'Credit (due)' };

function companyAddress(company) {
  return [company?.addressLine1, company?.addressLine2, company?.city, company?.state, company?.postalCode]
    .filter(Boolean).map(esc).join(', ');
}

function taxRows(sale) {
  return sale.igstAmount > 0
    ? `<tr><td>IGST</td><td class="r">${money(sale.igstAmount)}</td></tr>`
    : `<tr><td>CGST</td><td class="r">${money(sale.cgstAmount)}</td></tr><tr><td>SGST</td><td class="r">${money(sale.sgstAmount)}</td></tr>`;
}

function paymentRows(sale) {
  const rows = (sale.payments || []).map((p) => `<tr><td>${esc(METHOD[p.method] || p.method)}${p.reference ? ` (${esc(p.reference)})` : ''}</td><td class="r">${money(p.amount)}</td></tr>`).join('');
  const due = sale.amountCredit > 0 ? `<tr><td>Balance due</td><td class="r">${money(sale.amountCredit)}</td></tr>` : '';
  return rows + due;
}

const discountTotal = (sale) => Number(sale.itemDiscountTotal || 0) + Number(sale.invoiceDiscount || 0);

function thermalHtml(sale, company, customer, size) {
  const narrow = size === '58mm';
  const rows = (sale.items || []).map((l) => `
    <tr><td colspan="3" class="name">${esc(l.productName)}${l.hsnCode && !narrow ? ` <span class="muted">HSN ${esc(l.hsnCode)}</span>` : ''}</td></tr>
    <tr><td>${qty(l.quantity)} × ${money(l.unitPrice)}${l.discountAmount ? ` −${money(l.discountAmount)}` : ''}</td>
        <td class="muted">${l.gstPercentage}%</td><td class="r">${money(l.lineTotal)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.invoiceNumber)}</title>
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
  <hr><div class="c"><b>TAX INVOICE</b></div>
  <table><tr><td>Bill</td><td class="r">${esc(sale.invoiceNumber)}</td></tr>
  <tr><td>Date</td><td class="r">${when(sale.createdAt)}</td></tr>
  ${sale.createdByName ? `<tr><td>Cashier</td><td class="r">${esc(sale.createdByName)}</td></tr>` : ''}
  ${!sale.customerIsWalkIn && sale.customerName ? `<tr><td>Customer</td><td class="r">${esc(sale.customerName)}${sale.customerPhone ? `<br>${esc(sale.customerPhone)}` : ''}${customer?.gstNumber ? `<br>GSTIN ${esc(customer.gstNumber)}` : ''}</td></tr>` : ''}
  </table><hr>
  <table>${rows}</table><hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${money(sale.subtotal)}</td></tr>
    ${discountTotal(sale) > 0 ? `<tr><td>Discount</td><td class="r">−${money(discountTotal(sale))}</td></tr>` : ''}
    <tr><td>Taxable</td><td class="r">${money(sale.taxableAmount)}</td></tr>
    ${taxRows(sale)}
    <tr class="total"><td>TOTAL</td><td class="r">${money(sale.grandTotal)}</td></tr>
  </table><hr>
  <table>${paymentRows(sale)}</table>
  <hr><div class="c muted">Thank you! Visit again.</div>
</body></html>`;
}

function sheetHtml(sale, company, customer, size) {
  const a5 = size === 'A5';
  const items = sale.items || [];
  const anyDiscount = items.some((l) => l.discountAmount > 0);
  const rows = items.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.productName)}${l.hsnCode ? `<div class="muted">HSN ${esc(l.hsnCode)}</div>` : ''}</td>
      <td class="r">${qty(l.quantity)}</td>
      <td class="r">${money(l.unitPrice)}</td>
      ${anyDiscount ? `<td class="r">${l.discountAmount ? money(l.discountAmount) : '—'}</td>` : ''}
      ${a5 ? '' : `<td class="r">${money(l.taxableAmount)}</td>`}
      <td class="r">${l.gstPercentage}%</td>
      <td class="r b">${money(l.lineTotal)}</td>
    </tr>`).join('');
  const billTo = !sale.customerIsWalkIn && sale.customerName
    ? `<div class="b">${esc(sale.customerName)}</div>${sale.customerPhone ? `<div>${esc(sale.customerPhone)}</div>` : ''}${customer?.address ? `<div>${esc(customer.address)}</div>` : ''}${customer?.gstNumber ? `<div>GSTIN ${esc(customer.gstNumber)}</div>` : ''}`
    : '<div class="b">Walk-in customer</div>';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.invoiceNumber)}</title>
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
      <h2>TAX INVOICE</h2>
      <table class="meta"><tr><td class="muted">Invoice</td><td class="b r">${esc(sale.invoiceNumber)}</td></tr>
      <tr><td class="muted">Date</td><td class="r">${when(sale.createdAt)}</td></tr>
      ${sale.createdByName ? `<tr><td class="muted">Cashier</td><td class="r">${esc(sale.createdByName)}</td></tr>` : ''}</table>
    </div>
  </div>
  <div class="party">
    <div class="box"><div class="label">Bill to</div>${billTo}</div>
    <div class="box"><div class="label">Payment</div><table>${paymentRows(sale)}</table></div>
  </div>
  <table class="items">
    <thead><tr>
      <th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>
      ${anyDiscount ? '<th class="r">Disc</th>' : ''}${a5 ? '' : '<th class="r">Taxable</th>'}<th class="r">GST</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="muted">${items.length} item${items.length === 1 ? '' : 's'} · ${qty(items.reduce((s, l) => s + l.quantity, 0))} qty</div>
    <table class="sum">
      <tr><td>Subtotal</td><td class="r">${money(sale.subtotal)}</td></tr>
      ${discountTotal(sale) > 0 ? `<tr><td>Discount</td><td class="r">−${money(discountTotal(sale))}</td></tr>` : ''}
      <tr><td>Taxable value</td><td class="r">${money(sale.taxableAmount)}</td></tr>
      ${taxRows(sale)}
      <tr class="grand"><td>Total</td><td class="r">${money(sale.grandTotal)}</td></tr>
    </table>
  </div>
  <div class="foot">
    <div class="muted">Thank you for your business. This is a computer-generated invoice.</div>
    <div class="sign muted">For ${esc(company?.businessName || 'SACONE')}<br><br>Authorised signatory</div>
  </div>
</body></html>`;
}

/** Invoice HTML for a full sale (from GET /api/pos/sales/:id) in the given paper size. */
export function billHtml(sale, company, customer, size) {
  return isSheet(size) ? sheetHtml(sale, company, customer, size) : thermalHtml(sale, company, customer, size);
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
