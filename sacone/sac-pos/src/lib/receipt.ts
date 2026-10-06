import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { CompanyInfo } from '../api/sacone';
import { formatNotes } from '../domain/cash';
import { formatMoney, formatQty } from '../domain/money';
import type { Sale } from '../domain/types';

/**
 * Bill documents in four paper sizes.
 *   58mm / 80mm  thermal receipts (print only)
 *   A5 / A4      tax-invoice sheets (print, PDF and share)
 */
export type PaperSize = '58mm' | '80mm' | 'A5' | 'A4';
export type PdfSize = 'A5' | 'A4';

export const PRINT_SIZES: { value: PaperSize; label: string }[] = [
  { value: '58mm', label: '58 mm' },
  { value: '80mm', label: '80 mm' },
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
];
export const PDF_SIZES: { value: PdfSize; label: string }[] = [
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
];

const isSheet = (size: PaperSize): size is PdfSize => size === 'A5' || size === 'A4';

/** Page size in points (1/72 inch). Android takes margins from CSS @page, iOS from `margins`. */
const PAGE: Record<PdfSize, { width: number; height: number; margins: Print.PageMargins }> = {
  A5: { width: 420, height: 595, margins: { top: 23, bottom: 23, left: 23, right: 23 } }, // 8 mm
  A4: { width: 595, height: 842, margins: { top: 34, bottom: 34, left: 34, right: 34 } }, // 12 mm
};
const NO_MARGINS: Print.PageMargins = { top: 0, bottom: 0, left: 0, right: 0 };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', credit: 'Credit (due)' };

const billNumber = (sale: Sale, deviceCode?: string) =>
  sale.serverNumber ?? (deviceCode ? `${deviceCode}-${sale.number}` : sale.number);

const discountTotal = (sale: Sale) => sale.totals.itemDiscountTotal + sale.totals.invoiceDiscount;

function taxRows(sale: Sale) {
  const t = sale.totals;
  return t.taxSplit === 'igst'
    ? `<tr><td>IGST</td><td class="r">${formatMoney(t.igstAmount)}</td></tr>`
    : `<tr><td>CGST</td><td class="r">${formatMoney(t.cgstAmount)}</td></tr><tr><td>SGST</td><td class="r">${formatMoney(t.sgstAmount)}</td></tr>`;
}

function paymentRows(sale: Sale) {
  const pays = sale.payments.map((p) => `<tr><td>${METHOD[p.method] ?? p.method}${p.reference ? ` (${esc(p.reference)})` : ''}</td><td class="r">${formatMoney(p.amount)}</td></tr>`).join('');
  const change = sale.change
    ? `<tr><td>Tendered</td><td class="r">${formatMoney(sale.tendered ?? 0)}</td></tr><tr><td>Change</td><td class="r">${formatMoney(sale.change)}</td></tr>`
    : '';
  const notes = sale.cashDrawer && formatNotes(sale.cashDrawer.received)
    ? `<tr><td colspan="2" class="muted">Notes: ${esc(formatNotes(sale.cashDrawer.received))}${formatNotes(sale.cashDrawer.change) ? `<br>Change: ${esc(formatNotes(sale.cashDrawer.change))}` : ''}</td></tr>`
    : '';
  return pays + change + notes;
}

/* ───────────── thermal receipt (58 / 80 mm) ───────────── */

