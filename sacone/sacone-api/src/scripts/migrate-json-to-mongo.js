#!/usr/bin/env node
/**
 * CLI: Validate / import JSON → MongoDB
 * Usage:
 *   node src/scripts/migrate-json-to-mongo.js --export EXP-00001 --dry-run
 *   node src/scripts/migrate-json-to-mongo.js --export EXP-00001 --write
 *   node src/scripts/migrate-json-to-mongo.js --export EXP-00001 --write --drop
 */

import { getDatabase, closeDatabase } from '../database/connection.js';
import { closeMongo } from '../database/mongo.js';
import { importJsonToMongo } from '../migration/importer.js';
import { config } from '../config/index.js';

function parseArgs(argv) {
  const out = { exportDir: null, dryRun: true, drop: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--export') out.exportDir = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--write') out.dryRun = false;
    else if (a === '--drop') out.drop = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.exportDir) {
    console.log(`SACONE JSON → MongoDB migration

Usage:
  npm run migrate:dry-run -- --export EXP-00001
  npm run migrate:json-to-mongo -- --export EXP-00001 --write

Requires in .env:
  MONGODB_URI=mongodb://127.0.0.1:27017
  MONGODB_DATABASE=sacone
  MONGODB_WRITE_ENABLED=true   # for --write only

Keep DATABASE_DRIVER=sqlite until dual-read verification.
`);
    process.exit(args.help ? 0 : 1);
  }

  getDatabase();
  process.env.SACONE_CLOSE_MONGO_AFTER_IMPORT = '1';

  console.log('Mongo config:', {
    uriSet: Boolean(config.mongodbUri),
    database: config.mongodbDatabase,
    writeEnabled: config.mongodbWriteEnabled,
    dryRun: args.dryRun,
  });

  const result = await importJsonToMongo({
    exportDir: args.exportDir,
    dryRun: args.dryRun,
    dropCollections: args.drop,
    createdBy: null,
  });

  console.log(JSON.stringify(result, null, 2));
  closeDatabase();
  await closeMongo();
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { closeDatabase(); } catch { /* ignore */ }
  try { await closeMongo(); } catch { /* ignore */ }
  process.exit(1);
});
