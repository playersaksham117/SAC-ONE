import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { CompanyInfo } from '../api/sacone';
import { formatMoney, formatQty } from '../domain/money';
import type { Sale } from '../domain/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', credit: 'Credit (due)' };

/** 80mm thermal-style receipt; prints on any printer the phone can reach and shares as PDF. */
export function receiptHtml(sale: Sale, company: CompanyInfo | null | undefined, deviceCode?: string): string {
  const t = sale.totals;
  const rows = t.lines.map((l) => `
    <tr><td colspan="3" class="name">${esc(l.name)}${l.hsn ? ` <span class="muted">HSN ${esc(l.hsn)}</span>` : ''}</td></tr>
    <tr><td>${formatQty(l.quantity)} × ${formatMoney(l.unitPrice)}${l.discountAmount ? ` −${formatMoney(l.discountAmount)}` : ''}</td>
        <td class="muted">${l.gstRate}%</td><td class="r">${formatMoney(l.lineTotal)}</td></tr>`).join('');
  const tax = t.taxSplit === 'igst'
    ? `<tr><td>IGST</td><td class="r">${formatMoney(t.igstAmount)}</td></tr>`
    : `<tr><td>CGST</td><td class="r">${formatMoney(t.cgstAmount)}</td></tr><tr><td>SGST</td><td class="r">${formatMoney(t.sgstAmount)}</td></tr>`;
  const pays = sale.payments.map((p) => `<tr><td>${METHOD[p.method] ?? p.method}${p.reference ? ` (${esc(p.reference)})` : ''}</td><td class="r">${formatMoney(p.amount)}</td></tr>`).join('');
  const number = sale.serverNumber ?? (deviceCode ? `${deviceCode}-${sale.number}` : sale.number);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,Roboto,Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:12px;max-width:300px}
  h1{font-size:16px;margin:0 0 2px;text-align:center} .c{text-align:center} .muted{color:#666;font-size:11px}
  table{width:100%;border-collapse:collapse} td{padding:2px 0;vertical-align:top} .r{text-align:right}
  .name{padding-top:6px;font-weight:600} hr{border:0;border-top:1px dashed #999;margin:8px 0}
  .total td{font-size:15px;font-weight:700;padding-top:4px}
</style></head><body>
  <h1>${esc(company?.businessName || 'SACONE')}</h1>
  ${company?.address ? `<div class="c muted">${esc(company.address)}${company.city ? `, ${esc(company.city)}` : ''}</div>` : ''}
  ${company?.gstNumber ? `<div class="c muted">GSTIN ${esc(company.gstNumber)}</div>` : ''}
  ${company?.phone ? `<div class="c muted">Ph ${esc(company.phone)}</div>` : ''}
  <hr><div class="c"><b>TAX INVOICE</b></div>
  <table><tr><td>Bill</td><td class="r">${esc(number)}</td></tr>
  <tr><td>Date</td><td class="r">${new Date(sale.createdAt).toLocaleString('en-IN')}</td></tr>
  <tr><td>Cashier</td><td class="r">${esc(sale.userName)}</td></tr>
  ${sale.customer ? `<tr><td>Customer</td><td class="r">${esc(sale.customer.name)}${sale.customer.phone ? `<br>${esc(sale.customer.phone)}` : ''}${sale.customer.gstin ? `<br>GSTIN ${esc(sale.customer.gstin)}` : ''}</td></tr>` : ''}
  </table><hr>
  <table>${rows}</table><hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${formatMoney(t.subtotal)}</td></tr>
    ${t.itemDiscountTotal + t.invoiceDiscount > 0 ? `<tr><td>Discount</td><td class="r">−${formatMoney(t.itemDiscountTotal + t.invoiceDiscount)}</td></tr>` : ''}
    <tr><td>Taxable</td><td class="r">${formatMoney(t.taxableAmount)}</td></tr>
    ${tax}
    <tr class="total"><td>TOTAL</td><td class="r">${formatMoney(t.grandTotal)}</td></tr>
  </table><hr>
  <table>${pays}
    ${sale.change ? `<tr><td>Tendered</td><td class="r">${formatMoney(sale.tendered ?? 0)}</td></tr><tr><td>Change</td><td class="r">${formatMoney(sale.change)}</td></tr>` : ''}
  </table>
  <hr><div class="c muted">Thank you! Visit again.</div>
</body></html>`;
}

export async function printReceipt(html: string) {
  await Print.printAsync({ html });
}

export async function shareReceipt(html: string, fileName: string) {
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html, width: 300 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
  }
}
