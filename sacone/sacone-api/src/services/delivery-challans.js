import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { inventoryMovementService } from './inventory.js';
import { istDate, isDate } from '../core/ist.js';

const productRepo = repos.products;
const customerRepo = repos.customers;
const warehouseRepo = repos.warehouses;
const numberingRepo = repos.documentNumbering;
const auditRepo = repos.auditLogs;

export const CHALLAN_PURPOSES = {
  approval: 'On approval',
  job_work: 'Job work',
  sample: 'Sample',
  other: 'Other (not a sale)',
};
/** How an open challan ends: the goods came back, were billed on SAC-POS, or stay out (sample / written off). */
const CLOSE_AS = new Set(['returned', 'invoiced', 'kept']);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const text = (v, max = 300) => (String(v ?? '').trim().slice(0, max) || null);

function meta(req) {
  return { ipAddress: req?.ip || null, userAgent: req?.headers?.['user-agent'] || null };
}

function mapChallan(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    challanNumber: row.challan_number,
    challanDate: row.challan_date,
    purpose: row.purpose,
    purposeLabel: CHALLAN_PURPOSES[row.purpose] || row.purpose,
    customerId: row.customer_id,
    partyName: row.party_name,
    partyAddress: row.party_address,
    partyGstin: row.party_gstin,
    partyPhone: row.party_phone,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    status: row.status,
    closedAt: row.closed_at,
    closeNote: row.close_note,
    invoiceNumber: row.invoice_number,
    vehicleNumber: row.vehicle_number,
    notes: row.notes,
    totalValue: Number(row.total_value || 0),
    totalQuantity: Number(row.total_quantity ?? items.reduce((s, i) => s + i.quantity, 0)),
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    items,
  };
}

const SELECT = `
  SELECT c.*, w.name AS warehouse_name, u.full_name AS created_by_name,
    (SELECT SUM(quantity) FROM delivery_challan_items i WHERE i.challan_id = c.id) AS total_quantity
  FROM delivery_challans c
  LEFT JOIN warehouses w ON w.id = c.warehouse_id
  LEFT JOIN users u ON u.id = c.created_by`;

function findById(id) {
  const db = getDatabase();
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM delivery_challan_items WHERE challan_id = ? ORDER BY sort_order').all(id).map((i) => ({
    id: i.id, productId: i.product_id, productName: i.product_name, sku: i.sku, hsnCode: i.hsn_code,
    quantity: Number(i.quantity), unit: i.unit, rate: Number(i.rate || 0), value: Number(i.value || 0), description: i.description,
  }));
  return mapChallan(row, items);
}

/** Stock out on issue / back in on return, tagged with the challan (no sale, no GST). */
function moveStock(challan, direction, actor, req, reason) {
  for (const line of challan.items) {
    inventoryMovementService.createMovement({
      movementType: direction === 'out' ? MOVEMENT_TYPES.ADJUSTMENT_DECREASE : MOVEMENT_TYPES.ADJUSTMENT_INCREASE,
      productId: line.productId,
      warehouseId: challan.warehouseId,
      quantity: line.quantity,
      referenceType: 'delivery_challan',
      referenceId: challan.id,
      reason: `${reason} ${challan.challanNumber}`,
      requiresApproval: false,
    }, actor, req, { skipPermissionCheck: true });
  }
}

