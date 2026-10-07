import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_META,
  MOVEMENT_STATUSES,
  MANUAL_MOVEMENT_TYPES,
  ADJUSTMENT_MOVEMENT_TYPES,
} from '../core/inventory-constants.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { nowIso } from '../core/utils.js';

const productRepo = repos.products;
const warehouseRepo = repos.warehouses;
const locationRepo = repos.warehouseLocations;
const stockRepo = repos.stockLevels;
const locationStockRepo = repos.locationStock;
const movementRepo = repos.inventoryMovements;
const auditRepo = repos.auditLogs;

const INVENTORY_VIEW_KEYS = [
  'inventory.stock.view',
  'inventory.movements.view',
  'inventory.adjustments.view',
];

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function toPositiveNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(`${fieldName} must be a positive number`, 400);
  }
  return n;
}

function resolveQuantities(movementType, quantity) {
  const meta = MOVEMENT_TYPE_META[movementType];
  if (!meta) throw new AppError('Invalid movement type', 400);

  const qty = toPositiveNumber(quantity, 'Quantity');

  if (meta.direction === 'in') {
    return { quantityIn: qty, quantityOut: 0 };
  }
  if (meta.direction === 'out') {
    return { quantityIn: 0, quantityOut: qty };
  }
  if (meta.direction === 'reserve') {
    return { quantityIn: 0, quantityOut: qty };
  }
  if (meta.direction === 'release') {
    return { quantityIn: qty, quantityOut: 0 };
  }
  throw new AppError('Unsupported movement direction', 400);
}

function computeStockDeltas(movementType, quantityIn, quantityOut) {
  const meta = MOVEMENT_TYPE_META[movementType];
  let onHandDelta = 0;
  let reservedDelta = 0;

  if (meta.affectsOnHand) {
    onHandDelta = quantityIn - quantityOut;
  }
  if (meta.affectsReserved) {
    if (movementType === MOVEMENT_TYPES.RESERVED_STOCK) {
      reservedDelta = quantityOut;
    } else if (movementType === MOVEMENT_TYPES.RELEASED_STOCK) {
      reservedDelta = -quantityIn;
    }
  }

  return { onHandDelta, reservedDelta };
}

/**
 * Core Inventory Movement Engine.
 * All stock changes MUST go through this service.
 */
export class InventoryMovementService {
  getMovementTypes(options = {}, actor = null) {
    const scope = options.scope || 'all';
    let entries = Object.entries(MOVEMENT_TYPE_META);

    if (scope === 'manual') {
      entries = entries.filter(([value]) => MANUAL_MOVEMENT_TYPES.includes(value));
    }

    if (actor?.permissions && !actor.permissions.includes('*')) {
      const canMove = actor.permissions.includes('inventory.movements.create');
      const canAdjust = actor.permissions.includes('inventory.adjustments.create');
      entries = entries.filter(([value]) => {
        if (ADJUSTMENT_MOVEMENT_TYPES.has(value)) return canAdjust;
        if (scope === 'manual') return canMove;
        return true;
      });
    }

    return entries.map(([value, meta]) => ({
      value,
      ...meta,
    }));
  }

  listWarehouses(actor) {
    authService.checkAnyPermission(actor.permissions, INVENTORY_VIEW_KEYS);
    return warehouseRepo.findAll({ includeInactive: false });
  }

  getStock(filters, actor) {
    authService.checkPermission(actor.permissions, 'inventory.stock.view');
    return stockRepo.listProductStock({
      ...filters,
      limit: filters.limit ? parseInt(filters.limit, 10) : 200,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
      lowStockOnly: filters.lowStockOnly === 'true' || filters.lowStockOnly === true,
    });
  }

  getProductStock(productId, actor, warehouseId = null) {
    authService.checkPermission(actor.permissions, 'inventory.stock.view');
    const product = productRepo.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

    const result = stockRepo.listProductStock({
      productId,
      warehouseId: warehouseId || '',
      limit: 100,
      offset: 0,
    });

    const totals = result.items.reduce((acc, row) => {
      acc.onHand += row.quantityOnHand;
      acc.reserved += row.quantityReserved;
      acc.available += row.quantityAvailable;
      return acc;
    }, { onHand: 0, reserved: 0, available: 0 });

    return { product, warehouses: result.items, totals };
  }

