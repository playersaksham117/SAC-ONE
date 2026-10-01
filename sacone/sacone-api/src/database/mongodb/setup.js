/**
 * Prepare MongoDB Atlas / local Mongo for SACONE:
 * create collections, indexes, and system metadata seed.
 * Does NOT switch DATABASE_DRIVER — live ERP stays on SQLite until cutover.
 *
 * Usage: npm run mongo:setup
 */
import { config, isDevelopmentEnv } from '../../config/index.js';
import { connectMongo, closeMongo, isMongoConfigured, pingMongo } from '../mongo.js';
import { SACONE_COLLECTIONS, SYSTEM_META_COLLECTION } from './collections.js';
import { DEFAULT_ROLES, MODULE_DEFINITIONS, buildPermissionKey } from '../../core/constants.js';
import { nowIso } from '../../core/utils.js';

async function ensureIndexes(db) {
  for (const col of SACONE_COLLECTIONS) {
    await db.createCollection(col.name).catch(() => {});
    const collection = db.collection(col.name);
    for (const idx of col.indexes || []) {
      const { key, name, ...opts } = idx;
      await collection.createIndex(key, { name, ...opts }).catch((err) => {
        console.warn(`Index ${name} on ${col.name}: ${err.message}`);
      });
    }
  }
}

async function seedMeta(db) {
  const permissions = [];
  for (const mod of MODULE_DEFINITIONS) {
    for (const feature of mod.features) {
      for (const action of feature.actions) {
        permissions.push({
          moduleCode: mod.code,
          featureCode: feature.code,
          action,
          permissionKey: buildPermissionKey(mod.code, feature.code, action),
        });
      }
    }
  }

  await db.collection(SYSTEM_META_COLLECTION).updateOne(
    { _id: 'system' },
    {
      $set: {
        app: 'sacone',
        database: config.mongodbDatabase,
        appEnv: config.appEnv,
        updatedAt: nowIso(),
        roles: DEFAULT_ROLES.map((r) => ({
          slug: r.slug,
          name: r.name,
          isSystem: r.isSystem,
          allPermissions: Boolean(r.allPermissions),
        })),
        permissionCount: permissions.length,
        collections: SACONE_COLLECTIONS.map((c) => c.name),
      },
      $setOnInsert: { createdAt: nowIso() },
    },
    { upsert: true }
  );

  // Lightweight permission catalog (idempotent upsert by key)
  const permCol = db.collection('permissions');
  for (const p of permissions) {
    await permCol.updateOne(
      { permissionKey: p.permissionKey },
      { $set: { ...p, updatedAt: nowIso() }, $setOnInsert: { createdAt: nowIso() } },
      { upsert: true }
    );
  }

  const roleCol = db.collection('roles');
  for (const r of DEFAULT_ROLES) {
    await roleCol.updateOne(
      { slug: r.slug },
      {
        $set: {
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          allPermissions: Boolean(r.allPermissions),
          permissionKeys: r.allPermissions ? ['*'] : (r.permissions || []),
          updatedAt: nowIso(),
        },
        $setOnInsert: { createdAt: nowIso(), isActive: true },
      },
      { upsert: true }
    );
  }

  await db.collection('settings').updateOne(
    { key: 'app.env' },
    { $set: { value: config.appEnv, updatedAt: nowIso() }, $setOnInsert: { createdAt: nowIso() } },
    { upsert: true }
  );
}

async function main() {
  console.log('=== SACONE Mongo setup ===');
  console.log(`APP_ENV=${config.appEnv}  DATABASE=${config.mongodbDatabase}`);
  if (!isMongoConfigured()) {
    console.error('MONGODB_URI is not set. Configure Atlas or local Mongo in .env');
    process.exit(1);
  }
  if (!config.mongodbWriteEnabled && !isDevelopmentEnv()) {
    console.error('MONGODB_WRITE_ENABLED must be true outside automatic local prep (or use APP_ENV=development).');
    process.exit(1);
  }

  const ping = await pingMongo();
  if (!ping.ok) {
    console.error('Mongo connection failed:', ping.message);
    process.exit(1);
  }

  const { db } = await connectMongo();
  console.log(`Connected to Mongo database "${config.mongodbDatabase}"`);
  await ensureIndexes(db);
  console.log(`Ensured ${SACONE_COLLECTIONS.length} collections + indexes`);
  await seedMeta(db);
  console.log('Seeded roles/permissions catalog + system meta (no fake business transactions)');
  await closeMongo();
  console.log('Mongo setup complete. Keep DATABASE_DRIVER=sqlite until dual-read cutover.');
}

main().catch(async (err) => {
  console.error(err);
  await closeMongo().catch(() => {});
  process.exit(1);
});
