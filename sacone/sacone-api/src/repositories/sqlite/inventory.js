import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';
import { MOVEMENT_TYPE_META } from '../../core/inventory-constants.js';

function mapWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapLocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapMovement(row) {
  if (!row) return null;
  const meta = MOVEMENT_TYPE_META[row.movement_type] || {};
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name || null,
    productSku: row.product_sku || null,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    warehouseCode: row.warehouse_code || null,
    sourceLocationId: row.source_location_id,
    sourceLocationName: row.source_location_name || null,
    destinationLocationId: row.destination_location_id,
    destinationLocationName: row.destination_location_name || null,
    movementType: row.movement_type,
    movementTypeLabel: meta.label || row.movement_type,
    quantityIn: Number(row.quantity_in || 0),
    quantityOut: Number(row.quantity_out || 0),
    netQuantity: Number(row.quantity_in || 0) - Number(row.quantity_out || 0),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    requiresApproval: Boolean(row.requires_approval),
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name || null,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStock(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name || null,
    productSku: row.product_sku || null,
    barcode: row.barcode || null,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    warehouseCode: row.warehouse_code || null,
    quantityOnHand: Number(row.quantity_on_hand || 0),
    quantityReserved: Number(row.quantity_reserved || 0),
    quantityAvailable: Number(row.quantity_available || 0),
    reorderLevel: Number(row.reorder_level || 0),
    minimumStock: Number(row.minimum_stock || 0),
    lastMovementId: row.last_movement_id,
    lastMovementAt: row.last_movement_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MOVEMENT_SELECT = `
  SELECT m.*,
    p.name as product_name, p.sku as product_sku,
    w.name as warehouse_name, w.code as warehouse_code,
    sl.name as source_location_name,
    dl.name as destination_location_name,
    cu.full_name as created_by_name,
    au.full_name as approved_by_name
  FROM inventory_movements m
  JOIN products p ON p.id = m.product_id
  JOIN warehouses w ON w.id = m.warehouse_id
  LEFT JOIN warehouse_locations sl ON sl.id = m.source_location_id
  LEFT JOIN warehouse_locations dl ON dl.id = m.destination_location_id
  LEFT JOIN users cu ON cu.id = m.created_by
  LEFT JOIN users au ON au.id = m.approved_by
`;

export class WarehouseRepository {
  findAll({ includeInactive = false } = {}) {
    const db = getDatabase();
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return db.prepare(`SELECT * FROM warehouses ${where} ORDER BY is_default DESC, name ASC`).all().map(mapWarehouse);
  }

  findById(id) {
    const db = getDatabase();
    return mapWarehouse(db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id));
  }

  findDefault() {
    const db = getDatabase();
    return mapWarehouse(
      db.prepare('SELECT * FROM warehouses WHERE is_default = 1 AND is_active = 1 LIMIT 1').get()
      || db.prepare('SELECT * FROM warehouses WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1').get()
    );
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO warehouses (id, code, name, address, city, state, is_default, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id, data.code, data.name, data.address || null, data.city || null, data.state || null,
      data.isDefault ? 1 : 0, now, now, data.createdBy || null
    );
    return this.findById(id);
  }
}

export class WarehouseLocationRepository {
  findByWarehouse(warehouseId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM warehouse_locations
      WHERE warehouse_id = ? AND is_active = 1
      ORDER BY is_default DESC, name ASC
    `).all(warehouseId).map(mapLocation);
  }

  findById(id) {
    const db = getDatabase();
    return mapLocation(db.prepare('SELECT * FROM warehouse_locations WHERE id = ?').get(id));
  }

  findDefault(warehouseId) {
    const db = getDatabase();
    return mapLocation(
      db.prepare(`
        SELECT * FROM warehouse_locations
        WHERE warehouse_id = ? AND is_active = 1
        ORDER BY is_default DESC, created_at ASC LIMIT 1
      `).get(warehouseId)
    );
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, code, name, location_type, is_default, is_active, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id, data.warehouseId, data.code, data.name, data.locationType || 'default',
      data.isDefault ? 1 : 0, now, now, data.createdBy || null
    );
    return this.findById(id);
  }
}

export class StockLevelRepository {
  findByProductWarehouse(productId, warehouseId) {
    const db = getDatabase();
    return mapStock(db.prepare(`
      SELECT s.*, p.name as product_name, p.sku as product_sku, p.barcode, p.reorder_level, p.minimum_stock,
             w.name as warehouse_name, w.code as warehouse_code
      FROM stock_levels s
      JOIN products p ON p.id = s.product_id
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = ? AND s.warehouse_id = ?
    `).get(productId, warehouseId));
  }

  ensureRow(productId, warehouseId) {
    const existing = this.findByProductWarehouse(productId, warehouseId);
    if (existing) return existing;

    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO stock_levels (
        id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available,
        created_at, updated_at
      ) VALUES (?, ?, ?, 0, 0, 0, ?, ?)
    `).run(id, productId, warehouseId, now, now);

    return this.findByProductWarehouse(productId, warehouseId);
  }

  /**
   * Apply stock delta. ONLY called by the movement engine.
   */
  applyDelta(productId, warehouseId, { onHandDelta = 0, reservedDelta = 0, movementId = null }) {
    const db = getDatabase();
    this.ensureRow(productId, warehouseId);
    const now = nowIso();

    db.prepare(`
      UPDATE stock_levels SET
        quantity_on_hand = quantity_on_hand + ?,
        quantity_reserved = quantity_reserved + ?,
        quantity_available = (quantity_on_hand + ?) - (quantity_reserved + ?),
        last_movement_id = COALESCE(?, last_movement_id),
        last_movement_at = ?,
        updated_at = ?
      WHERE product_id = ? AND warehouse_id = ?
    `).run(
      onHandDelta, reservedDelta, onHandDelta, reservedDelta,
      movementId, now, now, productId, warehouseId
    );

    return this.findByProductWarehouse(productId, warehouseId);
  }

  listProductStock({ productId = '', warehouseId = '', search = '', lowStockOnly = false, limit = 200, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = [];
    const params = [];

    if (productId) {
      conditions.push('s.product_id = ?');
      params.push(productId);
    }
    if (warehouseId) {
      conditions.push('s.warehouse_id = ?');
      params.push(warehouseId);
    }
    if (search) {
      conditions.push('(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.barcode, \'\')) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }
    if (lowStockOnly) {
      conditions.push('s.quantity_available <= p.reorder_level');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);

    const items = db.prepare(`
      SELECT s.*, p.name as product_name, p.sku as product_sku, p.barcode, p.reorder_level, p.minimum_stock,
             w.name as warehouse_name, w.code as warehouse_code
      FROM stock_levels s
      JOIN products p ON p.id = s.product_id
      JOIN warehouses w ON w.id = s.warehouse_id
      ${where}
      ORDER BY p.name ASC, w.name ASC
      LIMIT ? OFFSET ?
    `).all(...params).map(mapStock);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_levels s
      JOIN products p ON p.id = s.product_id
      JOIN warehouses w ON w.id = s.warehouse_id
      ${where}
    `).get(...countParams).count;

    return { items, total, limit, offset };
  }

  /**
   * Recompute stock from completed movements (integrity check / repair).
   */
  recomputeFromMovements(productId, warehouseId) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN movement_type NOT IN ('reserved_stock', 'released_stock')
          THEN quantity_in - quantity_out ELSE 0 END), 0) as on_hand,
        COALESCE(SUM(CASE
          WHEN movement_type = 'reserved_stock' THEN quantity_out
          WHEN movement_type = 'released_stock' THEN -quantity_in
          ELSE 0 END), 0) as reserved
      FROM inventory_movements
      WHERE product_id = ? AND warehouse_id = ? AND status = 'completed'
    `).get(productId, warehouseId);

    this.ensureRow(productId, warehouseId);
    const onHand = Number(row.on_hand || 0);
    const reserved = Number(row.reserved || 0);
    const now = nowIso();

    db.prepare(`
      UPDATE stock_levels SET
        quantity_on_hand = ?,
        quantity_reserved = ?,
        quantity_available = ?,
        updated_at = ?
      WHERE product_id = ? AND warehouse_id = ?
    `).run(onHand, reserved, onHand - reserved, now, productId, warehouseId);

    return this.findByProductWarehouse(productId, warehouseId);
  }
}

export class InventoryMovementRepository {
  findById(id) {
    const db = getDatabase();
    return mapMovement(db.prepare(`${MOVEMENT_SELECT} WHERE m.id = ?`).get(id));
  }

  findAll(filters = {}) {
    const db = getDatabase();
    const {
      productId = '',
      warehouseId = '',
      movementType = '',
      status = '',
      dateFrom = '',
      dateTo = '',
      search = '',
      limit = 100,
      offset = 0,
    } = filters;

    const conditions = [];
    const params = [];

    if (productId) {
      conditions.push('m.product_id = ?');
      params.push(productId);
    }
    if (warehouseId) {
      conditions.push('m.warehouse_id = ?');
      params.push(warehouseId);
    }
    if (movementType) {
      conditions.push('m.movement_type = ?');
      params.push(movementType);
    }
    if (status) {
      conditions.push('m.status = ?');
      params.push(status);
    }
    if (dateFrom) {
      conditions.push('m.created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('m.created_at <= ?');
      params.push(dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`);
    }
    if (search) {
      conditions.push('(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(m.reason, \'\')) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);

    const items = db.prepare(`
      ${MOVEMENT_SELECT}
      ${where}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params).map(mapMovement);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      JOIN warehouses w ON w.id = m.warehouse_id
      ${where}
    `).get(...countParams).count;

    return { items, total, limit, offset };
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();

    db.prepare(`
      INSERT INTO inventory_movements (
        id, product_id, warehouse_id, source_location_id, destination_location_id,
        movement_type, quantity_in, quantity_out, reference_type, reference_id,
        reason, notes, status, requires_approval, approved_by, approved_at,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.productId,
      data.warehouseId,
      data.sourceLocationId || null,
      data.destinationLocationId || null,
      data.movementType,
      Number(data.quantityIn || 0),
      Number(data.quantityOut || 0),
      data.referenceType || null,
      data.referenceId || null,
      data.reason || null,
      data.notes || null,
      data.status,
      data.requiresApproval ? 1 : 0,
      data.approvedBy || null,
      data.approvedAt || null,
      data.createdBy || null,
      now,
      now
    );

    return this.findById(id);
  }

  updateStatus(id, { status, approvedBy = null, approvedAt = null, rejectionReason = null }) {
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE inventory_movements SET
        status = ?,
        approved_by = COALESCE(?, approved_by),
        approved_at = COALESCE(?, approved_at),
        rejection_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(status, approvedBy, approvedAt, rejectionReason, now, id);
    return this.findById(id);
  }
}
