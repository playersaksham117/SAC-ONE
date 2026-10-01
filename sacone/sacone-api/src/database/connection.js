import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { recordWrite, writeTargetOf } from '../realtime/change-feed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance = null;

function resolveDatabasePath() {
  const configured = config.databasePath;
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(path.join(__dirname, '../..'), configured);
}

export function getDatabase() {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  publishWrites(dbInstance);
  return dbInstance;
}

/** Report every write statement to the real-time change feed. */
function publishWrites(db) {
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepare(sql);
    const table = writeTargetOf(sql);
    if (!table) return stmt;
    const run = stmt.run.bind(stmt);
    stmt.run = (...params) => {
      const result = run(...params);
      if (result.changes > 0) recordWrite(table);
      return result;
    };
    return stmt;
  };
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
