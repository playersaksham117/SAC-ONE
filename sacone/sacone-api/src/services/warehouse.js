import QRCode from 'qrcode';
import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { inventoryMovementService } from './inventory.js';

const warehouseRepo = repos.warehouses;
const locationRepo = repos.warehouseLocations;
const locationStockRepo = repos.locationStock;
const transferRepo = repos.warehouseTransfers;
const stockCountRepo = repos.stockCounts;
const productRepo = repos.products;
const stockRepo = repos.stockLevels;
const auditRepo = repos.auditLogs;

const LOCATION_TYPES = ['zone', 'rack', 'shelf', 'bin', 'cell', 'receiving', 'shipping', 'default'];
const PARENT_RULES = {
  zone: [null, 'zone'],
  rack: ['zone'],
  shelf: ['rack', 'zone'],
  bin: ['rack', 'shelf', 'zone'],
  cell: ['shelf', 'bin', 'rack'],
  receiving: [null, 'zone'],
  shipping: [null, 'zone'],
  default: [null],
};

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function buildFullCode(parent, code) {
  if (!parent?.fullCode && !parent?.code) return code;
  return `${parent.fullCode || parent.code}-${code}`;
}

export class WarehouseService {
  list(actor, { includeInactive = true } = {}) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.view');
    return warehouseRepo.findAll({ includeInactive });
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.view');
    const warehouse = warehouseRepo.findById(id);
    if (!warehouse) throw new AppError('Warehouse not found', 404);
    return warehouse;
  }

  getSummary(id, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.view');
    const summary = warehouseRepo.getSummary(id);
    if (!summary) throw new AppError('Warehouse not found', 404);
    return summary;
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.create');
    if (!data.code?.trim() || !data.name?.trim()) {
      throw new AppError('Warehouse code and name are required', 400);
    }
    if (warehouseRepo.codeExists(data.code.trim())) {
      throw new AppError('Warehouse code already exists', 409);
    }

    const warehouse = warehouseRepo.create({
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      address: data.address,
      city: data.city,
      state: data.state,
      isDefault: Boolean(data.isDefault),
      createdBy: actor.user.id,
    });

    // Default hierarchy seed: Zone A -> Rack 01 -> Bin 01
    const zone = locationRepo.create({
      warehouseId: warehouse.id,
      code: 'Z-A',
      name: 'Zone A',
      locationType: 'zone',
      fullCode: `${warehouse.code}-Z-A`,
      createdBy: actor.user.id,
    });
    const rack = locationRepo.create({
      warehouseId: warehouse.id,
      parentId: zone.id,
      code: 'R-01',
      name: 'Rack 01',
      locationType: 'rack',
      fullCode: `${warehouse.code}-Z-A-R-01`,
      createdBy: actor.user.id,
    });
    locationRepo.create({
      warehouseId: warehouse.id,
      parentId: rack.id,
      code: 'B-01',
      name: 'Bin 01',
      locationType: 'bin',
      fullCode: `${warehouse.code}-Z-A-R-01-B-01`,
      capacity: data.defaultBinCapacity ?? 1000,
      isDefault: true,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'warehouse',
      recordType: 'warehouse',
      recordId: warehouse.id,
      newValue: warehouse,
      ...getRequestMeta(req),
    });

    return warehouseRepo.getSummary(warehouse.id);
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.edit');
    const existing = warehouseRepo.findById(id);
    if (!existing) throw new AppError('Warehouse not found', 404);
    if (data.code && warehouseRepo.codeExists(data.code.trim(), id)) {
      throw new AppError('Warehouse code already exists', 409);
    }

    const updated = warehouseRepo.update(id, {
      ...data,
      code: data.code ? data.code.trim().toUpperCase() : undefined,
      name: data.name ? data.name.trim() : undefined,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: data.isActive === false ? 'deactivate' : 'update',
      module: 'warehouse',
      recordType: 'warehouse',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  }

  // ── Locations ──────────────────────────────────────────
  getHierarchy(warehouseId, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.view');
    if (!warehouseRepo.findById(warehouseId)) throw new AppError('Warehouse not found', 404);
    return locationRepo.getHierarchy(warehouseId);
  }

  listLocations(warehouseId, actor, query = {}) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.view');
    return locationRepo.findByWarehouse(warehouseId, {
      includeInactive: query.includeInactive === 'true',
      locationType: query.locationType || null,
    });
  }

  createLocation(data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.create');
    const warehouse = warehouseRepo.findById(data.warehouseId);
    if (!warehouse) throw new AppError('Warehouse not found', 404);
    if (!LOCATION_TYPES.includes(data.locationType)) {
      throw new AppError('Invalid location type', 400);
    }
    if (!data.code?.trim() || !data.name?.trim()) {
      throw new AppError('Location code and name are required', 400);
    }
    if (locationRepo.codeExists(data.warehouseId, data.code.trim())) {
      throw new AppError('Location code already exists in this warehouse', 409);
    }

    let parent = null;
    if (data.parentId) {
      parent = locationRepo.findById(data.parentId);
      if (!parent || parent.warehouseId !== data.warehouseId) {
        throw new AppError('Invalid parent location', 400);
      }
    }
    const allowedParents = PARENT_RULES[data.locationType] || [null];
    const parentType = parent?.locationType || null;
    if (!allowedParents.includes(parentType)) {
      throw new AppError(`${data.locationType} cannot be placed under ${parentType || 'warehouse root'}`, 400);
    }

    const code = data.code.trim().toUpperCase();
    const location = locationRepo.create({
      warehouseId: data.warehouseId,
      parentId: data.parentId || null,
      code,
      name: data.name.trim(),
      locationType: data.locationType,
      fullCode: buildFullCode(parent ? { fullCode: parent.fullCode || `${warehouse.code}-${parent.code}` } : { fullCode: warehouse.code }, code),
      capacity: data.capacity,
      isDefault: Boolean(data.isDefault),
      sortOrder: data.sortOrder || 0,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'warehouse',
      recordType: 'warehouse_location',
      recordId: location.id,
      newValue: location,
      ...getRequestMeta(req),
    });

    return location;
  }

  updateLocation(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.edit');
    const existing = locationRepo.findById(id);
    if (!existing) throw new AppError('Location not found', 404);
    if (data.code && locationRepo.codeExists(existing.warehouseId, data.code.trim(), id)) {
      throw new AppError('Location code already exists in this warehouse', 409);
    }

    const updated = locationRepo.update(id, {
      ...data,
      code: data.code ? data.code.trim().toUpperCase() : undefined,
      name: data.name ? data.name.trim() : undefined,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'warehouse',
      recordType: 'warehouse_location',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  }

  async getLocationQr(id, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.view');
    const location = locationRepo.findById(id);
    if (!location) throw new AppError('Location not found', 404);
    const payload = location.qrPayload || `SACONE:LOC:${location.id}`;
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 256 });
    return {
      locationId: location.id,
      code: location.code,
      fullCode: location.fullCode,
      name: location.name,
      payload,
      qrDataUrl: dataUrl,
    };
  }

  scanLocation(payload, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.view');
    if (!payload) throw new AppError('QR payload is required', 400);
    const location = locationRepo.findByQrPayload(String(payload).trim());
    if (!location) throw new AppError('Location not found for QR payload', 404);
    return location;
  }

  getWarehouseStock(warehouseId, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.warehouses.view');
    return inventoryMovementService.getWarehouseStock(warehouseId, actor);
  }

  getLocationStock(filters, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.locations.view');
    return locationStockRepo.list({
      warehouseId: filters.warehouseId || '',
      locationId: filters.locationId || '',
      productId: filters.productId || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 200,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getOccupancy(warehouseId, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.occupancy.view');
    if (!warehouseRepo.findById(warehouseId)) throw new AppError('Warehouse not found', 404);
    return locationRepo.getOccupancy(warehouseId);
  }

  // ── Transfers ──────────────────────────────────────────
  listTransfers(filters, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.transfers.view');
    return transferRepo.findAll({
      status: filters.status || '',
      warehouseId: filters.warehouseId || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getTransfer(id, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.transfers.view');
    const transfer = transferRepo.findById(id);
    if (!transfer) throw new AppError('Transfer not found', 404);
    return transfer;
  }

  createTransfer(data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.transfers.create');

    if (!data.sourceWarehouseId || !data.destinationWarehouseId) {
      throw new AppError('Source and destination warehouses are required', 400);
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError('At least one transfer item is required', 400);
    }

    const sourceWh = warehouseRepo.findById(data.sourceWarehouseId);
    const destWh = warehouseRepo.findById(data.destinationWarehouseId);
    if (!sourceWh?.isActive || !destWh?.isActive) {
      throw new AppError('Source and destination warehouses must be active', 400);
    }

    if (data.sourceLocationId) {
      const loc = locationRepo.findById(data.sourceLocationId);
      if (!loc || loc.warehouseId !== data.sourceWarehouseId) {
        throw new AppError('Invalid source location', 400);
      }
    }
    if (data.destinationLocationId) {
      const loc = locationRepo.findById(data.destinationLocationId);
      if (!loc || loc.warehouseId !== data.destinationWarehouseId) {
        throw new AppError('Invalid destination location', 400);
      }
    }

    const items = data.items.map((item) => {
      if (!item.productId || !productRepo.findById(item.productId)) {
        throw new AppError('Invalid product in transfer items', 400);
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new AppError('Transfer quantity must be positive', 400);
      }
      return { productId: item.productId, quantity: qty, notes: item.notes };
    });

    // Same location transfer is invalid
    if (
      data.sourceWarehouseId === data.destinationWarehouseId
      && data.sourceLocationId
      && data.destinationLocationId
      && data.sourceLocationId === data.destinationLocationId
    ) {
      throw new AppError('Source and destination locations must differ', 400);
    }

    const requiresApproval = data.requiresApproval !== false; // default true for safety
    const status = requiresApproval ? 'pending_approval' : 'approved';

    const transfer = transferRepo.create({
      header: {
        sourceWarehouseId: data.sourceWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        sourceLocationId: data.sourceLocationId || null,
        destinationLocationId: data.destinationLocationId || null,
        status,
        requiresApproval,
        reason: data.reason,
        notes: data.notes,
        createdBy: actor.user.id,
      },
      items,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'warehouse',
      recordType: 'warehouse_transfer',
      recordId: transfer.id,
      newValue: transfer,
      ...getRequestMeta(req),
    });

    // Auto-execute when approval not required
    if (!requiresApproval) {
      return this.executeTransfer(transfer.id, actor, req);
    }

    return transfer;
  }

  approveTransfer(id, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.transfers.approve');
    const transfer = transferRepo.findById(id);
    if (!transfer) throw new AppError('Transfer not found', 404);
    if (transfer.status !== 'pending_approval') {
      throw new AppError('Only pending transfers can be approved', 400);
    }

    transferRepo.updateStatus(id, {
      status: 'approved',
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'warehouse',
      recordType: 'warehouse_transfer',
      recordId: id,
      ...getRequestMeta(req),
    });

    return this.executeTransfer(id, actor, req);
  }

  rejectTransfer(id, reason, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.transfers.approve');
    const transfer = transferRepo.findById(id);
    if (!transfer) throw new AppError('Transfer not found', 404);
    if (transfer.status !== 'pending_approval') {
      throw new AppError('Only pending transfers can be rejected', 400);
    }

    const updated = transferRepo.updateStatus(id, {
      status: 'rejected',
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
      rejectionReason: reason || 'Rejected',
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'reject',
      module: 'warehouse',
      recordType: 'warehouse_transfer',
      recordId: id,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  }

  /**
   * Execute approved transfer:
   * Transfer Out movement -> Transfer In movement (via movement engine only)
   */
  executeTransfer(id, actor, req) {
    const transfer = transferRepo.findById(id);
    if (!transfer) throw new AppError('Transfer not found', 404);
    if (!['approved', 'in_transit'].includes(transfer.status)) {
      throw new AppError('Transfer must be approved before execution', 400);
    }

    transferRepo.updateStatus(id, { status: 'in_transit' });

    let lastOutMovementId = null;
    let lastInMovementId = null;

    for (const item of transfer.items) {
      const outResult = inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId: transfer.sourceWarehouseId,
        sourceLocationId: transfer.sourceLocationId,
        movementType: MOVEMENT_TYPES.TRANSFER_OUT,
        quantity: item.quantity,
        referenceType: 'warehouse_transfer',
        referenceId: transfer.id,
        reason: transfer.reason || `Transfer ${transfer.transferNumber}`,
        notes: item.notes || transfer.notes,
      }, actor, req, { skipPermissionCheck: true });

      const inResult = inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId: transfer.destinationWarehouseId,
        destinationLocationId: transfer.destinationLocationId,
        movementType: MOVEMENT_TYPES.TRANSFER_IN,
        quantity: item.quantity,
        referenceType: 'warehouse_transfer',
        referenceId: transfer.id,
        reason: transfer.reason || `Transfer ${transfer.transferNumber}`,
        notes: item.notes || transfer.notes,
      }, actor, req, { skipPermissionCheck: true });

      lastOutMovementId = outResult.movement.id;
      lastInMovementId = inResult.movement.id;
    }

    const completed = transferRepo.updateStatus(id, {
      status: 'completed',
      completedAt: nowIso(),
      transferOutMovementId: lastOutMovementId,
      transferInMovementId: lastInMovementId,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'complete',
      module: 'warehouse',
      recordType: 'warehouse_transfer',
      recordId: id,
      newValue: completed,
      ...getRequestMeta(req),
    });

    return completed;
  }

  // ── Stock counts ───────────────────────────────────────
  listStockCounts(filters, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.view');
    return stockCountRepo.findAll({
      warehouseId: filters.warehouseId || '',
      status: filters.status || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getStockCount(id, actor) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.view');
    const count = stockCountRepo.findById(id);
    if (!count) throw new AppError('Stock count not found', 404);
    return count;
  }

  createStockCount(data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.create');
    const warehouse = warehouseRepo.findById(data.warehouseId);
    if (!warehouse) throw new AppError('Warehouse not found', 404);

    let systemRows;
    if (data.locationId) {
      const locStock = locationStockRepo.list({ warehouseId: data.warehouseId, locationId: data.locationId, limit: 5000 });
      systemRows = locStock.items.map((r) => ({
        productId: r.productId,
        systemQuantity: r.quantityOnHand,
      }));
    } else {
      const whStock = stockRepo.listProductStock({ warehouseId: data.warehouseId, limit: 5000, offset: 0 });
      systemRows = whStock.items.map((r) => ({
        productId: r.productId,
        systemQuantity: r.quantityOnHand,
      }));
    }

    if (!systemRows.length) {
      throw new AppError('No stock to count in this warehouse/location', 400);
    }

    const count = stockCountRepo.create({
      header: {
        warehouseId: data.warehouseId,
        locationId: data.locationId || null,
        status: 'in_progress',
        notes: data.notes,
        createdBy: actor.user.id,
      },
      items: systemRows,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'warehouse',
      recordType: 'stock_count',
      recordId: count.id,
      newValue: { id: count.id, countNumber: count.countNumber, itemCount: count.items.length },
      ...getRequestMeta(req),
    });

    return count;
  }

  updateCountItem(countId, itemId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.create');
    const count = stockCountRepo.findById(countId);
    if (!count) throw new AppError('Stock count not found', 404);
    if (!['draft', 'in_progress'].includes(count.status)) {
      throw new AppError('Cannot edit a submitted stock count', 400);
    }
    stockCountRepo.updateItem(itemId, data);
    return stockCountRepo.findById(countId);
  }

  submitStockCount(id, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.create');
    const count = stockCountRepo.findById(id);
    if (!count) throw new AppError('Stock count not found', 404);
    if (!['draft', 'in_progress'].includes(count.status)) {
      throw new AppError('Stock count cannot be submitted', 400);
    }
    const incomplete = count.items.filter((i) => i.countedQuantity == null);
    if (incomplete.length) {
      throw new AppError(`${incomplete.length} item(s) still need counted quantities`, 400);
    }

    const updated = stockCountRepo.updateStatus(id, { status: 'pending_approval' });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'submit',
      module: 'warehouse',
      recordType: 'stock_count',
      recordId: id,
      ...getRequestMeta(req),
    });
    return updated;
  }

  approveStockCount(id, actor, req) {
    authService.checkPermission(actor.permissions, 'warehouse.stock_counts.approve');
    const count = stockCountRepo.findById(id);
    if (!count) throw new AppError('Stock count not found', 404);
    if (count.status !== 'pending_approval') {
      throw new AppError('Only pending stock counts can be approved', 400);
    }

    // Post variances via movement engine adjustments (auto-complete by skipping approval on engine)
    for (const item of count.items) {
      if (!item.variance) continue;
      const movementType = item.variance > 0
        ? MOVEMENT_TYPES.ADJUSTMENT_INCREASE
        : MOVEMENT_TYPES.ADJUSTMENT_DECREASE;

      // Create completed adjustment by temporarily using createMovement with requiresApproval false
      // and movement type that normally needs approval — override requiresApproval.
      const result = inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId: count.warehouseId,
        destinationLocationId: item.variance > 0 ? count.locationId : undefined,
        sourceLocationId: item.variance < 0 ? count.locationId : undefined,
        movementType,
        quantity: Math.abs(item.variance),
        requiresApproval: false,
        referenceType: 'stock_count',
        referenceId: count.id,
        reason: `Stock count ${count.countNumber} variance`,
        notes: item.notes,
      }, actor, req, { skipPermissionCheck: true });

      stockCountRepo.setItemAdjustment(item.id, result.movement.id);
    }

    const updated = stockCountRepo.updateStatus(id, {
      status: 'completed',
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
      completedAt: nowIso(),
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'warehouse',
      recordType: 'stock_count',
      recordId: id,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  }
}

export const warehouseService = new WarehouseService();
