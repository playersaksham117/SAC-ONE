import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase, closeDatabase, getFirmDatabase } from './connection.js';
import { ensurePrimaryFirm } from './firm-provision.js';
import { config } from '../config/index.js';
import { generateId, nowIso } from '../core/utils.js';
import {
  MODULE_DEFINITIONS,
  DEFAULT_ROLES,
  buildPermissionKey,
} from '../core/constants.js';
import { skuEngineRepo } from '../services/sku-engine.js';
import { ApprovalRepository } from '../repositories/sqlite/approvals.js';
import { CommissionPlanRepository } from '../repositories/sqlite/commissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(db, { quiet = false } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  for (const file of files) {
    const version = file.replace('.sql', '');
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, nowIso());
    if (!quiet) console.log(`Applied migration: ${version}`);
  }
}

function seedModulesAndPermissions(db) {
  const moduleCount = db.prepare('SELECT COUNT(*) as count FROM modules').get().count;
  if (moduleCount > 0) return;

  const insertModule = db.prepare(`
    INSERT INTO modules (id, code, name, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);

  const insertFeature = db.prepare(`
    INSERT INTO features (id, module_id, code, name, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertPermission = db.prepare(`
    INSERT INTO permissions (id, module_id, feature_id, action, permission_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = nowIso();

  for (const mod of MODULE_DEFINITIONS) {
    const moduleId = generateId();
    insertModule.run(moduleId, mod.code, mod.name, mod.sortOrder, now, now);

    mod.features.forEach((feature, index) => {
      const featureId = generateId();
      insertFeature.run(featureId, moduleId, feature.code, feature.name, index + 1, now, now);

      for (const action of feature.actions) {
        insertPermission.run(
          generateId(),
          moduleId,
          featureId,
          action,
          buildPermissionKey(mod.code, feature.code, action),
          now
        );
      }
    });
  }

  console.log('Seeded modules, features, and permissions');
}

function seedRoles(db) {
  const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (roleCount > 0) return;

  const allPermissions = db.prepare('SELECT id, permission_key FROM permissions').all();
  const permissionMap = Object.fromEntries(allPermissions.map((p) => [p.permission_key, p.id]));

  const insertRole = db.prepare(`
    INSERT INTO roles (id, name, slug, description, is_system, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertRolePermission = db.prepare(`
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const now = nowIso();

  for (const roleDef of DEFAULT_ROLES) {
    const roleId = generateId();
    insertRole.run(
      roleId,
      roleDef.name,
      roleDef.slug,
      roleDef.description,
      roleDef.isSystem ? 1 : 0,
      now,
      now
    );

    let keys = [];
    if (roleDef.allPermissions) {
      keys = allPermissions.map((p) => p.permission_key);
    } else if (roleDef.viewOnly) {
      keys = allPermissions.filter((p) => p.permission_key.endsWith('.view')).map((p) => p.permission_key);
    } else {
      keys = roleDef.permissionKeys || [];
    }

    for (const key of keys) {
      const permissionId = permissionMap[key];
      if (permissionId) {
        insertRolePermission.run(generateId(), roleId, permissionId, now);
      }
    }
  }

  console.log('Seeded default roles');
}

function seedCompanyAndAdmin(db) {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) return;

  const now = nowIso();
  const companyId = generateId();
  const adminRole = db.prepare("SELECT id FROM roles WHERE slug = 'owner_admin'").get();

  db.prepare(`
    INSERT INTO companies (
      id, business_name, country, is_setup_complete, created_at, updated_at
    ) VALUES (?, ?, 'India', 0, ?, ?)
  `).run(companyId, 'My Business', now, now);

  const adminId = generateId();
  const passwordHash = bcrypt.hashSync(config.defaultAdmin.password, 10);

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    adminId,
    config.defaultAdmin.email,
    passwordHash,
    config.defaultAdmin.name,
    adminRole.id,
    now,
    now
  );

  console.log('Seeded default company and admin user');
  console.log(`  Email: ${config.defaultAdmin.email}`);
  console.log(`  Password: ${config.defaultAdmin.password}`);
}

/**
 * Keep built-in roles current without undoing the owner's edits. For each role we remember the
 * default permission set we applied last time (system_settings `role_defaults.<slug>`), then
 *   - grant keys the defaults gained since (new features),
 *   - revoke keys the defaults dropped since (retired features),
 *   - leave everything else exactly as the owner set it in Administration → Roles.
 */
function syncBuiltInRoleDefaults(db, now) {
  const allPermissions = db.prepare('SELECT id, permission_key, action FROM permissions').all();
  const idByKey = Object.fromEntries(allPermissions.map((p) => [p.permission_key, p.id]));
  const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?)');
  const revoke = db.prepare('DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?');
  const getSnapshot = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const saveSnapshot = db.prepare(`
    INSERT INTO system_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  for (const roleDef of DEFAULT_ROLES) {
    const role = db.prepare('SELECT id FROM roles WHERE slug = ?').get(roleDef.slug);
    if (!role) continue;
    const defaults = roleDef.allPermissions
      ? allPermissions.map((p) => p.permission_key)
      : roleDef.viewOnly
        ? allPermissions.filter((p) => p.action === 'view').map((p) => p.permission_key)
        : (roleDef.permissionKeys || []).filter((k) => idByKey[k]);

    const snapshotKey = `role_defaults.${roleDef.slug}`;
    let previous = null;
    try { previous = JSON.parse(getSnapshot.get(snapshotKey)?.value || 'null'); } catch { previous = null; }

    const before = new Set(previous || []);
    const toGrant = previous ? defaults.filter((k) => !before.has(k)) : defaults;
    const toRevoke = previous ? previous.filter((k) => !defaults.includes(k) && idByKey[k]) : [];
    for (const key of toGrant) grant.run(generateId(), role.id, idByKey[key], now);
    for (const key of toRevoke) revoke.run(role.id, idByKey[key]);

    saveSnapshot.run(snapshotKey, JSON.stringify(defaults), `Built-in defaults last applied to ${roleDef.name}`, now);
  }
}

function syncPermissionsFromDefinitions(db) {
  const now = nowIso();
  let addedCount = 0;

  const getModule = db.prepare('SELECT id FROM modules WHERE code = ?');
  const insertModule = db.prepare(`
    INSERT INTO modules (id, code, name, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);
  const updateModule = db.prepare(`
    UPDATE modules SET name = ?, sort_order = ?, updated_at = ? WHERE code = ?
  `);

  const getFeature = db.prepare('SELECT id FROM features WHERE module_id = ? AND code = ?');
  const insertFeature = db.prepare(`
    INSERT INTO features (id, module_id, code, name, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const updateFeature = db.prepare(`
    UPDATE features SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?
  `);

  const getPermission = db.prepare('SELECT id FROM permissions WHERE permission_key = ?');
  const insertPermission = db.prepare(`
    INSERT INTO permissions (id, module_id, feature_id, action, permission_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertRolePermission = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const mod of MODULE_DEFINITIONS) {
    let moduleRow = getModule.get(mod.code);
    let moduleId;

    if (!moduleRow) {
      moduleId = generateId();
      insertModule.run(moduleId, mod.code, mod.name, mod.sortOrder, now, now);
      addedCount += 1;
    } else {
      moduleId = moduleRow.id;
      updateModule.run(mod.name, mod.sortOrder, now, mod.code);
    }

    mod.features.forEach((feature, index) => {
      let featureRow = getFeature.get(moduleId, feature.code);
      let featureId;

      if (!featureRow) {
        featureId = generateId();
        insertFeature.run(featureId, moduleId, feature.code, feature.name, index + 1, now, now);
        addedCount += 1;
      } else {
        featureId = featureRow.id;
        updateFeature.run(feature.name, index + 1, now, featureId);
      }

      for (const action of feature.actions) {
        const permissionKey = buildPermissionKey(mod.code, feature.code, action);
        if (!getPermission.get(permissionKey)) {
          insertPermission.run(generateId(), moduleId, featureId, action, permissionKey, now);
          addedCount += 1;
        }
      }
    });
  }

  syncBuiltInRoleDefaults(db, now);

  if (addedCount > 0) {
    console.log(`Synced permission definitions (${addedCount} items added/updated)`);
  }
}

function seedProductMaster(db) {
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount > 0) return;

  const now = nowIso();
  const admin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  const createdBy = admin?.id || null;

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, code, description, is_active, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `);
  const insertBrand = db.prepare(`
    INSERT INTO brands (id, name, code, description, is_active, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `);
  const insertUnit = db.prepare(`
    INSERT INTO units (id, name, abbreviation, description, is_active, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, name, sku, barcode, category_id, brand_id, unit_id, hsn_code, gst_percentage,
      mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description,
      is_active, web_store_published, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);

  const categories = {
    beverages: generateId(),
    snacks: generateId(),
    dairy: generateId(),
    grocery: generateId(),
    personal: generateId(),
  };
  insertCategory.run(categories.beverages, 'Beverages', 'BEV', 'Drinks and juices', now, now, createdBy);
  insertCategory.run(categories.snacks, 'Snacks', 'SNK', 'Packaged snacks', now, now, createdBy);
  insertCategory.run(categories.dairy, 'Dairy', 'DAI', 'Milk and dairy products', now, now, createdBy);
  insertCategory.run(categories.grocery, 'Grocery', 'GRO', 'Staple grocery items', now, now, createdBy);
  insertCategory.run(categories.personal, 'Personal Care', 'PC', 'Hygiene and personal care', now, now, createdBy);

  const brands = {
    freshco: generateId(),
    nourish: generateId(),
    daily: generateId(),
    pure: generateId(),
  };
  insertBrand.run(brands.freshco, 'FreshCo', 'FC', 'FreshCo brand', now, now, createdBy);
  insertBrand.run(brands.nourish, 'Nourish', 'NR', 'Nourish brand', now, now, createdBy);
  insertBrand.run(brands.daily, 'DailyFarm', 'DF', 'DailyFarm brand', now, now, createdBy);
  insertBrand.run(brands.pure, 'PureCare', 'PC', 'PureCare brand', now, now, createdBy);

  const units = {
    pcs: generateId(),
    kg: generateId(),
    ltr: generateId(),
    pack: generateId(),
  };
  insertUnit.run(units.pcs, 'Piece', 'PCS', 'Individual pieces', now, now, createdBy);
  insertUnit.run(units.kg, 'Kilogram', 'KG', 'Weight in kilograms', now, now, createdBy);
  insertUnit.run(units.ltr, 'Litre', 'LTR', 'Volume in litres', now, now, createdBy);
  insertUnit.run(units.pack, 'Pack', 'PACK', 'Packaged units', now, now, createdBy);

  const samples = [
    ['Mineral Water 1L', 'BEV-WTR-001', '8901001000001', categories.beverages, brands.freshco, units.ltr, '2201', 12, 20, 18, 12, 20, 10, 1],
    ['Orange Juice 500ml', 'BEV-JUC-002', '8901001000002', categories.beverages, brands.nourish, units.pcs, '2009', 12, 45, 40, 28, 15, 8, 1],
    ['Potato Chips Classic', 'SNK-CHP-003', '8901001000003', categories.snacks, brands.freshco, units.pack, '1905', 12, 30, 25, 16, 25, 12, 1],
    ['Salted Peanuts 200g', 'SNK-PNT-004', '8901001000004', categories.snacks, brands.nourish, units.pack, '2008', 5, 55, 48, 32, 20, 10, 1],
    ['Full Cream Milk 1L', 'DAI-MLK-005', '8901001000005', categories.dairy, brands.daily, units.ltr, '0401', 5, 62, 58, 48, 30, 15, 1],
    ['Curd 400g', 'DAI-CRD-006', '8901001000006', categories.dairy, brands.daily, units.pcs, '0403', 5, 35, 32, 24, 20, 10, 0],
    ['Basmati Rice 5kg', 'GRO-RIC-007', '8901001000007', categories.grocery, brands.nourish, units.kg, '1006', 5, 650, 599, 480, 10, 5, 1],
    ['Toor Dal 1kg', 'GRO-DAL-008', '8901001000008', categories.grocery, brands.freshco, units.kg, '0713', 5, 160, 145, 118, 15, 8, 1],
    ['Handwash 250ml', 'PC-HWS-009', '8901001000009', categories.personal, brands.pure, units.pcs, '3401', 18, 99, 89, 60, 12, 6, 1],
    ['Toothpaste 150g', 'PC-TPS-010', '8901001000010', categories.personal, brands.pure, units.pcs, '3306', 18, 110, 99, 70, 12, 6, 1],
  ];

  for (const sample of samples) {
    const [name, sku, barcode, categoryId, brandId, unitId, hsn, gst, mrp, sell, purchase, reorder, minStock, web] = sample;
    insertProduct.run(
      generateId(), name, sku, barcode, categoryId, brandId, unitId, hsn, gst,
      mrp, sell, purchase, reorder, minStock, null, `${name} sample product`,
      web, now, now, createdBy
    );
  }

  console.log('Seeded product master with 10 sample products');
}

export function seedDefaultWarehouse(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM warehouses').get().count;
  const now = nowIso();
  const admin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  const createdBy = admin?.id || null;

  let warehouseId;
  if (count === 0) {
    warehouseId = generateId();
    db.prepare(`
      INSERT INTO warehouses (id, code, name, city, state, is_default, is_active, created_at, updated_at, created_by)
      VALUES (?, 'MAIN', 'Main Warehouse', 'Mumbai', 'Maharashtra', 1, 1, ?, ?, ?)
    `).run(warehouseId, now, now, createdBy);
    console.log('Seeded default warehouse (MAIN)');
  } else {
    warehouseId = db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN' OR is_default = 1 LIMIT 1").get()?.id
      || db.prepare('SELECT id FROM warehouses LIMIT 1').get()?.id;
  }

  if (!warehouseId) return;

  // Ensure Zone -> Rack -> Bin hierarchy exists
  const hasZone = db.prepare(`
    SELECT id FROM warehouse_locations WHERE warehouse_id = ? AND location_type = 'zone' LIMIT 1
  `).get(warehouseId);

  if (!hasZone) {
    const zoneId = generateId();
    const rackId = generateId();
    const binId = generateId();
    const wh = db.prepare('SELECT code FROM warehouses WHERE id = ?').get(warehouseId);

    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
        capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
      ) VALUES (?, ?, NULL, 'Z-A', 'Zone A', 'zone', ?, ?, NULL, 0, 1, 0, ?, ?, ?)
    `).run(zoneId, warehouseId, `${wh.code}-Z-A`, `SACONE:LOC:${zoneId}`, now, now, createdBy);

    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
        capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, 'R-01', 'Rack 01', 'rack', ?, ?, NULL, 0, 1, 0, ?, ?, ?)
    `).run(rackId, warehouseId, zoneId, `${wh.code}-Z-A-R-01`, `SACONE:LOC:${rackId}`, now, now, createdBy);

    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
        capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, 'B-01', 'Bin 01', 'bin', ?, ?, 1000, 1, 1, 0, ?, ?, ?)
    `).run(binId, warehouseId, rackId, `${wh.code}-Z-A-R-01-B-01`, `SACONE:LOC:${binId}`, now, now, createdBy);

    console.log('Seeded warehouse hierarchy Zone A > Rack 01 > Bin 01');
  }
}

export function seedWalkInCustomer(db) {
  const existing = db.prepare('SELECT id FROM customers WHERE is_walk_in = 1 LIMIT 1').get();
  if (existing) return;

  const now = nowIso();
  const admin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  db.prepare(`
    INSERT INTO customers (
      id, code, name, phone, outstanding_balance, credit_limit, is_walk_in, is_active,
      source_channel, created_at, updated_at, created_by
    ) VALUES (?, 'WALK-IN', 'Walk-in Customer', NULL, 0, 0, 1, 1, 'manual', ?, ?, ?)
  `).run(generateId(), now, now, admin?.id || null);
  console.log('Seeded Walk-in Customer');
}

function seedSampleParties(db) {
  const now = nowIso();
  const admin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  const createdBy = admin?.id || null;

  const custCount = db.prepare("SELECT COUNT(*) as count FROM customers WHERE is_walk_in = 0").get().count;
  if (custCount === 0) {
    db.prepare(`
      INSERT INTO customers (
        id, code, name, phone, email, gst_number, address, city, state,
        credit_limit, outstanding_balance, is_walk_in, is_active, source_channel, notes,
        created_at, updated_at, created_by
      ) VALUES (?, 'CUST-0001', 'Retail Mart Pvt Ltd', '9876543210', 'accounts@retailmart.example',
        '27AABCU9603R1ZM', '12 Market Road', 'Mumbai', 'Maharashtra',
        100000, 0, 0, 1, 'manual', 'Sample credit customer', ?, ?, ?)
    `).run(generateId(), now, now, createdBy);
    console.log('Seeded sample customer CUST-0001');
  }

  const supplierCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
  if (supplierCount === 0) {
    db.prepare(`
      INSERT INTO suppliers (
        id, code, name, contact_name, phone, email, gst_number, address, city, state,
        payment_terms, outstanding_payable, is_active, notes, created_at, updated_at, created_by
      ) VALUES (?, 'SUP-0001', 'Fresh Foods Distributors', 'Ravi Kumar', '9988776655',
        'orders@freshfoods.example', '27AABCF1234A1Z5', '45 Wholesale Yard', 'Mumbai', 'Maharashtra',
        'Net 30', 0, 1, 'Sample supplier', ?, ?, ?)
    `).run(generateId(), now, now, createdBy);
    db.prepare(`
      INSERT INTO suppliers (
        id, code, name, contact_name, phone, email, gst_number, address, city, state,
        payment_terms, outstanding_payable, is_active, notes, created_at, updated_at, created_by
      ) VALUES (?, 'SUP-0002', 'PureCare Hygiene Supply', 'Anita Shah', '9123456780',
        'sales@purecare.example', '24AABCP5678B1Z9', '8 Industrial Estate', 'Ahmedabad', 'Gujarat',
        'Net 15', 0, 1, 'Sample supplier', ?, ?, ?)
    `).run(generateId(), now, now, createdBy);
    console.log('Seeded sample suppliers SUP-0001, SUP-0002');
  }
}

function seedCashierUser(db) {
  const existing = db.prepare("SELECT id FROM users WHERE email = 'cashier@sacone.local'").get();
  if (existing) return;

  const cashierRole = db.prepare("SELECT id FROM roles WHERE slug = 'cashier'").get();
  if (!cashierRole) return;

  const now = nowIso();
  const passwordHash = bcrypt.hashSync('Cashier@123', 10);
  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role_id, is_active, created_at, updated_at
    ) VALUES (?, 'cashier@sacone.local', ?, 'POS Cashier', ?, 1, ?, ?)
  `).run(generateId(), passwordHash, cashierRole.id, now, now);
  console.log('Seeded cashier user cashier@sacone.local / Cashier@123');
}

function seedWebstoreIntegration(db) {
  // Ensure some catalog items are published for the web store API
  const published = db.prepare('SELECT COUNT(*) as count FROM products WHERE web_store_published = 1').get().count;
  if (published === 0) {
    db.prepare(`
      UPDATE products SET web_store_published = 1
      WHERE is_active = 1 AND sku IN (
        'BEV-WTR-001', 'BEV-JUC-002', 'SNK-CHP-003', 'GRO-RIC-007', 'PC-HWS-009'
      )
    `).run();
    console.log('Published sample products to web store');
  }

  const keyCount = db.prepare('SELECT COUNT(*) as count FROM api_keys').get().count;
  if (keyCount > 0) return;

  const admin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  const now = nowIso();
  const random = crypto.randomBytes(24).toString('base64url');
  const rawKey = `sk_live_${random}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const scopes = JSON.stringify([
    'products.read', 'inventory.read', 'customers.read', 'customers.write', 'orders.provision',
  ]);

  db.prepare(`
    INSERT INTO api_keys (
      id, name, key_prefix, key_hash, scopes, is_active, created_by, created_at, notes
    ) VALUES (?, 'Demo Web Store', ?, ?, ?, 1, ?, ?, ?)
  `).run(
    generateId(),
    keyPrefix,
    keyHash,
    scopes,
    admin?.id || null,
    now,
    'Seeded for local integration testing — store securely'
  );

  console.log('Seeded demo web store API key (shown once):');
  console.log(`  ${rawKey}`);
}

/**
 * Real-data mode never seeds samples, but a database created earlier with SEED_DEMO_DATA=true
 * may still hold them. Report them; deleting is left to a person because real sales may
 * already reference a sample product or customer.
 */
function reportLeftoverDemoData(db) {
  const found = [
    ['sample products', "SELECT COUNT(*) AS c FROM products WHERE description LIKE '% sample product' AND sku IN ('BEV-WTR-001','BEV-JUC-002','SNK-CHP-003','SNK-PNT-004','DAI-MLK-005','DAI-CRD-006','GRO-RIC-007','GRO-DAL-008','PC-HWS-009','PC-TPS-010')"],
    ['sample customer CUST-0001', "SELECT COUNT(*) AS c FROM customers WHERE code = 'CUST-0001' AND notes = 'Sample credit customer'"],
    ['sample suppliers', "SELECT COUNT(*) AS c FROM suppliers WHERE notes = 'Sample supplier'"],
    ['demo cashier login', "SELECT COUNT(*) AS c FROM users WHERE email = 'cashier@sacone.local'"],
    ['demo web store API key', "SELECT COUNT(*) AS c FROM api_keys WHERE name = 'Demo Web Store'"],
  ].map(([label, sql]) => [label, db.prepare(sql).get().c]).filter(([, count]) => count > 0);

  if (!found.length) return;
  console.warn('WARNING: this database still contains demo records from an earlier SEED_DEMO_DATA=true setup:');
  for (const [label, count] of found) console.warn(`  - ${label}: ${count}`);
  console.warn('  Deactivate or delete them in the ERP, or start fresh with npm run db:reset (development only).');
}

function main() {
  const db = getDatabase();
  try {
    runMigrations(db);
    skuEngineRepo.seedDefaultFamilyCodes();
    skuEngineRepo.syncBarcodeSequenceFromProducts();
    seedModulesAndPermissions(db);
    syncPermissionsFromDefinitions(db);
    seedRoles(db);
    seedCompanyAndAdmin(db);
    seedWalkInCustomer(db);

    try {
      const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(config.defaultAdmin.email);
      const result = new ApprovalRepository().seedDefaultsIfEmpty(admin?.id || null);
      if (result.seeded) console.log(`Seeded ${result.count} default approval rules`);
      const planSeed = new CommissionPlanRepository().seedDefaultIfEmpty(admin?.id || null);
      if (planSeed.seeded) console.log('Seeded default commission plan (2% taxable)');
    } catch (err) {
      console.warn('Approval/commission seed skipped:', err.message);
    }

    if (config.seedDemoData) {
      console.log('SEED_DEMO_DATA enabled — loading sample business data…');
      seedProductMaster(db);
      seedDefaultWarehouse(db);
      seedCashierUser(db);
      seedSampleParties(db);
      seedWebstoreIntegration(db);
    } else {
      console.log('Real-data mode: no sample products, parties, or demo API keys seeded.');
      console.log('  Add company details, warehouse, products, and customers through the ERP.');
      reportLeftoverDemoData(db);
    }

    // Firms: register the first firm (this file's books), then bring every other firm's file up to date.
    const primary = ensurePrimaryFirm(db);
    if (primary.created) console.log(`Registered firm "${primary.name}" (books in the main database file)`);
    for (const firm of db.prepare('SELECT id, name FROM firms WHERE db_file IS NOT NULL ORDER BY created_at').all()) {
      getFirmDatabase(firm.id);
      console.log(`Firm "${firm.name}": database file up to date`);
    }

    console.log('Database setup complete.');
  } finally {
    closeDatabase();
  }
}

export { main as runDatabaseSetup };
