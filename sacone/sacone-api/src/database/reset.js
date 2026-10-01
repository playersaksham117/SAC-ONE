/**
 * Wipes the SQLite database and re-runs migrations + system bootstrap.
 * Business data starts empty — no sample products, parties, or demo keys.
 *
 * Safety: blocked unless APP_ENV=development (see assertDestructiveDbAllowed).
 *
 * Usage: npm run db:reset
 * Optional demo data: SEED_DEMO_DATA=true npm run db:reset
 */
import fs from 'fs';
import path from 'path';
import { config, assertDestructiveDbAllowed } from '../config/index.js';
import { runDatabaseSetup } from './setup.js';

function resolveDbPath() {
  return path.isAbsolute(config.databasePath)
    ? config.databasePath
    : path.join(process.cwd(), config.databasePath);
}

function wipeDatabaseFiles() {
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`Removed ${file}`);
    }
  }
}

try {
  console.log('=== SACONE SQLite RESET ===');
  console.log(`Environment: ${config.appEnv}`);
  console.log(`Driver:      ${config.databaseDriver}`);
  console.log(`Path:        ${resolveDbPath()}`);
  assertDestructiveDbAllowed('SQLite reset');
  console.log('Resetting SACONE database (real-data mode — no sample business records)…');
  wipeDatabaseFiles();
  runDatabaseSetup();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
