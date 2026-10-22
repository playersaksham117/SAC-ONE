import { AppError } from '../core/http.js';
import { transportFrom } from '../core/dispatch.js';
import { getDatabase } from '../database/connection.js';
import { withFinancialYear } from '../database/context.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

/**
 * E-way bills for sales invoices: the JSON the NIC portal (ewaybillgst.gov.in → e-Waybill →
 * Generate Bulk) takes, built from the invoice, the firm, the buyer and the invoice's transport
 * details. Invoices whose goods (taxable + GST, services left out) exceed ₹50,000 are listed with
 * what is still missing — a services-only bill needs no e-way bill; distance, vehicle,
 * delivery pincode and the e-way bill number the portal returns are kept on the invoice.
 */

export const EWB_JSON_VERSION = '1.0.0621';
const DEFAULT_LIMIT = 50000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Unit → GST Unique Quantity Code (what the portal accepts); anything else is OTH. */
const UQC = {
  pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', nos: 'NOS', no: 'NOS', number: 'NOS', unit: 'UNT', units: 'UNT', unt: 'UNT',
  kg: 'KGS', kgs: 'KGS', kilogram: 'KGS', g: 'GMS', gm: 'GMS', gms: 'GMS', gram: 'GMS', ton: 'TON', tonne: 'TON', mt: 'MTS', qtl: 'QTL', quintal: 'QTL',
  l: 'LTR', ltr: 'LTR', litre: 'LTR', liter: 'LTR', ml: 'MLT', kl: 'KLR',
  m: 'MTR', mtr: 'MTR', meter: 'MTR', metre: 'MTR', cm: 'CMS', km: 'KME', ft: 'FTS', feet: 'FTS', inch: 'INC', yd: 'YDS',
  sqft: 'SQF', 'sq ft': 'SQF', sqm: 'SQM', 'sq m': 'SQM', sqy: 'SQY', cbm: 'CBM',
  box: 'BOX', bx: 'BOX', bag: 'BAG', bags: 'BAG', bale: 'BAL', bdl: 'BDL', bundle: 'BDL', bkl: 'BKL', btl: 'BTL', bottle: 'BTL',
  bun: 'BUN', can: 'CAN', ctn: 'CTN', carton: 'CTN', doz: 'DOZ', dozen: 'DOZ', dz: 'DOZ', drm: 'DRM', drum: 'DRM', gross: 'GRS',
  pac: 'PAC', pack: 'PAC', pkt: 'PAC', packet: 'PAC', pair: 'PRS', prs: 'PRS', pr: 'PRS', roll: 'ROL', rol: 'ROL', set: 'SET', sets: 'SET',
  tab: 'TBS', tablet: 'TBS', tube: 'TUB', thd: 'THD', tgm: 'TGM',
};
export const uqc = (unit) => UQC[String(unit || '').trim().toLowerCase()] || 'OTH';

/** Transport mode text → portal code (1 road, 2 rail, 3 air, 4 ship); '' when not moving yet. */
function modeCode(mode, vehicle) {
  const m = String(mode || '').toLowerCase();
  if (/rail/.test(m)) return '2';
  if (/air/.test(m)) return '3';
  if (/ship|sea|vessel/.test(m)) return '4';
  if (/road|truck|hand|courier|tempo|van/.test(m) || vehicle) return '1';
  return '';
}

const ddmmyyyy = (iso) => {
  const d = String(iso || '').slice(0, 10);
  return DATE.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};
const stateNo = (code) => (/^\d{1,2}$/.test(String(code || '')) ? Number(code) : 0);
const gstState = (gstin) => (/^\d{2}/.test(String(gstin || '')) ? String(gstin).slice(0, 2) : '');
const pin = (v) => (/^[1-9]\d{5}$/.test(String(v || '').trim()) ? Number(String(v).trim()) : 0);
const split = (text, size = 120) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return [t.slice(0, size), t.slice(size, size * 2)];
};

function firmOf(sale) {
  const db = getDatabase();
  const row = (sale.firmId && db.prepare('SELECT * FROM companies WHERE id = ?').get(sale.firmId))
    || db.prepare('SELECT * FROM companies ORDER BY created_at ASC LIMIT 1').get();
  return row ? {
    name: row.legal_name || row.business_name || '',
    gstin: row.gst_number || '',
    stateCode: row.gst_state_code || gstState(row.gst_number),
    address: [row.address_line1, row.address_line2].filter(Boolean).join(', '),
    city: row.city || '',
    pincode: row.postal_code || '',
  } : null;
}

