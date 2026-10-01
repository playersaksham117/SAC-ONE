/**
 * Development-only Mongo database reset for SACONE Atlas / local Mongo.
 *
 * Safety:
 * - Requires APP_ENV=development (or FORCE_DB_RESET=CONFIRM_PRODUCTION_RESET)
 * - Requires MONGODB_URI + MONGODB_WRITE_ENABLED
 * - Drops configured MONGODB_DATABASE collections only (not the Atlas cluster)
 *
 * Usage: npm run mongo:reset
 */
import { config, assertDestructiveDbAllowed } from '../../config/index.js';
import { connectMongo, closeMongo, isMongoConfigured, pingMongo } from '../mongo.js';
import { SACONE_COLLECTIONS, SYSTEM_META_COLLECTION } from './collections.js';

async function main() {
  console.log('=== SACONE Mongo RESET ===');
  console.log(`Environment: ${config.appEnv}`);
  console.log(`Database:    ${config.mongodbDatabase}`);
  console.log(`URI set:     ${Boolean(config.mongodbUri)}`);

  assertDestructiveDbAllowed('MongoDB reset');

  if (!isMongoConfigured()) {
    console.error('MONGODB_URI is not configured');
    process.exit(1);
  }
  if (!config.mongodbWriteEnabled) {
    console.error('Set MONGODB_WRITE_ENABLED=true to allow Mongo reset writes');
    process.exit(1);
  }

  const ping = await pingMongo();
  if (!ping.ok) {
    console.error('Mongo connection failed:', ping.message);
    process.exit(1);
  }

  const { db } = await connectMongo();
  const existing = await db.listCollections().toArray();
  console.log(`Collections before reset: ${existing.length}`);
  console.log('Dropping SACONE collections…');

  const names = new Set([
    ...SACONE_COLLECTIONS.map((c) => c.name),
    SYSTEM_META_COLLECTION,
    ...existing.map((c) => c.name),
  ]);

  for (const name of names) {
    try {
      await db.collection(name).drop();
      console.log(`  dropped ${name}`);
    } catch {
      /* collection may not exist */
    }
  }

  await closeMongo();
  console.log('Mongo reset complete. Run: npm run mongo:setup');
}

main().catch(async (err) => {
  console.error(err.message || err);
  await closeMongo().catch(() => {});
  process.exit(1);
});
