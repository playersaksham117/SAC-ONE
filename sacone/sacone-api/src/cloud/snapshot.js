/**
 * Point-in-time snapshot of the local SQLite database for cloud export.
 *
 * Uses SQLite's online backup API, so it is consistent even while the API is
 * running and taking sales. Every cloud export reads from a snapshot, never the
 * live file, and the live database is never modified.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SNAPSHOT_ROOT = path.join(API_ROOT, 'data', 'cloud-snapshots');

/** Synthetic key column for tables without a primary key. */
const ROWID = '__rowid';

export function liveDatabasePath() {
  return path.isAbsolute(config.databasePath)
    ? config.databasePath
    : path.resolve(API_ROOT, config.databasePath);
}

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

export async function takeSnapshot() {
  const source = liveDatabasePath();
  if (!fs.existsSync(source)) {
    throw new Error(`No local database at ${source}. Run "npm run db:setup" first.`);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const dir = path.join(SNAPSHOT_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sacone.db');

  const live = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await live.backup(file);
  } finally {
    live.close();
  }
  return openSnapshot(dir);
}

/** Most recent snapshot folder, or null. */
export function latestSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_ROOT)) return null;
  const dirs = fs.readdirSync(SNAPSHOT_ROOT)
    .filter((d) => fs.existsSync(path.join(SNAPSHOT_ROOT, d, 'sacone.db')))
    .sort();
  return dirs.length ? path.join(SNAPSHOT_ROOT, dirs[dirs.length - 1]) : null;
}

export function openSnapshot(dir, file = path.join(dir, 'sacone.db')) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(({ name }) => describeTable(db, name));

  return {
    dir,
    file,
    id: path.basename(dir),
    takenAt: fs.statSync(file).mtime.toISOString(),
    db,
    tables,
    table: (name) => tables.find((t) => t.name === name),
    close: () => db.close(),
  };
}

function describeTable(db, name) {
  const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
  const pk = columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  const rowCount = db.prepare(`SELECT COUNT(*) AS c FROM ${quote(name)}`).get().c;
  const indexes = db.prepare(`PRAGMA index_list(${quote(name)})`).all()
    .filter((idx) => idx.origin !== 'pk' && !idx.partial)
    .map((idx) => ({
      name: idx.name,
      unique: Boolean(idx.unique),
      columns: db.prepare(`PRAGMA index_info(${quote(idx.name)})`).all().map((c) => c.name),
    }))
    .filter((idx) => idx.columns.length && idx.columns.every(Boolean));

  return {
    name,
    columns: columns.map((c) => c.name),
    types: Object.fromEntries(columns.map((c) => [c.name, String(c.type || '').toUpperCase()])),
    pk,
    rowCount,
    indexes,
  };
}

/** Rows in primary-key order. Integers beyond 2^53 stay BigInt (stored as Int64). */
export function* iterateRows(snapshot, table) {
  const sql = table.pk.length
    ? `SELECT * FROM ${quote(table.name)} ORDER BY ${table.pk.map(quote).join(', ')}`
    : `SELECT rowid AS ${ROWID}, * FROM ${quote(table.name)} ORDER BY rowid`;
  const stmt = snapshot.db.prepare(sql).safeIntegers(true);
  for (const raw of stmt.iterate()) {
    const row = {};
    for (const [key, value] of Object.entries(raw)) {
      row[key] = typeof value === 'bigint' && Number.isSafeInteger(Number(value)) ? Number(value) : value;
    }
    yield row;
  }
}

/** Identity of a row: its primary key value (object for composite keys, rowid if none). */
export function rowKey(table, row) {
  if (table.pk.length === 1) return row[table.pk[0]];
  if (table.pk.length > 1) return Object.fromEntries(table.pk.map((c) => [c, row[c]]));
  return row[ROWID];
}

/** Canonical form of a value so SQLite rows and their cloud copies compare exactly. */
export function canonicalValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return `int:${value}`;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `b64:${Buffer.from(value).toString('base64')}`;
  if (value?._bsontype === 'Binary') return `b64:${Buffer.from(value.buffer).toString('base64')}`;
  if (value?._bsontype === 'Long') {
    return Number.isSafeInteger(value.toNumber()) ? value.toNumber() : `int:${value.toString()}`;
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value) && Number.isInteger(value)) return `int:${BigInt(value)}`;
  return value;
}

export function rowFingerprint(columns, row) {
  const values = columns.map((c) => canonicalValue(row[c]));
  return crypto.createHash('sha1').update(JSON.stringify(values)).digest('hex');
}

/** Checksum of a whole table (or of the copied columns), in primary-key order. */
export function tableChecksum(snapshot, table, columns = table.columns) {
  const hash = crypto.createHash('sha256');
  for (const row of iterateRows(snapshot, table)) hash.update(rowFingerprint(columns, row));
  return hash.digest('hex');
}