function thermalHtml(sale: Sale, company: CompanyInfo | null | undefined, deviceCode: string | undefined, size: '58mm' | '80mm') {
  const t = sale.totals;
  const narrow = size === '58mm';
  const rows = t.lines.map((l) => `
    <tr><td colspan="3" class="name">${esc(l.name)}${l.hsn && !narrow ? ` <span class="muted">HSN ${esc(l.hsn)}</span>` : ''}</td></tr>
    <tr><td>${formatQty(l.quantity)} × ${formatMoney(l.unitPrice)}${l.discountAmount ? ` −${formatMoney(l.discountAmount)}` : ''}</td>
        <td class="muted">${l.gstRate}%</td><td class="r">${formatMoney(l.lineTotal)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page{margin:0}
  *{box-sizing:border-box}
  body{font-family:-apple-system,Roboto,Arial,sans-serif;font-size:${narrow ? 10 : 12}px;color:#000;margin:0;
       width:${size};padding:${narrow ? '2mm' : '3mm'}}
  h1{font-size:${narrow ? 13 : 16}px;margin:0 0 2px;text-align:center} .c{text-align:center} .muted{color:#444;font-size:${narrow ? 9 : 11}px}
  table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top} .r{text-align:right;white-space:nowrap}
  .name{padding-top:5px;font-weight:600;word-break:break-word} hr{border:0;border-top:1px dashed #000;margin:6px 0}
  .total td{font-size:${narrow ? 13 : 15}px;font-weight:700;padding-top:3px}
</style></head><body>
  <h1>${esc(company?.businessName || 'SACONE')}</h1>
  ${company?.address ? `<div class="c muted">${esc(company.address)}${company.city ? `, ${esc(company.city)}` : ''}</div>` : ''}
  ${company?.gstNumber ? `<div class="c muted">GSTIN ${esc(company.gstNumber)}</div>` : ''}
  ${company?.phone ? `<div class="c muted">Ph ${esc(company.phone)}</div>` : ''}
  <hr><div class="c"><b>TAX INVOICE</b></div>
  <table><tr><td>Bill</td><td class="r">${esc(billNumber(sale, deviceCode))}</td></tr>
  <tr><td>Date</td><td class="r">${new Date(sale.createdAt).toLocaleString('en-IN')}</td></tr>
  <tr><td>Cashier</td><td class="r">${esc(sale.userName)}</td></tr>
  ${sale.customer ? `<tr><td>Customer</td><td class="r">${esc(sale.customer.name)}${sale.customer.phone ? `<br>${esc(sale.customer.phone)}` : ''}${sale.customer.gstin ? `<br>GSTIN ${esc(sale.customer.gstin)}` : ''}</td></tr>` : ''}
  </table><hr>
  <table>${rows}</table><hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${formatMoney(t.subtotal)}</td></tr>
    ${discountTotal(sale) > 0 ? `<tr><td>Discount</td><td class="r">−${formatMoney(discountTotal(sale))}</td></tr>` : ''}
    <tr><td>Taxable</td><td class="r">${formatMoney(t.taxableAmount)}</td></tr>
    ${taxRows(sale)}
    <tr class="total"><td>TOTAL</td><td class="r">${formatMoney(t.grandTotal)}</td></tr>
  </table><hr>
  <table>${paymentRows(sale)}</table>
  <hr><div class="c muted">Thank you! Visit again.</div>
</body></html>`;
}

/* ───────────── tax-invoice sheet (A5 / A4) ───────────── */

function sheetHtml(sale: Sale, company: CompanyInfo | null | undefined, deviceCode: string | undefined, size: PdfSize) {
  const t = sale.totals;
  const a5 = size === 'A5';
  const anyDiscount = t.lines.some((l) => l.discountAmount > 0);
  const rows = t.lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.name)}${l.hsn ? `<div class="muted">HSN ${esc(l.hsn)}</div>` : ''}</td>
      <td class="r">${formatQty(l.quantity)} ${esc(l.unit || '')}</td>
      <td class="r">${formatMoney(l.unitPrice)}</td>
      ${anyDiscount ? `<td class="r">${l.discountAmount ? formatMoney(l.discountAmount) : '—'}</td>` : ''}
      ${a5 ? '' : `<td class="r">${formatMoney(l.taxableAmount)}</td>`}
      <td class="r">${l.gstRate}%</td>
      <td class="r b">${formatMoney(l.lineTotal)}</td>
    </tr>`).join('');
  const address = [company?.address, company?.city, company?.state].filter(Boolean).map(esc).join(', ');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page{size:${size} portrait;margin:${a5 ? '8mm' : '12mm'}}
  *{box-sizing:border-box}
  body{font-family:-apple-system,Roboto,Arial,sans-serif;font-size:${a5 ? 10 : 12}px;color:#111;margin:0}
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
</style></head><body>
  <div class="head">
    <div>
      <h1>${esc(company?.businessName || 'SACONE')}</h1>
      ${address ? `<div class="muted">${address}</div>` : ''}
      ${company?.phone ? `<div class="muted">Ph ${esc(company.phone)}</div>` : ''}
      ${company?.gstNumber ? `<div class="muted">GSTIN <b>${esc(company.gstNumber)}</b>${company.gstStateCode ? ` · State ${esc(company.gstStateCode)}` : ''}</div>` : ''}
    </div>
    <div class="r">
      <h2>TAX INVOICE</h2>
      <table class="meta"><tr><td class="muted">Invoice</td><td class="b r">${esc(billNumber(sale, deviceCode))}</td></tr>
      <tr><td class="muted">Date</td><td class="r">${new Date(sale.createdAt).toLocaleString('en-IN')}</td></tr>
      <tr><td class="muted">Cashier</td><td class="r">${esc(sale.userName)}</td></tr></table>
    </div>
  </div>
  <div class="party">
    <div class="box"><div class="label">Bill to</div>
      ${sale.customer
    ? `<div class="b">${esc(sale.customer.name)}</div>${sale.customer.phone ? `<div>${esc(sale.customer.phone)}</div>` : ''}${sale.customer.gstin ? `<div>GSTIN ${esc(sale.customer.gstin)}</div>` : ''}`
    : '<div class="b">Walk-in customer</div>'}
    </div>
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
    <div class="muted">${t.lines.length} item${t.lines.length === 1 ? '' : 's'} · ${formatQty(t.lines.reduce((s, l) => s + l.quantity, 0))} qty</div>
    <table class="sum">
      <tr><td>Subtotal</td><td class="r">${formatMoney(t.subtotal)}</td></tr>
      ${discountTotal(sale) > 0 ? `<tr><td>Discount</td><td class="r">−${formatMoney(discountTotal(sale))}</td></tr>` : ''}
      <tr><td>Taxable value</td><td class="r">${formatMoney(t.taxableAmount)}</td></tr>
      ${taxRows(sale)}
      <tr class="grand"><td>Total</td><td class="r">${formatMoney(t.grandTotal)}</td></tr>
    </table>
  </div>
  <div class="foot">
    <div class="muted">Thank you for your business. This is a computer-generated invoice.</div>
    <div class="sign muted">For ${esc(company?.businessName || 'SACONE')}<br><br>Authorised signatory</div>
  </div>
</body></html>`;
}


