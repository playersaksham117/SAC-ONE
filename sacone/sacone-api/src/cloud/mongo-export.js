/**
 * Lossless SQLite snapshot → MongoDB export.
 *
 * Every table becomes a collection of the same name; every row becomes one document
 * with `_id` = its primary key (UUIDs preserved) and every column copied verbatim
 * (snake_case names, same values). Writes are idempotent upserts, so an export can be
 * re-run at any time to bring MongoDB up to date. Afterwards every document is read
 * back and compared field by field with the snapshot.
 */

import { Long } from 'mongodb';
import { config } from '../config/index.js';
import { connectMongo } from '../database/mongo.js';
import { iterateRows, rowFingerprint, rowKey } from './snapshot.js';

/** Tables that are not business data. */
export const MONGO_SKIPPED_TABLES = {
  sessions: 'live login tokens; users sign in again after a cutover',
};

/** Columns that belong to another system once linked. */
export const MONGO_SKIPPED_COLUMNS = {
  users: { password_hash: 'kept by Supabase Auth (npm run cloud:export -- --supabase)' },
};

export const SYNC_META_COLLECTION = '_sacone_sync';
const BATCH = 1000;

export function mongoPlan(snapshot) {
  return snapshot.tables.map((table) => {
    if (MONGO_SKIPPED_TABLES[table.name]) {
      return { table: table.name, rows: table.rowCount, skipped: MONGO_SKIPPED_TABLES[table.name] };
    }
    const omitted = Object.keys(MONGO_SKIPPED_COLUMNS[table.name] || {});
    return {
      table: table.name,
      collection: table.name,
      rows: table.rowCount,
      columns: table.columns.filter((c) => !omitted.includes(c)),
      omittedColumns: omitted,
    };
  });
}

export function assertMongoWritable() {
  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is not set in sacone-api/.env');
  }
  if (!config.mongodbWriteEnabled) {
    throw new Error('MONGODB_WRITE_ENABLED is not true in sacone-api/.env (safety gate for cloud writes)');
  }
}

const toBson = (value) => (typeof value === 'bigint' ? Long.fromBigInt(value) : value);

function toDocument(table, row, columns) {
  const doc = { _id: toBson(rowKey(table, row)) };
  for (const column of columns) doc[column] = toBson(row[column]);
  return doc;
}

export async function exportToMongo(snapshot, { prune = false, log = () => {} } = {}) {
  assertMongoWritable();
  const { db } = await connectMongo();
  const results = [];

  for (const item of mongoPlan(snapshot)) {
    if (item.skipped) {
      results.push(item);
      continue;
    }
    const table = snapshot.table(item.table);
    const collection = db.collection(item.collection);
    const counts = { inserted: 0, updated: 0, unchanged: 0, pruned: 0 };

    let ops = [];
    const flush = async () => {
      if (!ops.length) return;
      const res = await collection.bulkWrite(ops, { ordered: false });
      counts.inserted += res.upsertedCount;
      counts.updated += res.modifiedCount;
      counts.unchanged += res.matchedCount - res.modifiedCount;
      ops = [];
    };
    for (const row of iterateRows(snapshot, table)) {
      const doc = toDocument(table, row, item.columns);
      ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
      if (ops.length >= BATCH) await flush();
    }
    await flush();

    if (prune) counts.pruned = await pruneDeleted(collection, snapshot, table);
    const indexWarnings = await mirrorIndexes(collection, table, item.columns);

    results.push({ ...item, ...counts, indexWarnings });
    log(`  ${item.collection.padEnd(32)} ${String(item.rows).padStart(7)} rows  +${counts.inserted} ~${counts.updated}`
      + (prune ? ` -${counts.pruned}` : ''));
  }

  await db.collection(SYNC_META_COLLECTION).replaceOne(
    { _id: 'last_export' },
    {
      _id: 'last_export',
      snapshotId: snapshot.id,
      snapshotTakenAt: snapshot.takenAt,
      exportedAt: new Date(),
      tables: Object.fromEntries(results.map((r) => [r.table, r.skipped ? { skipped: r.skipped } : { rows: r.rows }])),
    },
    { upsert: true },
  );
  return results;
}

/** Remove documents whose row no longer exists locally (only with --prune). */
async function pruneDeleted(collection, snapshot, table) {
  const keep = new Set();
  for (const row of iterateRows(snapshot, table)) keep.add(JSON.stringify(rowKey(table, row)));
  const stale = [];
  for await (const doc of collection.find({}, { projection: { _id: 1 } })) {
    if (!keep.has(JSON.stringify(doc._id))) stale.push(doc._id);
  }
  let removed = 0;
  for (let i = 0; i < stale.length; i += BATCH) {
    const res = await collection.deleteMany({ _id: { $in: stale.slice(i, i + BATCH) } });
    removed += res.deletedCount;
  }
  return removed;
}

/** Recreate the SQLite indexes (best effort: an index is never worth failing an export). */
async function mirrorIndexes(collection, table, columns) {
  const warnings = [];
  for (const index of table.indexes) {
    if (!index.columns.every((c) => columns.includes(c))) continue;
    const keys = Object.fromEntries(index.columns.map((c) => [c, 1]));
    const options = { name: `sqlite_${index.name}`.slice(0, 120) };
    if (index.unique) {
      // SQLite allows many NULLs in a UNIQUE column; MongoDB only does with a partial index.
      options.unique = true;
      options.partialFilterExpression = Object.fromEntries(index.columns.map((c) => [
        c, { $type: /INT|REAL|NUM|DEC|DOUB|FLOA/.test(table.types[c]) ? 'number' : 'string' },
      ]));
    }
    try {
      await collection.createIndex(keys, options);
    } catch (err) {
      warnings.push(`${index.name}: ${err.message}`);
    }
  }
  return warnings;
}

/**
 * Read every document back and compare it with the snapshot.
 * ok = no row missing and no field different. Extra documents (rows deleted locally)
 * are reported; remove them with --prune.
 */
export async function verifyMongo(snapshot, { log = () => {} } = {}) {
  const { db } = await connectMongo();
  const tables = [];
  for (const item of mongoPlan(snapshot)) {
    if (item.skipped) continue;
    const table = snapshot.table(item.table);
    const expected = new Map();
    for (const row of iterateRows(snapshot, table)) {
      expected.set(JSON.stringify(rowKey(table, row)), rowFingerprint(item.columns, row));
    }

    let matched = 0;
    let extra = 0;
    const mismatched = [];
    for await (const doc of db.collection(item.collection).find({})) {
      const key = JSON.stringify(doc._id);
      const want = expected.get(key);
      if (want === undefined) {
        extra += 1;
      } else if (rowFingerprint(item.columns, doc) === want) {
        matched += 1;
      } else {
        mismatched.push(doc._id);
      }
    }
    const missing = expected.size - matched - mismatched.length;
    const result = {
      table: item.table,
      rows: expected.size,
      matched,
      missing,
      mismatched: mismatched.length,
      mismatchedSample: mismatched.slice(0, 5),
      extra,
      ok: missing === 0 && mismatched.length === 0,
    };
    tables.push(result);
    if (!result.ok || extra) {
      log(`  ${item.collection}: ${matched}/${expected.size} match, ${missing} missing, ${mismatched.length} different, ${extra} extra`);
    }
  }
  return { ok: tables.every((t) => t.ok), tables };
}
