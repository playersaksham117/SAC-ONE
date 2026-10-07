import { financialYearOf } from '../core/financial-year.js';
import { generateId, nowIso } from '../core/utils.js';
import { ApprovalRepository } from '../repositories/sqlite/approvals.js';
import { CommissionPlanRepository } from '../repositories/sqlite/commissions.js';
import { skuEngineRepo } from '../services/sku-engine.js';
import { getCoreDatabase, setFirmDatabaseInitializer } from './connection.js';
import { runWithFirm } from './context.js';
import { mirrorIdentity } from './identity-mirror.js';
import { runMigrations, seedDefaultWarehouse, seedWalkInCustomer } from './setup.js';

/**
 * Register the firm whose books are in the main database file (once). Its id is that file's
 * company id, so documents already numbered under it keep their series.
 */
export function ensurePrimaryFirm(core = getCoreDatabase()) {
  const existing = core.prepare('SELECT id, name FROM firms WHERE is_primary = 1').get();
  if (existing) return { ...existing, created: false };

  const company = core.prepare('SELECT id, business_name, created_at FROM companies ORDER BY created_at ASC LIMIT 1').get();
  const id = company?.id || generateId();
  const name = company?.business_name || 'My Business';
  const earliest = core.prepare(`
    SELECT MIN(at) AS at FROM (
      SELECT MIN(created_at) AS at FROM companies
      UNION ALL SELECT MIN(created_at) FROM pos_sales
      UNION ALL SELECT MIN(created_at) FROM inventory_movements
    )
  `).get()?.at;
  const now = nowIso();
  core.prepare(`
    INSERT INTO firms (id, name, db_file, is_primary, is_active, first_financial_year, created_at, updated_at)
    VALUES (?, ?, NULL, 1, 1, ?, ?, ?)
  `).run(id, name, financialYearOf(earliest || now), now, now);
  return { id, name, created: true };
}

/**
 * Bring a firm's own database file up to date: schema, the copy of users/roles, and the
 * defaults every firm needs (company profile, walk-in customer, main warehouse, approval
 * rules, commission plan). Safe to run every time the file is opened.
 */
export function prepareFirmDatabase(db, firm) {
  const core = getCoreDatabase();
  runWithFirm({ firmId: firm.id }, () => {
    runMigrations(db, { quiet: true });
    mirrorIdentity(core, db);

    if (!db.prepare('SELECT 1 FROM companies LIMIT 1').get()) {
      const now = nowIso();
      db.prepare(`
        INSERT INTO companies (id, business_name, country, is_setup_complete, created_at, updated_at)
        VALUES (?, ?, 'India', 0, ?, ?)
      `).run(firm.id, firm.name, now, now);
    }

    const owner = core.prepare(`
      SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.slug = 'owner_admin' ORDER BY u.created_at ASC LIMIT 1
    `).get()?.id || null;
    skuEngineRepo.seedDefaultFamilyCodes(owner);
    seedWalkInCustomer(db);
    seedDefaultWarehouse(db);
    new ApprovalRepository().seedDefaultsIfEmpty(owner);
    new CommissionPlanRepository().seedDefaultIfEmpty(owner);
  });
}

setFirmDatabaseInitializer(prepareFirmDatabase);
