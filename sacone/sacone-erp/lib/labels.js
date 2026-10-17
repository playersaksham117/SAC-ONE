import { code128Svg } from './barcode128';

/**
 * Barcode labels for products: thermal label rolls (one label per page) and A4 label sheets.
 * Which details print is set in Settings → Barcode labels (and can be changed per print).
 */

export const LABEL_SIZES = [
  { value: '50x25', label: '50 × 25 mm · label roll', w: 50, h: 25 },
  { value: '38x25', label: '38 × 25 mm · label roll', w: 38, h: 25 },
  { value: '40x30', label: '40 × 30 mm · label roll', w: 40, h: 30 },
  { value: '75x50', label: '75 × 50 mm · label roll', w: 75, h: 50 },
  { value: '100x50', label: '100 × 50 mm · label roll', w: 100, h: 50 },
  { value: 'a4-65', label: 'A4 sheet · 65 labels (38.1 × 21.2 mm)', w: 38.1, h: 21.2, cols: 5, rows: 13, gapX: 2.5, gapY: 0 },
  { value: 'a4-40', label: 'A4 sheet · 40 labels (48.5 × 25.4 mm)', w: 48.5, h: 25.4, cols: 4, rows: 10, gapX: 0, gapY: 0 },
  { value: 'a4-24', label: 'A4 sheet · 24 labels (64 × 33.9 mm)', w: 64, h: 33.9, cols: 3, rows: 8, gapX: 2.5, gapY: 0 },
  { value: 'a4-12', label: 'A4 sheet · 12 labels (99.1 × 42.3 mm)', w: 99.1, h: 42.3, cols: 2, rows: 6, gapX: 2.5, gapY: 0 },
];

export const LABEL_FIELDS = [
  ['business', 'Business name'],
  ['name', 'Product name'],
  ['variant', 'Variant / size'],
  ['sku', 'SKU'],
  ['barcode', 'Barcode (bars)'],
  ['barcodeText', 'Barcode number'],
  ['mrp', 'MRP'],
  ['price', 'Selling price (incl. GST)'],
  ['hsn', 'HSN / SAC'],
  ['unit', 'Unit'],
  ['category', 'Category'],
  ['packed', 'Packed on (month / year)'],
  ['footer', 'Footer text'],
];
export const DEFAULT_LABEL_FIELDS = ['business', 'name', 'variant', 'barcode', 'barcodeText', 'mrp', 'price'];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Settings → { size, fields, footer } (stored as label.size, label.fields, label.footer). */
export function labelSettingsFrom(list = []) {
  const get = (key) => list.find((s) => s.key === key)?.value;
  const fields = String(get('label.fields') ?? '').split(',').map((s) => s.trim()).filter((f) => LABEL_FIELDS.some(([k]) => k === f));
  return {
    size: LABEL_SIZES.some((s) => s.value === get('label.size')) ? get('label.size') : '50x25',
    fields: fields.length ? fields : DEFAULT_LABEL_FIELDS,
    footer: String(get('label.footer') ?? ''),
  };
}

/** What the barcode encodes: the product's barcode, else its SKU. */
export const barcodeValue = (p) => String(p.barcode || p.sku || '').trim();