/* ───────────── classic GST tax invoice (A4 / A5), layout type 1 ───────────── */

export type Layout = 'classic' | 'modern';
export const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'classic', label: '1 · GST classic' },
  { value: 'modern', label: '2 · Modern' },
];

/** ERP → System Settings → Invoice printing (sent with each sync ping). */
export interface InvoiceSettings {
  layout?: Layout;
  copyLabel?: string;
  bankDetails?: string;
  terms?: string;
  declaration?: string;
}

const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};
const stateCode = (code?: string | null, gstin?: string | null) => {
  const c = String(code || gstin?.slice(0, 2) || '').trim();
  return /^\d{2}$/.test(c) ? c : '';
};

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const three = (n: number) => (n < 100 ? two(n) : `${ONES[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${two(n % 100)}` : ''}`);
function indian(n: number): string {
  if (n < 1000) return three(n);
  if (n < 100000) return `${two(Math.floor(n / 1000))} THOUSAND${n % 1000 ? ` ${three(n % 1000)}` : ''}`;
  if (n < 10000000) return `${two(Math.floor(n / 100000))} LAKH${n % 100000 ? ` ${indian(n % 100000)}` : ''}`;
  return `${indian(Math.floor(n / 10000000))} CRORE${n % 10000000 ? ` ${indian(n % 10000000)}` : ''}`;
}
/** 1180 → "ONE THOUSAND ONE HUNDRED EIGHTY ONLY" (Indian numbering). */
export function amountInWords(amount: number): string {
  const n = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  return `${rupees ? indian(rupees) : 'ZERO'}${paise ? ` AND ${two(paise)} PAISE` : ''} ONLY`;
}

function classicHtml(sale: Sale, company: CompanyInfo | null | undefined, deviceCode: string | undefined, size: PdfSize, invoice: InvoiceSettings) {
  const t = sale.totals;
  const a5 = size === 'A5';
  const page = a5 ? { h: 210, m: 5 } : { h: 297, m: 6 };
  const fs = a5 ? 6.6 : 9.5;
  const n2 = (v: number) => Number(v || 0).toFixed(2);
  const blank = (v: number) => (Number(v) ? n2(v) : '');
  const inter = t.taxSplit === 'igst';
  const lines = t.lines.map((l) => {
    const half = Math.round((l.gstAmount / 2) * 100) / 100;
    return {
      ...l, disc: Math.round((l.gross - l.taxableAmount) * 100) / 100,
      sgst: inter ? 0 : half, cgst: inter ? 0 : Math.round((l.gstAmount - half) * 100) / 100, igst: inter ? l.gstAmount : 0,
    };
  });
  const sum = (k: 'gross' | 'disc' | 'taxableAmount' | 'sgst' | 'cgst' | 'igst') => lines.reduce((s, l) => s + Number(l[k] || 0), 0);
  const qtySum = lines.reduce((s, l) => s + l.quantity, 0);
  const companyCode = stateCode(company?.gstStateCode, company?.gstNumber);
  const cust = sale.customer;
  const custCode = stateCode(cust?.gstStateCode, cust?.gstin);
  const posCode = custCode || companyCode;
  const date = new Date(sale.createdAt).toLocaleDateString('en-GB');
  const party = (label: string) => `
    <div class="plabel">${esc(label)}</div>
    <div class="pname">${esc(cust?.name || 'CASH')}</div>
    ${cust?.phone ? `<div class="pline">Mobile: ${esc(cust.phone)}</div>` : ''}
    ${cust?.gstin ? `<div class="pline">GSTIN: ${esc(cust.gstin)}</div>` : ''}
    <div class="pstate"><span>State : ${esc(GST_STATES[custCode] || '')}</span><span>State Code : ${esc(custCode)}</span></div>`;
  const cols = '<colgroup><col style="width:4%"><col style="width:18%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:8%"><col style="width:3.5%"><col style="width:6.5%"><col style="width:3.5%"><col style="width:6.5%"><col style="width:3.5%"><col style="width:5.5%"></colgroup>';
  const rows = lines.map((l, i) => `<tr>
      <td class="c">${i + 1}</td><td class="b">${esc(l.name)}</td><td>${esc(l.hsn || '')}</td>
      <td class="r">${l.quantity.toFixed(3)}</td><td>${esc(l.unit || '')}</td><td class="r b">${n2(l.unitPrice)}</td>
      <td class="r b">${n2(l.gross)}</td><td class="r">${blank(l.disc)}</td><td class="r b">${n2(l.taxableAmount)}</td>
      <td class="r">${l.sgst ? l.gstRate / 2 : ''}</td><td class="r">${blank(l.sgst)}</td>
      <td class="r">${l.cgst ? l.gstRate / 2 : ''}</td><td class="r">${blank(l.cgst)}</td>
      <td class="r">${l.igst ? l.gstRate : ''}</td><td class="r">${n2(l.igst)}</td></tr>`).join('');
  const terms = String(invoice.terms || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const subTotal = sum('taxableAmount') + sum('sgst') + sum('cgst') + sum('igst');
  const pad = a5 ? '1px 3px' : '2px 5px';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page{size:${size} portrait;margin:${page.m}mm}
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${fs}px;color:#000}
  .sheet{border:1.5px solid #000;min-height:${page.h - 2 * page.m - 1.5}mm;display:flex;flex-direction:column}
  .row{display:flex;border-bottom:1px solid #000} .row>div{padding:${a5 ? '1.5px 3px' : '3px 5px'}}
  .vr{border-right:1px solid #000} .b{font-weight:700} .c{text-align:center} .r{text-align:right} .u{text-decoration:underline}
  .head{position:relative;text-align:center;width:100%}
  .head .gst{position:absolute;left:${a5 ? 3 : 5}px;top:${a5 ? 2 : 4}px;font-weight:700}
  .head .mob{position:absolute;right:${a5 ? 3 : 5}px;top:${a5 ? 2 : 4}px;font-weight:700}
  .head .ttl{font-weight:700;font-size:${fs * 1.3}px}
  .head .firm{font-family:'Times New Roman',Times,serif;font-weight:700;font-size:${a5 ? 18 : 30}px;margin:${a5 ? 1 : 2}px 0}
  .plabel{text-align:center;font-weight:700;font-size:${fs * 1.1}px;margin:${a5 ? 2 : 4}px 0 1px}
  .pname{font-weight:700;font-size:${fs * 1.12}px} .pline{font-weight:700}
  .pstate{display:flex;gap:${a5 ? 14 : 30}px;font-weight:700;margin-top:${a5 ? 3 : 8}px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  .items th{font-weight:700;border:1px solid #000;border-top:0;padding:1px 2px;font-size:${fs * 0.95}px}
  .items td{border-left:1px solid #000;border-right:1px solid #000;padding:${a5 ? '1px 1.5px' : '2px 3px'};vertical-align:top;overflow:hidden;word-wrap:break-word}
  .grow{flex:1;display:flex;flex-direction:column} .grow table{flex:1;height:100%}
  .tot td{border:1px solid #000;padding:1px 3px;font-weight:700}
  .kv{display:grid;grid-template-columns:1fr 1fr;column-gap:8px}
  .net{font-size:${fs * 1.35}px;font-weight:700;display:flex;justify-content:space-between;border-top:1px solid #000;border-bottom:1px solid #000;padding:${a5 ? 2 : 4}px 3px}
  .terms{font-size:${fs * 0.82}px;font-weight:700}
</style></head><body>
<div class="sheet">
  <div class="row"><div class="head">
    <div class="gst">GSTIN : ${esc(company?.gstNumber || '')}</div>
    <div class="mob">${company?.phone ? `Mobile: ${esc(company.phone)}` : ''}</div>
    <div class="ttl">Tax Invoice</div>
    ${invoice.copyLabel ? `<div class="u">${esc(invoice.copyLabel)}</div>` : ''}
    <div class="b">${sale.amountDue > 0 ? 'CREDIT MEMO' : 'CASH-MEMO'}</div>
    <div class="firm">${esc(company?.businessName || 'SACONE')}</div>
    <div class="b">${esc([company?.address, company?.city, company?.state].filter(Boolean).join(', '))}</div>
  </div></div>
  <div class="row">
    <div class="vr" style="width:50%">
      <div style="display:flex;justify-content:space-between"><span class="b">Invoice No. ${esc(billNumber(sale, deviceCode))}</span><span class="b">Dated : ${esc(date)}</span></div>
      <div class="b">E-Way Bill No. :</div>
    </div>
    <div style="width:50%">
      <div class="b">Mode of Transport :</div>
      <div style="display:flex;justify-content:space-between"><span class="b">Vehicle No. :</span><span class="b">Driver :</span></div>
      <div class="b">Goods Dispatch :</div>
    </div>
  </div>
  <div class="row">
    <div class="vr" style="width:50%">${party('Detail of Receiver (Billed To)')}
      <div class="c b" style="margin-top:${a5 ? 2 : 6}px">P.O.S. ${esc(posCode)}${GST_STATES[posCode] ? `-${esc(GST_STATES[posCode])}` : ''}</div></div>
    <div style="width:50%">${party('Detail of Consignee (Shipped To)')}
      <div class="b" style="margin-top:${a5 ? 2 : 6}px">Tax is Payable On Reverse Charge : NO</div></div>
  </div>
  <table class="items">${cols}<thead><tr>
    <th rowspan="2">Sr</th><th rowspan="2">Description of Goods</th><th rowspan="2">HSN/<br>SAC<br>code</th>
    <th rowspan="2">Qty.</th><th rowspan="2">UOM</th><th rowspan="2">Rate</th><th rowspan="2">Total<br>Amount</th>
    <th rowspan="2">Disc.</th><th rowspan="2">Taxable<br>Amount <sup>1</sup></th>
    <th colspan="4">Within State Tax</th><th colspan="2">Central Tax</th></tr>
    <tr><th>Tax%</th><th>SGST <sup>2</sup></th><th>Tax%</th><th>CGST <sup>3</sup></th><th>Tax%</th><th>IGST <sup>4</sup></th></tr>
  </thead><tbody>${rows}</tbody></table>
  <div class="grow"><table class="items">${cols}<tbody><tr>${'<td></td>'.repeat(15)}</tr></tbody></table></div>
  <table class="tot">${cols}<tr>
    <td colspan="3">TOTAL :</td><td class="r">${qtySum.toFixed(3)}</td><td></td><td></td>
    <td class="r">${n2(sum('gross'))}</td><td class="r">${n2(sum('disc'))}</td><td class="r">${n2(sum('taxableAmount'))}</td>
    <td></td><td class="r">${n2(sum('sgst'))}</td><td></td><td class="r">${n2(sum('cgst'))}</td><td></td><td class="r">${n2(sum('igst'))}</td></tr></table>
  <div style="display:flex">
    <div class="vr" style="width:70%;display:flex;flex-direction:column">
      <div style="display:flex;border-bottom:1px solid #000"><div class="vr" style="width:65%;padding:${pad}"><div class="kv">
        <span>Order No. :</span><span>Dated :</span><span>Transport :</span><span>Pvt.Mark :</span><span>GR/RR No. :</span><span>Dated :</span>
        <span>Bags : &nbsp; Case : &nbsp; Cartn. :</span><span>Packages. :</span><span>Weight : &nbsp; Loose :</span><span>Freight to Pay :</span>
      </div></div><div style="width:35%"></div></div>
      <div style="border-bottom:1px solid #000;padding:${pad}"><span class="b">Amount In Words :</span> <span class="b">${esc(amountInWords(t.grandTotal))}</span></div>
      <div style="padding:${pad};flex:1">
        <div class="b">Agent : ${esc(sale.userName || '')}</div>
        <div class="b u">Note:</div><div>${esc(sale.notes || '')}</div>
        ${invoice.declaration ? `<div class="c b" style="margin-top:${a5 ? 2 : 4}px">${esc(invoice.declaration)}</div>` : ''}
      </div>
      <div style="display:flex;border-top:1px solid #000">
        <div class="vr b" style="padding:${pad};width:12%">Our's<br>Bankers</div>
        <div class="b u" style="padding:${pad};flex:1">${esc(invoice.bankDetails || '')}</div>
      </div>
      <div style="display:flex;border-top:1px solid #000;flex:1">
        <div class="vr terms" style="width:60%;padding:${pad}"><div class="u">Terms &amp; Conditions:-</div>${terms.map((x, i) => `<div>${i + 1}. ${esc(x)}</div>`).join('')}</div>
        <div class="b" style="width:40%;display:flex;align-items:flex-end;padding:${pad}">Customer's Signature</div>
      </div>
    </div>
    <div style="width:30%;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;padding:${pad}"><span>Sub-Total (1+2+3+4) :</span><span>${n2(subTotal)}</span></div>
      ${Math.abs(t.grandTotal - subTotal) >= 0.01 ? `<div style="display:flex;justify-content:space-between;padding:${pad}"><span>Round Off :</span><span>${n2(t.grandTotal - subTotal)}</span></div>` : ''}
      <div style="flex:1"></div>
      <div class="net"><span>NET AMOUNT :</span><span>${n2(t.grandTotal)}</span></div>
      <div style="flex:1;min-height:${a5 ? 14 : 26}mm;padding:${a5 ? '2px 3px' : '4px 5px'};display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-weight:700">
        <div>For ${esc(company?.businessName || 'SACONE')}</div><div>Auth.Signatory</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

/** A5 / A4 use the chosen layout (type 1 = GST classic by default); 58 / 80 mm are receipts. */
export function billHtml(
  sale: Sale, company: CompanyInfo | null | undefined, deviceCode: string | undefined, size: PaperSize,
  { layout = 'classic', invoice = {} }: { layout?: Layout; invoice?: InvoiceSettings } = {},
): string {
  if (!isSheet(size)) return thermalHtml(sale, company, deviceCode, size);
  return layout === 'modern' ? sheetHtml(sale, company, deviceCode, size) : classicHtml(sale, company, deviceCode, size, invoice);
}

/* ───────────── actions ───────────── */

/** System print dialog: any printer the phone can reach, including Bluetooth/Wi-Fi thermal printers. */
export async function printBill(html: string, size: PaperSize) {
  await Print.printAsync(isSheet(size) ? { html, ...PAGE[size] } : { html, margins: NO_MARGINS });
}

async function makePdf(html: string, size: PdfSize) {
  const { uri } = await Print.printToFileAsync({ html, ...PAGE[size] });
  return uri;
}

/** Open the PDF in the system viewer (Save as PDF / Save to Files). On web: browser "Save as PDF". */
export async function savePdf(html: string, size: PdfSize) {
  if (Platform.OS === 'web') return Print.printAsync({ html });
  return Print.printAsync({ uri: await makePdf(html, size) });
}

/** Share the PDF (WhatsApp, email, Drive …). */
export async function sharePdf(html: string, size: PdfSize, title: string) {
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const uri = await makePdf(html, size);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  return Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Share ${title}`, UTI: 'com.adobe.pdf' });
}
