import { amountInWords } from '../core/amount-words.js';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAddress(name, lines) {
  const parts = [name, ...lines.filter(Boolean)].filter(Boolean);
  return parts.map(esc).join('<br/>');
}

function sameAddress(bill, ship) {
  const b = [bill.address, bill.city, bill.state, bill.postal].join('|').toLowerCase();
  const s = [ship.address, ship.city, ship.state, ship.postal].join('|').toLowerCase();
  return b && b === s;
}

export function buildQuotationDocument({ firm, quotation, title = 'QUOTATION' }) {
  const snap = quotation.customerSnapshot || {};
  const displayName = snap.businessName || snap.name || 'Customer';
  const bill = {
    address: snap.billingAddress,
    city: snap.billingCity,
    state: snap.billingState,
    postal: snap.billingPostal,
  };
  const ship = {
    address: snap.shippingAddress,
    city: snap.shippingCity,
    state: snap.shippingState,
    postal: snap.shippingPostal,
  };
  const shipSame = sameAddress(bill, ship);

  const firmAddress = [
    firm.addressLine1,
    firm.addressLine2,
    [firm.city, firm.state, firm.postalCode].filter(Boolean).join(', '),
  ].filter(Boolean);

  const itemRows = (quotation.items || []).map((item, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(item.productName)}${item.sku ? `<div class="muted mono">${esc(item.sku)}</div>` : ''}</td>
      <td class="c mono">${esc(item.hsnCode || '—')}</td>
      <td class="r">${item.quantity}</td>
      <td class="c">${esc(item.unitAbbreviation || '—')}</td>
      <td class="r">${money(item.unitPrice)}</td>
      <td class="r">${item.discountAmount > 0 ? money(item.discountAmount) : '—'}</td>
      <td class="c">${item.gstPercentage}%</td>
      <td class="r"><strong>${money(item.lineTotal)}</strong></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(quotation.quotationNumber)}</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; margin: 0; line-height: 1.4; }
  .doc { max-width: 210mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .firm-name { font-size: 18px; font-weight: 700; color: #0f172a; }
  .doc-title { font-size: 16px; font-weight: 700; text-align: right; color: #334155; letter-spacing: 1px; }
  .muted { color: #64748b; font-size: 10px; }
  .mono { font-family: Consolas, monospace; font-size: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .box h4 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
  table.items { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.items th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; padding: 6px 4px; border: 1px solid #cbd5e1; }
  table.items td { padding: 5px 4px; border: 1px solid #e2e8f0; vertical-align: top; }
  .c { text-align: center; }
  .r { text-align: right; }
  .totals { margin-left: auto; width: 280px; margin-top: 8px; }
  .totals dl { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin: 0; }
  .totals dt { color: #64748b; }
  .totals dd { margin: 0; text-align: right; font-weight: 600; }
  .grand { font-size: 14px; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 6px; }
  .words { margin: 10px 0; padding: 8px; background: #f8fafc; border-radius: 6px; font-style: italic; }
  .footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; }
  .sign { margin-top: 24px; text-align: right; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="doc">
  <div class="header">
    <div>
      ${firm.logoUrl ? `<img src="${esc(firm.logoUrl)}" alt="Logo" style="max-height:48px;margin-bottom:6px"/>` : ''}
      <div class="firm-name">${esc(firm.businessName)}</div>
      <div class="muted">${firmAddress.map(esc).join('<br/>')}</div>
      ${firm.phone ? `<div class="muted">Phone: ${esc(firm.phone)}</div>` : ''}
      ${firm.email ? `<div class="muted">Email: ${esc(firm.email)}</div>` : ''}
      ${firm.gstNumber ? `<div class="muted">GSTIN: ${esc(firm.gstNumber)}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">${esc(title)}</div>
      <div class="muted" style="margin-top:8px;text-align:right">
        <div><strong>No:</strong> ${esc(quotation.quotationNumber)}</div>
        <div><strong>Date:</strong> ${esc(new Date(quotation.quotationDate).toLocaleDateString('en-IN'))}</div>
        ${quotation.validUntil ? `<div><strong>Valid Until:</strong> ${esc(new Date(quotation.validUntil).toLocaleDateString('en-IN'))}</div>` : ''}
        <div><strong>FY:</strong> ${esc(quotation.financialYear)}</div>
      </div>
    </div>
  </div>

  <div class="grid2">
    <div class="box">
      <h4>${shipSame ? 'Bill To / Ship To' : 'Bill To'}</h4>
      <strong>${esc(displayName)}</strong>
      ${snap.contactPerson ? `<div class="muted">Contact: ${esc(snap.contactPerson)}</div>` : ''}
      <div style="margin-top:4px">${formatAddress('', [bill.address, [bill.city, bill.state, bill.postal].filter(Boolean).join(' - ')])}</div>
      ${snap.gstNumber ? `<div class="muted" style="margin-top:4px">GSTIN: ${esc(snap.gstNumber)}</div>` : ''}
      ${snap.phone ? `<div class="muted">Mobile: ${esc(snap.phone)}</div>` : ''}
    </div>
    ${!shipSame && ship.address ? `
    <div class="box">
      <h4>Ship To</h4>
      <strong>${esc(displayName)}</strong>
      <div style="margin-top:4px">${formatAddress('', [ship.address, [ship.city, ship.state, ship.postal].filter(Boolean).join(' - ')])}</div>
    </div>` : '<div></div>'}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:4%">Sr</th>
        <th style="width:28%">Description</th>
        <th class="c" style="width:8%">HSN</th>
        <th class="r" style="width:7%">Qty</th>
        <th class="c" style="width:6%">Unit</th>
        <th class="r" style="width:10%">Rate</th>
        <th class="r" style="width:8%">Disc</th>
        <th class="c" style="width:6%">GST</th>
        <th class="r" style="width:12%">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <dl>
      <dt>Subtotal</dt><dd>${money(quotation.subtotal)}</dd>
      <dt>Item Discount</dt><dd>${money(quotation.itemDiscountTotal)}</dd>
      <dt>Invoice Discount</dt><dd>${money(quotation.invoiceDiscount)}</dd>
      <dt>Taxable Amount</dt><dd>${money(quotation.taxableAmount)}</dd>
      ${quotation.cgstAmount > 0 ? `<dt>CGST</dt><dd>${money(quotation.cgstAmount)}</dd>` : ''}
      ${quotation.sgstAmount > 0 ? `<dt>SGST</dt><dd>${money(quotation.sgstAmount)}</dd>` : ''}
      ${quotation.igstAmount > 0 ? `<dt>IGST</dt><dd>${money(quotation.igstAmount)}</dd>` : ''}
      <dt class="grand">Grand Total</dt><dd class="grand">${money(quotation.grandTotal)}</dd>
    </dl>
  </div>

  <div class="words">Amount in words: ${esc(amountInWords(quotation.grandTotal))}</div>

  ${quotation.notes ? `<div class="footer"><strong>Notes:</strong><br/>${esc(quotation.notes).replace(/\n/g, '<br/>')}</div>` : ''}
  ${quotation.termsConditions ? `<div class="footer"><strong>Terms &amp; Conditions:</strong><br/>${esc(quotation.termsConditions).replace(/\n/g, '<br/>')}</div>` : ''}

  <div class="sign">
    ${firm.documentStampUrl ? `<img src="${esc(firm.documentStampUrl)}" alt="Stamp" style="max-height:60px;margin-bottom:8px"/>` : ''}
    <div>For ${esc(firm.businessName)}</div>
    <div style="margin-top:32px;border-top:1px solid #94a3b8;width:180px;margin-left:auto;padding-top:4px">
      ${esc(firm.authorizedSignatory || 'Authorized Signatory')}
    </div>
  </div>
</div>
</body>
</html>`;
}