function oneLabel(p, size, fields, { company, footer }) {
  const on = new Set(fields);
  const unit = Math.min(size.h, size.w * 0.6); // mm the text scales with
  const fs = (k) => `${(unit * k).toFixed(2)}mm`;
  const code = barcodeValue(p);
  const withGst = Math.round(Number(p.sellingPrice || 0) * (1 + Number(p.gstPercentage || 0) / 100) * 100) / 100;
  const meta = [
    on.has('sku') && p.sku ? `SKU ${esc(p.sku)}` : '',
    on.has('hsn') && p.hsnCode ? `HSN ${esc(p.hsnCode)}` : '',
    on.has('unit') && (p.unitAbbreviation || p.unitName) ? esc(p.unitAbbreviation || p.unitName) : '',
    on.has('category') && p.categoryName ? esc(p.categoryName) : '',
    on.has('packed') ? `Pkd ${new Date().toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric' })}` : '',
  ].filter(Boolean).join(' · ');
  const prices = [
    on.has('mrp') && Number(p.mrp) > 0 ? `<span>MRP <b>${rupees(p.mrp)}</b></span>` : '',
    on.has('price') && withGst > 0 ? `<span>Price <b>${rupees(withGst)}</b></span>` : '',
  ].filter(Boolean).join('');
  let bars = '';
  if (on.has('barcode') && code) {
    try { bars = code128Svg(code); } catch { bars = ''; }
  }
  return `<div class="lbl" style="font-size:${fs(0.115)}">
    ${on.has('business') && company?.businessName ? `<div class="biz" style="font-size:${fs(0.1)}">${esc(company.businessName)}</div>` : ''}
    ${on.has('name') ? `<div class="name">${esc(p.name)}</div>` : ''}
    ${on.has('variant') && p.modelVariant ? `<div class="sub">${esc(p.modelVariant)}</div>` : ''}
    ${meta ? `<div class="sub" style="font-size:${fs(0.09)}">${meta}</div>` : ''}
    ${bars ? `<div class="bars">${bars}</div>` : ''}
    ${on.has('barcodeText') && code ? `<div class="code" style="font-size:${fs(0.1)}">${esc(code)}</div>` : ''}
    ${prices ? `<div class="price">${prices}</div>` : ''}
    ${on.has('footer') && footer ? `<div class="sub" style="font-size:${fs(0.085)}">${esc(footer)}</div>` : ''}
  </div>`;
}

/**
 * Printable HTML for labels. items: [{ product, copies }].
 * Rolls print one label per page at the label size; sheets lay labels out on A4.
 */
export function labelsHtml(items, { size: sizeKey, fields, company, footer = '' }) {
  const size = LABEL_SIZES.find((s) => s.value === sizeKey) || LABEL_SIZES[0];
  const labels = items.flatMap(({ product, copies }) => Array.from({ length: Math.max(0, Math.min(500, Number(copies) || 0)) }, () => oneLabel(product, size, fields, { company, footer })));
  const base = `
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000}
  .lbl{width:${size.w}mm;height:${size.h}mm;padding:1.2mm 1.6mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;line-height:1.12}
  .biz{font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .name{font-weight:700;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sub{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bars{flex:1;min-height:30%;width:100%;display:flex;align-items:stretch;justify-content:center;padding:.4mm 0}
  .bars svg{width:94%;height:100%}
  .code{letter-spacing:.08em}
  .price{display:flex;gap:2.5mm;justify-content:center;white-space:nowrap}
  @media print{.lbl{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

  if (!size.cols) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
  @page{size:${size.w}mm ${size.h}mm;margin:0}
  ${base}
  .lbl{page-break-after:always;break-after:page}
  .lbl:last-child{page-break-after:auto;break-after:auto}
</style></head><body>${labels.join('')}</body></html>`;
  }
  const perPage = size.cols * size.rows;
  const marginX = (210 - size.cols * size.w - (size.cols - 1) * size.gapX) / 2;
  const marginY = (297 - size.rows * size.h - (size.rows - 1) * size.gapY) / 2;
  const pages = [];
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
  @page{size:A4 portrait;margin:0}
  ${base}
  .sheet{width:210mm;height:297mm;padding:${marginY.toFixed(2)}mm ${marginX.toFixed(2)}mm;display:grid;
    grid-template-columns:repeat(${size.cols},${size.w}mm);grid-auto-rows:${size.h}mm;column-gap:${size.gapX}mm;row-gap:${size.gapY}mm;
    page-break-after:always;break-after:page;overflow:hidden}
  .sheet:last-child{page-break-after:auto;break-after:auto}
</style></head><body>${pages.map((p) => `<div class="sheet">${p.join('')}</div>`).join('')}</body></html>`;
}