export class DeliveryChallanService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const where = [];
    const params = [];
    if (filters.status) { where.push('c.status = ?'); params.push(filters.status); }
    if (filters.purpose) { where.push('c.purpose = ?'); params.push(filters.purpose); }
    if (filters.dateFrom) { where.push('c.challan_date >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { where.push('c.challan_date <= ?'); params.push(filters.dateTo); }
    if (filters.search) {
      where.push('(c.challan_number LIKE ? OR c.party_name LIKE ? OR c.invoice_number LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(500, parseInt(filters.limit, 10) || 200);
    const db = getDatabase();
    const items = db.prepare(`${SELECT} ${clause} ORDER BY c.challan_date DESC, c.created_at DESC LIMIT ?`).all(...params, limit).map((r) => mapChallan(r));
    const total = db.prepare(`SELECT COUNT(*) n FROM delivery_challans c ${clause}`).get(...params).n;
    return { items, total, purposes: CHALLAN_PURPOSES };
  }

  get(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const challan = findById(id);
    if (!challan) throw new AppError('Delivery challan not found', 404);
    return challan;
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const purpose = String(data.purpose || '');
    if (!CHALLAN_PURPOSES[purpose]) throw new AppError('Choose why the goods go out: on approval, job work, sample or other', 400);
    const warehouse = warehouseRepo.findById(data.warehouseId) || warehouseRepo.findDefault();
    if (!warehouse?.isActive) throw new AppError('Warehouse not found', 400);
    const today = istDate();
    const challanDate = data.challanDate ? String(data.challanDate).slice(0, 10) : today;
    if (!isDate(challanDate) || challanDate > today) throw new AppError('Challan date must be a date, not in the future', 400);

    const customer = data.customerId ? customerRepo.findById(data.customerId) : null;
    if (data.customerId && !customer) throw new AppError('Customer not found', 400);
    const partyName = text(data.partyName, 200) || customer?.name;
    if (!partyName) throw new AppError('Who the goods go to is required (customer or name)', 400);

    const lines = (data.items || []).filter((l) => l?.productId && Number(l.quantity) > 0);
    if (!lines.length) throw new AppError('Add at least one item with a quantity', 400);
    const items = lines.map((l, idx) => {
      const p = productRepo.findById(l.productId);
      if (!p || !p.isActive) throw new AppError(`Product not found: ${l.productId}`, 400);
      if (p.itemType === 'service') throw new AppError(`${p.name} is a service: services cannot go on a delivery challan.`, 400);
      const quantity = round2(l.quantity);
      // value for the challan only (insurance / transport), no GST; default the selling price
      const rate = l.rate !== undefined && l.rate !== '' ? round2(l.rate) : round2(p.sellingPrice || 0);
      if (!(rate >= 0)) throw new AppError('Rate must be zero or more', 400);
      return {
        productId: p.id, productName: p.name, sku: p.sku, hsnCode: l.hsnCode || p.hsnCode || null,
        quantity, unit: p.unitAbbreviation || p.unitName || null, rate, value: round2(quantity * rate),
        description: text(l.description, 500), sortOrder: idx,
      };
    });

    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const challan = db.transaction(() => {
      const number = numberingRepo.allocateNumber(firm.id, 'delivery_challan', new Date(`${challanDate}T12:00:00+05:30`)).documentNumber;
      db.prepare(`
        INSERT INTO delivery_challans (
          id, challan_number, challan_date, purpose, customer_id, party_name, party_address, party_gstin, party_phone,
          warehouse_id, status, vehicle_number, notes, total_value, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
      `).run(
        id, number, challanDate, purpose, customer?.id || null, partyName,
        text(data.partyAddress, 500) || [customer?.address, customer?.city, customer?.state].filter(Boolean).join(', ') || null,
        text(data.partyGstin, 20) || customer?.gstNumber || null,
        text(data.partyPhone, 20) || customer?.phone || null,
        warehouse.id, text(data.vehicleNumber, 30), text(data.notes, 1000),
        round2(items.reduce((s, i) => s + i.value, 0)), actor.user.id, now, now,
      );
      const ins = db.prepare(`
        INSERT INTO delivery_challan_items (id, challan_id, product_id, product_name, sku, hsn_code, quantity, unit, rate, value, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const i of items) ins.run(generateId(), id, i.productId, i.productName, i.sku, i.hsnCode, i.quantity, i.unit, i.rate, i.value, i.description, i.sortOrder);
      const made = findById(id);
      moveStock(made, 'out', actor, req, 'Delivery challan');
      return made;
    })();
    auditRepo.create({ userId: actor.user.id, userName: actor.user.fullName, action: 'create', module: 'sales', recordType: 'delivery_challan', recordId: id, newValue: challan, ...meta(req) });
    return challan;
  }

  /**
   * Close an open challan: returned (stock comes back), invoiced (billed on SAC-POS: the bill took
   * the stock, so the challan's stock comes back here to avoid counting it out twice), or kept
   * (sample given / written off: stock stays out). Cancel = returned without a trace of use.
   */
  close(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const challan = findById(id);
    if (!challan) throw new AppError('Delivery challan not found', 404);
    if (challan.status !== 'open') throw new AppError(`This challan is already ${challan.status}`, 400);
    const as = String(data.as || '');
    const cancel = as === 'cancelled';
    if (!CLOSE_AS.has(as) && !cancel) throw new AppError('Close as returned, invoiced or kept', 400);
    const invoiceNumber = text(data.invoiceNumber, 60);
    if (as === 'invoiced') {
      if (!invoiceNumber) throw new AppError('Enter the SAC-POS invoice number these goods were billed on', 400);
      const sale = getDatabase().prepare("SELECT id FROM pos_sales WHERE invoice_number = ? AND status != 'voided'").get(invoiceNumber);
      if (!sale) throw new AppError(`Invoice ${invoiceNumber} not found`, 400);
    }
    const db = getDatabase();
    const closed = db.transaction(() => {
      if (as !== 'kept') moveStock(challan, 'in', actor, req, as === 'invoiced' ? 'Delivery challan billed on' : 'Delivery challan returned');
      db.prepare(`
        UPDATE delivery_challans SET status = ?, closed_at = ?, closed_by = ?, close_note = ?, invoice_number = ?, updated_at = ?
        WHERE id = ?
      `).run(as, nowIso(), actor.user.id, text(data.note, 500), as === 'invoiced' ? invoiceNumber : null, nowIso(), id);
      return findById(id);
    })();
    auditRepo.create({ userId: actor.user.id, userName: actor.user.fullName, action: 'update', module: 'sales', recordType: 'delivery_challan', recordId: id, previousValue: challan, newValue: closed, ...meta(req) });
    return closed;
  }
}

export const deliveryChallanService = new DeliveryChallanService();
