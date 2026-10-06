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

export function billHtml(sale: Sale, company: CompanyInfo | null | undefined, deviceCode: string | undefined, size: PaperSize): string {
  return isSheet(size) ? sheetHtml(sale, company, deviceCode, size) : thermalHtml(sale, company, deviceCode, size);
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
