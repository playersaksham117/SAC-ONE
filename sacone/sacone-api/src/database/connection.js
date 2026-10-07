import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { AppError } from '../core/http.js';
import { recordWrite, writeTargetOf } from '../realtime/change-feed.js';
import { currentFirmId } from './context.js';
import { IDENTITY_TABLES, mirrorIdentity } from './identity-mirror.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database files:
 *   core  the main file (DATABASE_PATH): users, roles, sign-in, the firm list, and the books
 *         of the first firm.
 *   firm  one file per additional firm (data/firms/<id>.db) with that firm's books only.
 *
 * getDatabase() returns the file of the firm chosen for the current request (see context.js),
 * or the core file outside a request. Code that must always reach users/roles/sessions uses
 * getCoreDatabase().
 */

let coreInstance = null;
/** firmId → open connection (the primary firm maps to the core connection). */
const firmInstances = new Map();
let firmInitializer = null;
/** Firm files whose copy of users/roles is older than the core. */
const staleIdentity = new Set();

function resolveDatabasePath() {
  const configured = config.databasePath;
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(path.join(__dirname, '../..'), configured);
}

/** Absolute path of a firm file stored as a path relative to the main file's folder. */
export function firmDatabasePath(dbFile) {
  return path.join(path.dirname(resolveDatabasePath()), dbFile);
}

function open(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getCoreDatabase() {
  if (coreInstance) return coreInstance;
  coreInstance = open(resolveDatabasePath());
  publishWrites(coreInstance, true);
  return coreInstance;
}

export function getDatabase() {
  const firmId = currentFirmId();
  return firmId ? getFirmDatabase(firmId) : getCoreDatabase();
}

/**
 * Called once per newly opened firm file (migrations, identity copy, defaults).
 * Registered by firm-provision.js so this module stays free of setup imports.
 */
export function setFirmDatabaseInitializer(fn) {
  firmInitializer = fn;
}

export function getFirmDatabase(firmId) {
  const cached = firmInstances.get(firmId);
  if (cached) {
    if (staleIdentity.has(firmId)) {
      // Refresh before use, so a user created a moment ago can be referenced right away.
      staleIdentity.delete(firmId);
      mirrorIdentity(getCoreDatabase(), cached);
    }
    return cached;
  }

  const core = getCoreDatabase();
  const firm = core.prepare('SELECT id, name, db_file, is_primary, is_active FROM firms WHERE id = ?').get(firmId);
  if (!firm) throw new AppError('Firm not found', 404, 'FIRM_NOT_FOUND');
  if (!firm.db_file) {
    firmInstances.set(firmId, core);
    return core;
  }

  const db = open(firmDatabasePath(firm.db_file));
  publishWrites(db, false);
  firmInstances.set(firmId, db);
  try {
    if (firmInitializer) firmInitializer(db, firm);
    else mirrorIdentity(core, db);
  } catch (err) {
    firmInstances.delete(firmId);
    db.close();
    throw err;
  }
  return db;
}

function markIdentityStale() {
  const core = coreInstance;
  for (const [firmId, db] of firmInstances) {
    if (db !== core) staleIdentity.add(firmId);
  }
}

/**
 * Report every write statement to the real-time change feed, tagged with the firm it belongs
 * to so other firms' screens don't refresh. Users/roles are shared, so their changes go to all
 * firms, and the open firm files are refreshed before their next use.
 */
function publishWrites(db, isCore) {
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepare(sql);
    const table = writeTargetOf(sql);
    if (!table) return stmt;
    const run = stmt.run.bind(stmt);
    stmt.run = (...params) => {
      const result = run(...params);
      if (result.changes > 0) {
        const shared = IDENTITY_TABLES.has(table) || table === 'firms' || table === 'user_firms';
        recordWrite(table, shared ? '*' : (currentFirmId() || '*'));
        if (isCore && IDENTITY_TABLES.has(table)) markIdentityStale();
      }
      return result;
    };
    return stmt;
  };
}

export function closeDatabase() {
  for (const db of new Set(firmInstances.values())) {
    if (db !== coreInstance && db.open) db.close();
  }
  firmInstances.clear();
  staleIdentity.clear();
  if (coreInstance) {
    coreInstance.close();
    coreInstance = null;
  }
}
