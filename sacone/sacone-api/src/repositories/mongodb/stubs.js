/**
 * MongoDB repository stubs (Phase 11).
 * Not enabled for production. DATABASE_DRIVER must remain "sqlite".
 *
 * When implementing, each class should honor contracts in ../contracts.js
 * and preserve string UUIDs as MongoDB `_id` (or dual-field `id` + `_id`).
 */

import { AppError } from '../../core/http.js';

function notImplemented(name) {
  return new AppError(
    `MongoDB repository "${name}" is not implemented yet. Application runs on SQLite.`,
    501,
    'MONGODB_NOT_IMPLEMENTED'
  );
}

export class MongoProductRepository {
  findAll() { throw notImplemented('products'); }
  findById() { throw notImplemented('products'); }
  create() { throw notImplemented('products'); }
  update() { throw notImplemented('products'); }
}

export class MongoCustomerRepository {
  findAll() { throw notImplemented('customers'); }
  findById() { throw notImplemented('customers'); }
  create() { throw notImplemented('customers'); }
  update() { throw notImplemented('customers'); }
}

export class MongoInventoryMovementRepository {
  create() { throw notImplemented('inventoryMovements'); }
  findById() { throw notImplemented('inventoryMovements'); }
  findAll() { throw notImplemented('inventoryMovements'); }
}

export const MONGODB_STUB_STATUS = {
  enabled: false,
  reason: 'Phase 11 provision only — no production MongoDB driver wired',
};