  getWarehouseStock(warehouseId, actor) {
    authService.checkPermission(actor.permissions, 'inventory.stock.view');
    const warehouse = warehouseRepo.findById(warehouseId);
    if (!warehouse) throw new AppError('Warehouse not found', 404);

    const result = stockRepo.listProductStock({ warehouseId, limit: 1000, offset: 0 });
    return { warehouse, ...result };
  }

  listMovements(filters, actor) {
    authService.checkPermission(actor.permissions, 'inventory.movements.view');
    return movementRepo.findAll({
      ...(filters.productId ? filters : withFinancialYear(filters)),
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getMovement(id, actor) {
    authService.checkPermission(actor.permissions, 'inventory.movements.view');
    const movement = movementRepo.findById(id);
    if (!movement) throw new AppError('Movement not found', 404);
    return movement;
  }

  /**
   * Create a standardized inventory movement and apply stock when completed.
   * This is the ONLY path that may change stock_levels.
   */
  createMovement(input, actor, req, { skipPermissionCheck = false } = {}) {
    if (!skipPermissionCheck) {
      if (!MANUAL_MOVEMENT_TYPES.includes(input.movementType)) {
        throw new AppError(
          'This movement type must be created from POS or Warehouse modules',
          400
        );
      }

      if (ADJUSTMENT_MOVEMENT_TYPES.has(input.movementType)) {
        authService.checkPermission(actor.permissions, 'inventory.adjustments.create');
      } else {
        authService.checkPermission(actor.permissions, 'inventory.movements.create');
      }
    }

    const meta = MOVEMENT_TYPE_META[input.movementType];
    if (!meta) throw new AppError('Invalid movement type', 400);

    const product = productRepo.findById(input.productId);
    if (!product || !product.isActive) {
      throw new AppError('Product not found or inactive', 400);
    }

    let warehouseId = input.warehouseId;
    if (!warehouseId) {
      const defaultWh = warehouseRepo.findDefault();
      if (!defaultWh) throw new AppError('No warehouse configured', 400);
      warehouseId = defaultWh.id;
    }

    const warehouse = warehouseRepo.findById(warehouseId);
    if (!warehouse || !warehouse.isActive) {
      throw new AppError('Warehouse not found or inactive', 400);
    }

    const { quantityIn, quantityOut } = resolveQuantities(input.movementType, input.quantity);
    const { onHandDelta, reservedDelta } = computeStockDeltas(input.movementType, quantityIn, quantityOut);

    const requiresApproval = Boolean(input.requiresApproval ?? meta.requiresApproval);
    const status = requiresApproval
      ? MOVEMENT_STATUSES.PENDING
      : MOVEMENT_STATUSES.COMPLETED;

    // Negative stock validation for outbound / reserve movements that apply immediately
    if (status === MOVEMENT_STATUSES.COMPLETED) {
      this.#assertStockAvailable(product.id, warehouseId, onHandDelta, reservedDelta, input.allowNegative);
      if (meta.direction === 'out' && (input.sourceLocationId || null)) {
        this.#assertLocationStockAvailable(product.id, input.sourceLocationId, quantityOut, input.allowNegative);
      }
    }

    let sourceLocationId = input.sourceLocationId || null;
    let destinationLocationId = input.destinationLocationId || null;
    const defaultLoc = locationRepo.findDefault(warehouseId);

    if (meta.direction === 'out' || meta.direction === 'reserve') {
      sourceLocationId = sourceLocationId || defaultLoc?.id || null;
    }
    if (meta.direction === 'in' || meta.direction === 'release') {
      destinationLocationId = destinationLocationId || defaultLoc?.id || null;
    }

    // Re-check location stock after default resolution
    if (status === MOVEMENT_STATUSES.COMPLETED && meta.direction === 'out' && sourceLocationId) {
      this.#assertLocationStockAvailable(product.id, sourceLocationId, quantityOut, input.allowNegative);
    }

    const movement = movementRepo.create({
      productId: product.id,
      warehouseId,
      sourceLocationId,
      destinationLocationId,
      movementType: input.movementType,
      quantityIn,
      quantityOut,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      reason: input.reason || null,
      notes: input.notes || null,
      status,
      requiresApproval,
      createdBy: actor.user.id,
    });

    let stock = null;
    let locationStocks = [];
    if (status === MOVEMENT_STATUSES.COMPLETED) {
      stock = stockRepo.applyDelta(product.id, warehouseId, {
        onHandDelta,
        reservedDelta,
        movementId: movement.id,
      });
      locationStocks = this.#applyLocationDeltas(product.id, warehouseId, {
        sourceLocationId,
        destinationLocationId,
        onHandDelta,
        reservedDelta,
        quantityIn,
        quantityOut,
        movementType: input.movementType,
        movementId: movement.id,
      });
    } else {
      stock = stockRepo.ensureRow(product.id, warehouseId);
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: requiresApproval ? 'create_pending' : 'create',
      module: 'inventory',
      recordType: 'inventory_movement',
      recordId: movement.id,
      newValue: { movement, stockAfter: stock, locationStocks },
      ...getRequestMeta(req),
    });

    return { movement, stock, locationStocks };
  }

