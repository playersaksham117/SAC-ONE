import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

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
    parentId: row.parent_id || null,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    fullCode: row.full_code || row.code,
    qrPayload: row.qr_payload || `SACONE:LOC:${row.id}`,
    capacity: row.capacity == null ? null : Number(row.capacity),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    parentName: row.parent_name || null,
    warehouseName: row.warehouse_name || null,
    occupied: row.occupied == null ? null : Number(row.occupied),
  };
}

function mapLocationStock(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name || null,
    productSku: row.product_sku || null,
    locationId: row.location_id,
    locationCode: row.location_code || null,
    locationName: row.location_name || null,
    locationType: row.location_type || null,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    quantityOnHand: Number(row.quantity_on_hand || 0),
    quantityReserved: Number(row.quantity_reserved || 0),
    quantityAvailable: Number(row.quantity_available || 0),
    lastMovementAt: row.last_movement_at,
  };
}

function mapTransfer(row) {
  if (!row) return null;
  return {
    id: row.id,
    transferNumber: row.transfer_number,
    sourceWarehouseId: row.source_warehouse_id,
    sourceWarehouseName: row.source_warehouse_name || null,
    destinationWarehouseId: row.destination_warehouse_id,
    destinationWarehouseName: row.destination_warehouse_name || null,
    sourceLocationId: row.source_location_id,
    sourceLocationName: row.source_location_name || null,
    destinationLocationId: row.destination_location_id,
    destinationLocationName: row.destination_location_name || null,
    status: row.status,
    requiresApproval: Boolean(row.requires_approval),
    reason: row.reason,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name || null,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    completedAt: row.completed_at,
    transferOutMovementId: row.transfer_out_movement_id,
    transferInMovementId: row.transfer_in_movement_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStockCount(row) {
  if (!row) return null;
  return {
    id: row.id,
    countNumber: row.count_number,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    locationId: row.location_id,
    locationName: row.location_name || null,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WarehouseRepository {
  findAll({ includeInactive = true } = {}) {
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

  codeExists(code, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM warehouses WHERE LOWER(code) = LOWER(?) AND id != ?').get(code, excludeId)
      : db.prepare('SELECT id FROM warehouses WHERE LOWER(code) = LOWER(?)').get(code);
    return Boolean(row);
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    if (data.isDefault) {
      db.prepare('UPDATE warehouses SET is_default = 0').run();
    }
    db.prepare(`
      INSERT INTO warehouses (id, code, name, address, city, state, is_default, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id, data.code, data.name, data.address || null, data.city || null, data.state || null,
      data.isDefault ? 1 : 0, now, now, data.createdBy || null
    );
    return this.findById(id);
  }

  update(id, data) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();
    if (data.isDefault) {
      db.prepare('UPDATE warehouses SET is_default = 0 WHERE id != ?').run(id);
    }
    db.prepare(`
      UPDATE warehouses SET
        code = ?, name = ?, address = ?, city = ?, state = ?,
        is_default = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.code ?? existing.code,
      data.name ?? existing.name,
      data.address !== undefined ? data.address : existing.address,
      data.city !== undefined ? data.city : existing.city,
      data.state !== undefined ? data.state : existing.state,
      data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : (existing.isDefault ? 1 : 0),
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      now,
      id
    );
    return this.findById(id);
  }

  getSummary(id) {
    const db = getDatabase();
    const warehouse = this.findById(id);
    if (!warehouse) return null;

    const locations = db.prepare(`
      SELECT location_type, COUNT(*) as count
      FROM warehouse_locations WHERE warehouse_id = ? AND is_active = 1
      GROUP BY location_type
    `).all(id);

    const stock = db.prepare(`
      SELECT
        COUNT(*) as sku_count,
        COALESCE(SUM(quantity_on_hand), 0) as total_on_hand,
        COALESCE(SUM(quantity_available), 0) as total_available
      FROM stock_levels WHERE warehouse_id = ?
    `).get(id);

    const occupancy = db.prepare(`
      SELECT
        COUNT(*) as location_count,
        COALESCE(SUM(CASE WHEN capacity IS NOT NULL AND capacity > 0 THEN 1 ELSE 0 END), 0) as capacitated,
        COALESCE(SUM(capacity), 0) as total_capacity,
        COALESCE((
          SELECT SUM(quantity_on_hand) FROM location_stock_levels WHERE warehouse_id = ?
        ), 0) as occupied_qty
      FROM warehouse_locations
      WHERE warehouse_id = ? AND is_active = 1 AND location_type IN ('bin', 'cell', 'shelf')
    `).get(id, id);

    const pendingTransfers = db.prepare(`
      SELECT COUNT(*) as count FROM warehouse_transfers
      WHERE (source_warehouse_id = ? OR destination_warehouse_id = ?)
        AND status IN ('pending_approval', 'approved', 'in_transit')
    `).get(id, id).count;

    const openCounts = db.prepare(`
      SELECT COUNT(*) as count FROM stock_counts
      WHERE warehouse_id = ? AND status IN ('draft', 'in_progress', 'pending_approval')
    `).get(id).count;

    return {
      warehouse,
      locationBreakdown: Object.fromEntries(locations.map((l) => [l.location_type, l.count])),
      stock: {
        skuCount: Number(stock.sku_count || 0),
        totalOnHand: Number(stock.total_on_hand || 0),
        totalAvailable: Number(stock.total_available || 0),
      },
      occupancy: {
        storageLocations: Number(occupancy.location_count || 0),
        capacitatedLocations: Number(occupancy.capacitated || 0),
        totalCapacity: Number(occupancy.total_capacity || 0),
        occupiedQty: Number(occupancy.occupied_qty || 0),
        occupancyPercent: occupancy.total_capacity > 0
          ? Math.min(100, Math.round((Number(occupancy.occupied_qty || 0) / Number(occupancy.total_capacity)) * 1000) / 10)
          : null,
      },
      pendingTransfers,
      openCounts,
    };
  }
}

export class WarehouseLocationRepository {
  findById(id) {
    const db = getDatabase();
    return mapLocation(db.prepare(`
      SELECT l.*, p.name as parent_name, w.name as warehouse_name
      FROM warehouse_locations l
      LEFT JOIN warehouse_locations p ON p.id = l.parent_id
      JOIN warehouses w ON w.id = l.warehouse_id
      WHERE l.id = ?
    `).get(id));
  }

  findByQrPayload(payload) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT l.*, p.name as parent_name, w.name as warehouse_name
      FROM warehouse_locations l
      LEFT JOIN warehouse_locations p ON p.id = l.parent_id
      JOIN warehouses w ON w.id = l.warehouse_id
      WHERE l.qr_payload = ? OR l.id = ?
    `).get(payload, payload.replace(/^SACONE:LOC:/, ''));
    return mapLocation(row);
  }

  findByWarehouse(warehouseId, { includeInactive = false, locationType = null } = {}) {
    const db = getDatabase();
    const conditions = ['l.warehouse_id = ?'];
    const params = [warehouseId];
    if (!includeInactive) conditions.push('l.is_active = 1');
    if (locationType) {
      conditions.push('l.location_type = ?');
      params.push(locationType);
    }
    return db.prepare(`
      SELECT l.*, p.name as parent_name, w.name as warehouse_name
      FROM warehouse_locations l
      LEFT JOIN warehouse_locations p ON p.id = l.parent_id
      JOIN warehouses w ON w.id = l.warehouse_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.location_type, l.sort_order, l.code
    `).all(...params).map(mapLocation);
  }

  findDefault(warehouseId) {
    const db = getDatabase();
    return mapLocation(db.prepare(`
      SELECT l.*, NULL as parent_name, w.name as warehouse_name
      FROM warehouse_locations l
      JOIN warehouses w ON w.id = l.warehouse_id
      WHERE l.warehouse_id = ? AND l.is_active = 1
      ORDER BY
        CASE l.location_type WHEN 'bin' THEN 1 WHEN 'cell' THEN 2 WHEN 'shelf' THEN 3 WHEN 'default' THEN 4 ELSE 5 END,
        l.is_default DESC, l.created_at ASC
      LIMIT 1
    `).get(warehouseId));
  }

  findLeafLocations(warehouseId) {
    return this.findByWarehouse(warehouseId).filter((l) => ['bin', 'cell', 'shelf', 'default'].includes(l.locationType));
  }

  codeExists(warehouseId, code, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM warehouse_locations WHERE warehouse_id = ? AND LOWER(code) = LOWER(?) AND id != ?').get(warehouseId, code, excludeId)
      : db.prepare('SELECT id FROM warehouse_locations WHERE warehouse_id = ? AND LOWER(code) = LOWER(?)').get(warehouseId, code);
    return Boolean(row);
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const qrPayload = data.qrPayload || `SACONE:LOC:${id}`;
    const fullCode = data.fullCode || data.code;

    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
        capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      data.warehouseId,
      data.parentId || null,
      data.code,
      data.name,
      data.locationType,
      fullCode,
      qrPayload,
      data.capacity ?? null,
      data.isDefault ? 1 : 0,
      data.sortOrder || 0,
      now,
      now,
      data.createdBy || null
    );
    return this.findById(id);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE warehouse_locations SET
        parent_id = ?, code = ?, name = ?, location_type = ?, full_code = ?,
        qr_payload = ?, capacity = ?, is_default = ?, is_active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.parentId !== undefined ? (data.parentId || null) : existing.parentId,
      data.code ?? existing.code,
      data.name ?? existing.name,
      data.locationType ?? existing.locationType,
      data.fullCode ?? data.code ?? existing.fullCode,
      data.qrPayload ?? existing.qrPayload,
      data.capacity !== undefined ? data.capacity : existing.capacity,
      data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : (existing.isDefault ? 1 : 0),
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
      now,
      id
    );
    return this.findById(id);
  }

  getHierarchy(warehouseId) {
    const locations = this.findByWarehouse(warehouseId, { includeInactive: true });
    const byParent = new Map();
    for (const loc of locations) {
      const key = loc.parentId || 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(loc);
    }
    const build = (parentId) => (byParent.get(parentId || 'root') || []).map((node) => ({
      ...node,
      children: build(node.id),
    }));
    return build(null);
  }

  getOccupancy(warehouseId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT l.*,
        COALESCE((SELECT SUM(quantity_on_hand) FROM location_stock_levels ls WHERE ls.location_id = l.id), 0) as occupied,
        w.name as warehouse_name
      FROM warehouse_locations l
      JOIN warehouses w ON w.id = l.warehouse_id
      WHERE l.warehouse_id = ? AND l.is_active = 1
        AND l.location_type IN ('bin', 'cell', 'shelf', 'default')
      ORDER BY l.full_code, l.code
    `).all(warehouseId).map((row) => {
      const mapped = mapLocation(row);
      const occupied = Number(row.occupied || 0);
      return {
        ...mapped,
        occupied,
        freeCapacity: mapped.capacity == null ? null : Math.max(0, mapped.capacity - occupied),
        occupancyPercent: mapped.capacity
          ? Math.min(100, Math.round((occupied / mapped.capacity) * 1000) / 10)
          : null,
      };
    });
  }
}

export class LocationStockRepository {
  ensureRow(productId, locationId, warehouseId) {
    const existing = this.findByProductLocation(productId, locationId);
    if (existing) return existing;
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO location_stock_levels (
        id, product_id, location_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(id, productId, locationId, warehouseId, now, now);
    return this.findByProductLocation(productId, locationId);
  }

  findByProductLocation(productId, locationId) {
    const db = getDatabase();
    return mapLocationStock(db.prepare(`
      SELECT ls.*, p.name as product_name, p.sku as product_sku,
             l.code as location_code, l.name as location_name, l.location_type,
             w.name as warehouse_name
      FROM location_stock_levels ls
      JOIN products p ON p.id = ls.product_id
      JOIN warehouse_locations l ON l.id = ls.location_id
      JOIN warehouses w ON w.id = ls.warehouse_id
      WHERE ls.product_id = ? AND ls.location_id = ?
    `).get(productId, locationId));
  }

  applyDelta(productId, locationId, warehouseId, { onHandDelta = 0, reservedDelta = 0, movementId = null }) {
    this.ensureRow(productId, locationId, warehouseId);
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE location_stock_levels SET
        quantity_on_hand = quantity_on_hand + ?,
        quantity_reserved = quantity_reserved + ?,
        quantity_available = (quantity_on_hand + ?) - (quantity_reserved + ?),
        last_movement_id = COALESCE(?, last_movement_id),
        last_movement_at = ?,
        updated_at = ?
      WHERE product_id = ? AND location_id = ?
    `).run(onHandDelta, reservedDelta, onHandDelta, reservedDelta, movementId, now, now, productId, locationId);
    return this.findByProductLocation(productId, locationId);
  }

  list({ warehouseId = '', locationId = '', productId = '', limit = 200, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = ['ls.quantity_on_hand != 0 OR ls.quantity_reserved != 0'];
    const params = [];
    if (warehouseId) { conditions.push('ls.warehouse_id = ?'); params.push(warehouseId); }
    if (locationId) { conditions.push('ls.location_id = ?'); params.push(locationId); }
    if (productId) { conditions.push('ls.product_id = ?'); params.push(productId); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      SELECT ls.*, p.name as product_name, p.sku as product_sku,
             l.code as location_code, l.name as location_name, l.location_type,
             w.name as warehouse_name
      FROM location_stock_levels ls
      JOIN products p ON p.id = ls.product_id
      JOIN warehouse_locations l ON l.id = ls.location_id
      JOIN warehouses w ON w.id = ls.warehouse_id
      ${where}
      ORDER BY w.name, l.full_code, p.name
      LIMIT ? OFFSET ?
    `).all(...params).map(mapLocationStock);
    const total = db.prepare(`SELECT COUNT(*) as count FROM location_stock_levels ls ${where}`).get(...countParams).count;
    return { items, total, limit, offset };
  }
}

const TRANSFER_SELECT = `
  SELECT t.*,
    sw.name as source_warehouse_name, dw.name as destination_warehouse_name,
    sl.name as source_location_name, dl.name as destination_location_name,
    cu.full_name as created_by_name, au.full_name as approved_by_name
  FROM warehouse_transfers t
  JOIN warehouses sw ON sw.id = t.source_warehouse_id
  JOIN warehouses dw ON dw.id = t.destination_warehouse_id
  LEFT JOIN warehouse_locations sl ON sl.id = t.source_location_id
  LEFT JOIN warehouse_locations dl ON dl.id = t.destination_location_id
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users au ON au.id = t.approved_by
`;

export class WarehouseTransferRepository {
  nextNumber() {
    const db = getDatabase();
    const count = db.prepare('SELECT COUNT(*) as count FROM warehouse_transfers').get().count;
    return `TRF-${String(count + 1).padStart(5, '0')}`;
  }

  findById(id) {
    const db = getDatabase();
    const transfer = mapTransfer(db.prepare(`${TRANSFER_SELECT} WHERE t.id = ?`).get(id));
    if (!transfer) return null;
    transfer.items = this.getItems(id);
    return transfer;
  }

  getItems(transferId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT i.*, p.name as product_name, p.sku as product_sku
      FROM warehouse_transfer_items i
      JOIN products p ON p.id = i.product_id
      WHERE i.transfer_id = ?
    `).all(transferId).map((row) => ({
      id: row.id,
      transferId: row.transfer_id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      quantity: Number(row.quantity),
      notes: row.notes,
      createdAt: row.created_at,
    }));
  }

  findAll({ status = '', warehouseId = '', dateFrom = '', dateTo = '', limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = [];
    const params = [];
    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (dateFrom) { conditions.push('substr(t.created_at, 1, 10) >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('substr(t.created_at, 1, 10) <= ?'); params.push(dateTo); }
    if (warehouseId) {
      conditions.push('(t.source_warehouse_id = ? OR t.destination_warehouse_id = ?)');
      params.push(warehouseId, warehouseId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      ${TRANSFER_SELECT} ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `).all(...params).map(mapTransfer);
    const total = db.prepare(`SELECT COUNT(*) as count FROM warehouse_transfers t ${where}`).get(...countParams).count;
    return { items, total, limit, offset };
  }

  create({ header, items }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const transferNumber = header.transferNumber || this.nextNumber();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO warehouse_transfers (
          id, transfer_number, source_warehouse_id, destination_warehouse_id,
          source_location_id, destination_location_id, status, requires_approval,
          reason, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, transferNumber, header.sourceWarehouseId, header.destinationWarehouseId,
        header.sourceLocationId || null, header.destinationLocationId || null,
        header.status, header.requiresApproval ? 1 : 0,
        header.reason || null, header.notes || null, header.createdBy || null, now, now
      );

      const insertItem = db.prepare(`
        INSERT INTO warehouse_transfer_items (id, transfer_id, product_id, quantity, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(generateId(), id, item.productId, item.quantity, item.notes || null, now);
      }
    });
    tx();
    return this.findById(id);
  }

  updateStatus(id, fields) {
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE warehouse_transfers SET
        status = COALESCE(?, status),
        approved_by = COALESCE(?, approved_by),
        approved_at = COALESCE(?, approved_at),
        rejection_reason = COALESCE(?, rejection_reason),
        completed_at = COALESCE(?, completed_at),
        transfer_out_movement_id = COALESCE(?, transfer_out_movement_id),
        transfer_in_movement_id = COALESCE(?, transfer_in_movement_id),
        updated_at = ?
      WHERE id = ?
    `).run(
      fields.status || null,
      fields.approvedBy || null,
      fields.approvedAt || null,
      fields.rejectionReason || null,
      fields.completedAt || null,
      fields.transferOutMovementId || null,
      fields.transferInMovementId || null,
      now,
      id
    );
    return this.findById(id);
  }
}

export class StockCountRepository {
  nextNumber() {
    const db = getDatabase();
    const count = db.prepare('SELECT COUNT(*) as count FROM stock_counts').get().count;
    return `CNT-${String(count + 1).padStart(5, '0')}`;
  }

  findById(id) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT sc.*, w.name as warehouse_name, l.name as location_name, u.full_name as created_by_name
      FROM stock_counts sc
      JOIN warehouses w ON w.id = sc.warehouse_id
      LEFT JOIN warehouse_locations l ON l.id = sc.location_id
      LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.id = ?
    `).get(id);
    const count = mapStockCount(row);
    if (!count) return null;
    count.items = this.getItems(id);
    return count;
  }

  getItems(stockCountId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT i.*, p.name as product_name, p.sku as product_sku
      FROM stock_count_items i
      JOIN products p ON p.id = i.product_id
      WHERE i.stock_count_id = ?
      ORDER BY p.name
    `).all(stockCountId).map((row) => ({
      id: row.id,
      stockCountId: row.stock_count_id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      systemQuantity: Number(row.system_quantity || 0),
      countedQuantity: row.counted_quantity == null ? null : Number(row.counted_quantity),
      variance: Number(row.variance || 0),
      notes: row.notes,
      adjustmentMovementId: row.adjustment_movement_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findAll({ warehouseId = '', status = '', dateFrom = '', dateTo = '', limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = [];
    const params = [];
    if (warehouseId) { conditions.push('sc.warehouse_id = ?'); params.push(warehouseId); }
    if (status) { conditions.push('sc.status = ?'); params.push(status); }
    if (dateFrom) { conditions.push('substr(sc.created_at, 1, 10) >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('substr(sc.created_at, 1, 10) <= ?'); params.push(dateTo); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      SELECT sc.*, w.name as warehouse_name, l.name as location_name, u.full_name as created_by_name
      FROM stock_counts sc
      JOIN warehouses w ON w.id = sc.warehouse_id
      LEFT JOIN warehouse_locations l ON l.id = sc.location_id
      LEFT JOIN users u ON u.id = sc.created_by
      ${where}
      ORDER BY sc.created_at DESC LIMIT ? OFFSET ?
    `).all(...params).map(mapStockCount);
    const total = db.prepare(`SELECT COUNT(*) as count FROM stock_counts sc ${where}`).get(...countParams).count;
    return { items, total, limit, offset };
  }

  create({ header, items }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO stock_counts (
          id, count_number, warehouse_id, location_id, status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, header.countNumber || this.nextNumber(), header.warehouseId, header.locationId || null,
        header.status || 'draft', header.notes || null, header.createdBy || null, now, now
      );
      const insertItem = db.prepare(`
        INSERT INTO stock_count_items (
          id, stock_count_id, product_id, system_quantity, counted_quantity, variance, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        const counted = item.countedQuantity;
        const systemQty = Number(item.systemQuantity || 0);
        const variance = counted == null ? 0 : Number(counted) - systemQty;
        insertItem.run(
          generateId(), id, item.productId, systemQty,
          counted == null ? null : Number(counted), variance, item.notes || null, now, now
        );
      }
    });
    tx();
    return this.findById(id);
  }

  updateItem(itemId, { countedQuantity, notes }) {
    const db = getDatabase();
    const now = nowIso();
    const existing = db.prepare('SELECT * FROM stock_count_items WHERE id = ?').get(itemId);
    if (!existing) return null;
    const counted = countedQuantity == null ? null : Number(countedQuantity);
    const variance = counted == null ? 0 : counted - Number(existing.system_quantity || 0);
    db.prepare(`
      UPDATE stock_count_items SET counted_quantity = ?, variance = ?, notes = COALESCE(?, notes), updated_at = ?
      WHERE id = ?
    `).run(counted, variance, notes ?? null, now, itemId);
    return true;
  }

  updateStatus(id, fields) {
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE stock_counts SET
        status = COALESCE(?, status),
        approved_by = COALESCE(?, approved_by),
        approved_at = COALESCE(?, approved_at),
        completed_at = COALESCE(?, completed_at),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      fields.status || null,
      fields.approvedBy || null,
      fields.approvedAt || null,
      fields.completedAt || null,
      fields.notes || null,
      now,
      id
    );
    return this.findById(id);
  }

  setItemAdjustment(itemId, movementId) {
    const db = getDatabase();
    db.prepare('UPDATE stock_count_items SET adjustment_movement_id = ?, updated_at = ? WHERE id = ?')
      .run(movementId, nowIso(), itemId);
  }
}