const serviceIds = (productIds) => new Set(productIds.length
  ? getDatabase().prepare(`SELECT id FROM products WHERE item_type = 'service' AND id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(productIds)).map((r) => r.id)
  : []);

/**
 * One invoice → { bill (portal JSON entry), problems (block export), warnings (allowed) }.
 * The buyer is "Bill to"; a Ship-to on the invoice makes it Bill-to / Ship-to (transType 2).
 */
export function buildEwayBill(sale, { firm, customer }) {
  const problems = [];
  const warnings = [];
  const t = sale.transport || {};
  const ship = sale.shipTo || null;

  if (!firm?.gstin) problems.push('Firm GSTIN missing (Company & Firms)');
  if (!pin(firm?.pincode)) problems.push('Firm pincode missing (Company & Firms)');
  if (!firm?.address) problems.push('Firm address missing (Company & Firms)');

  const services = serviceIds((sale.items || []).map((i) => i.productId).filter(Boolean));
  const goods = (sale.items || []).filter((i) => !services.has(i.productId) && Number(i.quantity) - Number(i.quantityReturned || 0) > 0);
  if (!goods.length) problems.push('No goods on this invoice (services need no e-way bill)');
  const badHsn = goods.filter((i) => !/^\d{4,8}$/.test(String(i.hsnCode || '')) || /^99/.test(String(i.hsnCode)));
  if (badHsn.length) problems.push(`HSN missing / not a goods code: ${badHsn.map((i) => i.productName).slice(0, 3).join(', ')}`);

  const docNo = String(sale.invoiceNumber || '');
  if (docNo.length > 16 || !/^[A-Za-z0-9/-]+$/.test(docNo)) problems.push('Invoice number must be up to 16 letters, digits, / or -');

  const walkIn = sale.customerIsWalkIn || !customer;
  const buyerGstin = walkIn ? '' : String(customer.gstNumber || '').toUpperCase();
  const buyerName = walkIn ? (sale.customerName || 'Cash customer') : customer.name;
  const buyerState = buyerGstin ? gstState(buyerGstin) : (customer?.gstStateCode || (ship?.stateCode) || firm?.stateCode || '');
  const delivery = {
    address: ship?.address || customer?.shippingAddress || customer?.address || '',
    place: ship?.city || customer?.shippingCity || customer?.city || '',
    pincode: t.deliveryPincode || ship?.pincode || customer?.shippingPostal || customer?.postalCode || '',
    stateCode: ship?.stateCode || (ship?.gstin ? gstState(ship.gstin) : '') || buyerState,
  };
  if (!pin(delivery.pincode)) problems.push('Delivery pincode missing');
  if (!delivery.place && !delivery.address) problems.push('Delivery address / city missing');
  if (!stateNo(buyerState)) problems.push('Buyer state not known (GSTIN or state code)');
  const distance = Number(t.distanceKm || 0);
  if (!(distance > 0)) problems.push('Distance (km) missing');

  const vehicle = String(t.vehicleNumber || '').toUpperCase();
  const mode = modeCode(t.mode, vehicle);
  if (!vehicle && !t.transporterId) warnings.push('No vehicle number: the portal makes Part A only; add the vehicle (Part B) there before the goods move');
  if (vehicle && !/^[A-Z]{2}[0-9A-Z]{4,8}$/.test(vehicle)) problems.push('Vehicle number looks wrong (e.g. MH12AB1234)');

  const inter = Number(sale.igstAmount || 0) > 0;
  const itemList = goods.map((i, idx) => {
    const kept = Number(i.quantity) - Number(i.quantityReturned || 0);
    const ratio = Number(i.quantity) ? kept / Number(i.quantity) : 1;
    const rate = Number(i.gstPercentage || 0);
    return {
      itemNo: idx + 1,
      productName: String(i.productName || '').slice(0, 100),
      productDesc: String(i.shortDescription || i.productName || '').slice(0, 100),
      hsnCode: Number(i.hsnCode) || 0,
      quantity: round2(kept),
      qtyUnit: uqc(i.unit),
      taxableAmount: round2(Number(i.taxableAmount || 0) * ratio),
      sgstRate: inter ? 0 : round2(rate / 2),
      cgstRate: inter ? 0 : round2(rate / 2),
      igstRate: inter ? rate : 0,
      cessRate: 0,
      cessNonAdvol: 0,
    };
  });
  const taxable = round2(itemList.reduce((s, i) => s + i.taxableAmount, 0));
  const tax = (r) => round2(itemList.reduce((s, i) => s + i.taxableAmount * (r(i) / 100), 0));
  const cgst = tax((i) => i.cgstRate);
  const sgst = tax((i) => i.sgstRate);
  const igst = tax((i) => i.igstRate);
  const value = round2(taxable + cgst + sgst + igst);
  const fromAddr = split(firm?.address);
  const toAddr = split(delivery.address);
  const mainHsn = itemList.slice().sort((a, b) => b.taxableAmount - a.taxableAmount)[0]?.hsnCode || 0;

  const bill = {
    userGstin: firm?.gstin || '',
    supplyType: 'O',
    subSupplyType: 1,
    subSupplyDesc: '',
    docType: cgst + sgst + igst > 0 ? 'INV' : 'BIL',
    docNo,
    docDate: ddmmyyyy(sale.completedAt || sale.createdAt),
    transType: ship ? 2 : 1,
    fromGstin: firm?.gstin || '',
    fromTrdName: firm?.name || '',
    fromAddr1: fromAddr[0],
    fromAddr2: fromAddr[1],
    fromPlace: firm?.city || '',
    fromPincode: pin(firm?.pincode),
    fromStateCode: stateNo(firm?.stateCode),
    actualFromStateCode: stateNo(firm?.stateCode),
    toGstin: buyerGstin || 'URP',
    toTrdName: String(buyerName || '').slice(0, 100),
    toAddr1: toAddr[0],
    toAddr2: toAddr[1],
    toPlace: delivery.place,
    toPincode: pin(delivery.pincode),
    toStateCode: stateNo(buyerState),
    actualToStateCode: stateNo(delivery.stateCode) || stateNo(buyerState),
    totalValue: taxable,
    cgstValue: cgst,
    sgstValue: sgst,
    igstValue: igst,
    cessValue: 0,
    TotNonAdvolVal: 0,
    OthValue: 0, // services and round-off on the invoice are not part of the consignment
    totInvValue: value,
    transMode: mode,
    transDistance: String(Math.round(distance) || 0),
    transporterName: String(t.transporter || '').slice(0, 100),
    transporterId: t.transporterId || '',
    transDocNo: String(t.lrNumber || '').slice(0, 15),
    transDocDate: ddmmyyyy(t.lrDate),
    vehicleNo: vehicle,
    vehicleType: vehicle ? 'R' : '',
    mainHsnCode: mainHsn,
    itemList,
  };
  if (bill.toGstin !== 'URP' && bill.toGstin === bill.fromGstin) warnings.push('Buyer GSTIN is your own GSTIN');
  return { bill, problems, warnings, consignmentValue: value };
}

function invoicesAbove(query) {
  const q = withFinancialYear(query);
  const min = Number(query.minValue) > 0 ? Number(query.minValue) : DEFAULT_LIMIT;
  const where = ["s.status != 'voided'", 's.grand_total > ?'];
  const params = [min];
  if (q.dateFrom && DATE.test(q.dateFrom)) { where.push('COALESCE(s.completed_at, s.created_at) >= ?'); params.push(q.dateFrom); }
  if (q.dateTo && DATE.test(q.dateTo)) { where.push("COALESCE(s.completed_at, s.created_at) < date(?, '+1 day')"); params.push(q.dateTo); }
  if (query.search) {
    where.push("(LOWER(s.invoice_number) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)");
    const like = `%${String(query.search).toLowerCase()}%`;
    params.push(like, like);
  }
  const ids = getDatabase().prepare(`
    SELECT s.id FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE ${where.join(' AND ')} ORDER BY COALESCE(s.completed_at, s.created_at) DESC LIMIT 500
  `).all(...params).map((r) => r.id);
  return { ids, min };
}

function describe(sale) {
  const customer = sale.customerId ? repos.customers.findById(sale.customerId) : null;
  const firm = firmOf(sale);
  const built = buildEwayBill(sale, { firm, customer: customer?.isWalkIn ? null : customer });
  const t = sale.transport || {};
  const generated = Boolean(t.ewayBillNumber);
  return {
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    date: sale.completedAt || sale.createdAt,
    customerName: customer && !customer.isWalkIn ? customer.name : (sale.customerName || 'Walk-in'),
    customerGstin: built.bill.toGstin,
    grandTotal: round2(sale.grandTotal),
    consignmentValue: built.consignmentValue,
    interState: built.bill.igstValue > 0,
    from: `${built.bill.fromPlace} ${built.bill.fromPincode || ''}`.trim(),
    to: `${built.bill.toPlace} ${built.bill.toPincode || ''}`.trim(),
    transport: {
      mode: t.mode || '', transporter: t.transporter || '', transporterId: t.transporterId || '',
      vehicleNumber: t.vehicleNumber || '', distanceKm: t.distanceKm || '', deliveryPincode: t.deliveryPincode || '',
      lrNumber: t.lrNumber || '', lrDate: t.lrDate || '',
      ewayBillNumber: t.ewayBillNumber || '', ewayBillDate: t.ewayBillDate || '',
    },
    deliveryPincode: built.bill.toPincode || '',
    problems: built.problems,
    warnings: built.warnings,
    status: generated ? 'generated' : built.problems.length ? 'needs_details' : 'ready',
    bill: built.bill,
  };
}

export const ewayBillService = {
  list(query = {}, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const { ids, min } = invoicesAbove(query);
    // the limit is on the goods moved: services on the bill do not count towards it
    const all = ids.map((id) => repos.posSales.findById(id)).filter(Boolean).map(describe)
      .filter((i) => i.consignmentValue > min);
    const show = ['pending', 'ready', 'needs_details', 'generated', 'all'].includes(query.show) ? query.show : 'pending';
    const items = all.filter((i) => (show === 'all' ? true : show === 'pending' ? i.status !== 'generated' : i.status === show));
    return {
      minValue: min,
      show,
      totals: {
        invoices: all.length,
        ready: all.filter((i) => i.status === 'ready').length,
        needsDetails: all.filter((i) => i.status === 'needs_details').length,
        generated: all.filter((i) => i.status === 'generated').length,
      },
      items: items.map(({ bill: _bill, ...rest }) => rest),
    };
  },

  /** Save distance / vehicle / transporter / delivery pincode / EWB number on one invoice. */
  update(saleId, body = {}, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const sale = repos.posSales.findById(saleId);
    if (!sale || sale.status === 'voided') throw new AppError('Invoice not found', 404);
    const keys = ['mode', 'transporter', 'transporterId', 'vehicleNumber', 'distanceKm', 'deliveryPincode', 'lrNumber', 'lrDate', 'ewayBillNumber', 'ewayBillDate'];
    const patch = Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
    if (patch.ewayBillNumber && !/^\d{12}$/.test(String(patch.ewayBillNumber).replace(/\s/g, ''))) {
      throw new AppError('E-way bill number is 12 digits', 400);
    }
    if (patch.ewayBillNumber) patch.ewayBillNumber = String(patch.ewayBillNumber).replace(/\s/g, '');
    const transport = transportFrom({ ...(sale.transport || {}), ...patch });
    repos.posSales.setDispatch(sale.id, { transport, shipTo: sale.shipTo || null });
    return describe(repos.posSales.findById(sale.id));
  },

  /** The portal's bulk JSON for the chosen invoices; invoices with problems are left out and named. */
  exportJson(body = {}, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const ids = [...new Set(Array.isArray(body.saleIds) ? body.saleIds.map(String) : [])].slice(0, 500);
    if (!ids.length) throw new AppError('Select at least one invoice', 400);
    const billLists = [];
    const skipped = [];
    for (const id of ids) {
      const sale = repos.posSales.findById(id);
      if (!sale || sale.status === 'voided') { skipped.push({ saleId: id, reason: 'Invoice not found' }); continue; }
      const d = describe(sale);
      if (d.problems.length) { skipped.push({ saleId: id, invoiceNumber: d.invoiceNumber, reason: d.problems.join('; ') }); continue; }
      billLists.push(d.bill);
    }
    return { json: { version: EWB_JSON_VERSION, billLists }, count: billLists.length, skipped };
  },
};