  approveAdjustment(id, actor, req) {
    authService.checkPermission(actor.permissions, 'inventory.adjustments.approve');

    const movement = movementRepo.findById(id);
    if (!movement) throw new AppError('Movement not found', 404);
    if (movement.status !== MOVEMENT_STATUSES.PENDING) {
      throw new AppError('Only pending adjustments can be approved', 400);
    }
    if (![MOVEMENT_TYPES.ADJUSTMENT_INCREASE, MOVEMENT_TYPES.ADJUSTMENT_DECREASE].includes(movement.movementType)) {
      throw new AppError('Only stock adjustments require this approval flow', 400);
    }

    const { onHandDelta, reservedDelta } = computeStockDeltas(
      movement.movementType,
      movement.quantityIn,
      movement.quantityOut
    );

    this.#assertStockAvailable(
      movement.productId,
      movement.warehouseId,
      onHandDelta,
      reservedDelta,
      false
    );

    const updated = movementRepo.updateStatus(id, {
      status: MOVEMENT_STATUSES.COMPLETED,
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
    });

    const stock = stockRepo.applyDelta(movement.productId, movement.warehouseId, {
      onHandDelta,
      reservedDelta,
      movementId: id,
    });

    const locationStocks = this.#applyLocationDeltas(movement.productId, movement.warehouseId, {
      sourceLocationId: movement.sourceLocationId,
      destinationLocationId: movement.destinationLocationId,
      onHandDelta,
      reservedDelta,
      quantityIn: movement.quantityIn,
      quantityOut: movement.quantityOut,
      movementType: movement.movementType,
      movementId: id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'inventory',
      recordType: 'inventory_movement',
      recordId: id,
      previousValue: movement,
      newValue: { movement: updated, stockAfter: stock, locationStocks },
      ...getRequestMeta(req),
    });

    return { movement: updated, stock, locationStocks };
  }

  rejectAdjustment(id, reason, actor, req) {
    authService.checkPermission(actor.permissions, 'inventory.adjustments.approve');

    const movement = movementRepo.findById(id);
    if (!movement) throw new AppError('Movement not found', 404);
    if (movement.status !== MOVEMENT_STATUSES.PENDING) {
      throw new AppError('Only pending adjustments can be rejected', 400);
    }

    const updated = movementRepo.updateStatus(id, {
      status: MOVEMENT_STATUSES.REJECTED,
      approvedBy: actor.user.id,
      approvedAt: nowIso(),
      rejectionReason: reason || 'Rejected',
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'reject',
      module: 'inventory',
      recordType: 'inventory_movement',
      recordId: id,
      previousValue: movement,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return { movement: updated };
  }

  listPendingAdjustments(actor) {
    authService.checkPermission(actor.permissions, 'inventory.adjustments.view');
    const increase = movementRepo.findAll({
      movementType: MOVEMENT_TYPES.ADJUSTMENT_INCREASE,
      status: MOVEMENT_STATUSES.PENDING,
      limit: 200,
      offset: 0,
    });
    const decrease = movementRepo.findAll({
      movementType: MOVEMENT_TYPES.ADJUSTMENT_DECREASE,
      status: MOVEMENT_STATUSES.PENDING,
      limit: 200,
      offset: 0,
    });
    const items = [...increase.items, ...decrease.items]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { items, total: items.length };
  }

  /**
   * Convenience helpers for other modules (POS, purchases, etc.)
   * They must never write stock_levels themselves.
   */
  recordOpeningStock(payload, actor, req) {
    return this.createMovement({ ...payload, movementType: MOVEMENT_TYPES.OPENING_STOCK }, actor, req);
  }

  recordPosSale(payload, actor, req, options = {}) {
    return this.createMovement({ ...payload, movementType: MOVEMENT_TYPES.POS_SALE }, actor, req, options);
  }

  recordSalesReturn(payload, actor, req, options = {}) {
    return this.createMovement({ ...payload, movementType: MOVEMENT_TYPES.SALES_RETURN }, actor, req, options);
  }

  recomputeStock(productId, warehouseId, actor) {
    authService.checkPermission(actor.permissions, 'inventory.movements.approve');
    return stockRepo.recomputeFromMovements(productId, warehouseId);
  }

  #assertStockAvailable(productId, warehouseId, onHandDelta, reservedDelta, allowNegative = false) {
    if (allowNegative) return;

    const current = stockRepo.ensureRow(productId, warehouseId);
    const nextOnHand = current.quantityOnHand + onHandDelta;
    const nextReserved = current.quantityReserved + reservedDelta;
    const nextAvailable = nextOnHand - nextReserved;

    if (nextOnHand < -0.000001) {
      throw new AppError(
        `Insufficient stock. On hand: ${current.quantityOnHand}, requested change: ${onHandDelta}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }
    if (nextReserved < -0.000001) {
      throw new AppError(
        `Cannot release more than reserved. Reserved: ${current.quantityReserved}`,
        400,
        'INSUFFICIENT_RESERVED'
      );
    }
    if (nextAvailable < -0.000001) {
      throw new AppError(
        `Insufficient available stock. Available: ${current.quantityAvailable}`,
        400,
        'INSUFFICIENT_AVAILABLE'
      );
    }
  }

  #assertLocationStockAvailable(productId, locationId, quantityOut, allowNegative = false) {
    if (allowNegative || !locationId || !quantityOut) return;
    const current = locationStockRepo.findByProductLocation(productId, locationId);
    // If location stock has never been tracked, warehouse-level checks still apply.
    if (!current) return;
    const available = current.quantityAvailable || 0;
    if (available + 0.000001 < quantityOut) {
      throw new AppError(
        `Insufficient location stock. Available at location: ${available}, requested: ${quantityOut}`,
        400,
        'INSUFFICIENT_LOCATION_STOCK'
      );
    }
  }

  #applyLocationDeltas(productId, warehouseId, {
    sourceLocationId,
    destinationLocationId,
    quantityIn,
    quantityOut,
    movementType,
    movementId,
  }) {
    const results = [];
    const meta = MOVEMENT_TYPE_META[movementType];

    if (sourceLocationId && (meta.direction === 'out' || meta.direction === 'reserve')) {
      const reservedDelta = movementType === MOVEMENT_TYPES.RESERVED_STOCK ? quantityOut : 0;
      const onHandDelta = meta.affectsOnHand ? -quantityOut : 0;
      results.push(locationStockRepo.applyDelta(productId, sourceLocationId, warehouseId, {
        onHandDelta,
        reservedDelta,
        movementId,
      }));
    }

    if (destinationLocationId && (meta.direction === 'in' || meta.direction === 'release')) {
      const reservedDelta = movementType === MOVEMENT_TYPES.RELEASED_STOCK ? -quantityIn : 0;
      const onHandDelta = meta.affectsOnHand ? quantityIn : 0;
      results.push(locationStockRepo.applyDelta(productId, destinationLocationId, warehouseId, {
        onHandDelta,
        reservedDelta,
        movementId,
      }));
    }

    return results;
  }
}

export const inventoryMovementService = new InventoryMovementService();
