/**
 * Cloud link: copy the local SACONE server's data to MongoDB (business data) and
 * Supabase (authentication + RBAC) without losing anything. Server-side only; there is
 * deliberately no button for this in the ERP or Owner apps.
 *
 *   npm run cloud:status                    what is configured and reachable
 *   npm run cloud:export                    export to every configured target, then verify
 *   npm run cloud:export -- --mongo         MongoDB only      (--supabase: Supabase only)
 *   npm run cloud:export -- --dry-run       snapshot + checks, no cloud writes
 *   npm run cloud:export -- --prune         also delete Mongo docs for rows deleted locally
 *   npm run cloud:verify                    re-compare the latest snapshot with the cloud
 *
 * The local SQLite database is only ever read (through an online backup), so this is
 * safe while the API is running. See docs/CLOUD_LINK.md.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { closeMongo, pingMongo } from '../database/mongo.js';
import {
  SNAPSHOT_ROOT, latestSnapshotDir, liveDatabasePath, openSnapshot, takeSnapshot,
} from '../cloud/snapshot.js';
import { assertMongoWritable, exportToMongo, mongoPlan, verifyMongo } from '../cloud/mongo-export.js';
import {
  exportToSupabase, isSupabaseConfigured, pingSupabase, prepareSupabaseRows, verifySupabase,
} from '../cloud/supabase-export.js';

const KEEP_SNAPSHOTS = 10;
const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'status';
const flag = (name) => args.includes(`--${name}`);
const log = (...parts) => console.log(...parts);

function selectedTargets() {
  const mongo = Boolean(config.mongodbUri);
  const supabase = isSupabaseConfigured();
  if (flag('mongo') || flag('supabase')) {
    return { mongo: flag('mongo'), supabase: flag('supabase') };
  }
  return { mongo, supabase };
}

async function status() {
  log('SACONE cloud link status\n');
  log(`Local database   ${liveDatabasePath()}`);
  if (fs.existsSync(liveDatabasePath())) {
    const snap = openSnapshot(path.dirname(liveDatabasePath()), liveDatabasePath());
    const rows = snap.tables.reduce((s, t) => s + t.rowCount, 0);
    log(`                 ${snap.tables.length} tables, ${rows} rows`);
    snap.close();
  } else {
    log('                 missing (run npm run db:setup)');
  }

  log(`\nMongoDB          ${config.mongodbUri ? `configured, database "${config.mongodbDatabase}"` : 'not configured (MONGODB_URI)'}`);
  if (config.mongodbUri) {
    const ping = await pingMongo();
    log(`                 ${ping.ok ? 'reachable' : `NOT reachable: ${ping.message}`}`);
    log(`                 writes ${config.mongodbWriteEnabled ? 'enabled' : 'disabled (set MONGODB_WRITE_ENABLED=true to export)'}`);
  }

  log(`\nSupabase         ${isSupabaseConfigured() ? config.supabase.url : 'not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)'}`);
  if (isSupabaseConfigured()) {
    const ping = await pingSupabase();
    log(`                 database ${ping.database ? `reachable (Postgres ${ping.version})` : `NOT reachable: ${ping.databaseError}`}`);
    log(`                 auth admin API ${ping.auth ? 'reachable' : `NOT reachable: ${ping.authError}`}`);
    if (ping.database) log(`                 SACONE schema ${ping.schema_applied ? 'applied' : 'not applied yet (first export applies it)'}`);
  }

  const latest = path.join(SNAPSHOT_ROOT, 'latest.json');
  if (fs.existsSync(latest)) {
    const report = JSON.parse(fs.readFileSync(latest, 'utf8'));
    log(`\nLast export      ${report.finishedAt}  snapshot ${report.snapshotId}  ${report.ok ? 'VERIFIED' : 'NOT VERIFIED'}`);
  } else {
    log('\nLast export      never');
  }
}

function printVerify(name, result) {
  const rows = result.tables.reduce((s, t) => s + t.rows, 0);
  const extra = result.tables.reduce((s, t) => s + (t.extra || 0), 0);
  log(`${name}: ${result.ok ? 'VERIFIED' : 'FAILED'}: ${rows} rows across ${result.tables.length} tables compared field by field`
    + (extra ? ` (${extra} extra docs for rows deleted locally; use --prune)` : ''));
}

function pruneOldSnapshots() {
  const dirs = fs.readdirSync(SNAPSHOT_ROOT)
    .filter((d) => fs.statSync(path.join(SNAPSHOT_ROOT, d)).isDirectory())
    .sort();
  for (const dir of dirs.slice(0, Math.max(0, dirs.length - KEEP_SNAPSHOTS))) {
    fs.rmSync(path.join(SNAPSHOT_ROOT, dir), { recursive: true, force: true });
  }
}

async function exportCommand() {
  const targets = selectedTargets();
  if (!targets.mongo && !targets.supabase) {
    throw new Error('No cloud target configured. Set MONGODB_URI and/or SUPABASE_* in sacone-api/.env (see docs/CLOUD_LINK.md).');
  }
  if (targets.mongo && !flag('dry-run')) assertMongoWritable();

  log('Taking a consistent snapshot of the local database…');
  const snapshot = await takeSnapshot();
  const totalRows = snapshot.tables.reduce((s, t) => s + t.rowCount, 0);
  log(`  ${snapshot.id}: ${snapshot.tables.length} tables, ${totalRows} rows\n`);

  const report = {
    snapshotId: snapshot.id,
    snapshotTakenAt: snapshot.takenAt,
    dryRun: flag('dry-run'),
    targets,
    startedAt: new Date().toISOString(),
  };

  try {
    if (flag('dry-run')) {
      if (targets.mongo) {
        const plan = mongoPlan(snapshot);
        log(`MongoDB plan: ${plan.filter((p) => !p.skipped).length} collections`);
        for (const p of plan.filter((x) => x.skipped || x.omittedColumns.length)) {
          log(`  ${p.table}: ${p.skipped ? `skipped (${p.skipped})` : `without ${p.omittedColumns.join(', ')}`}`);
        }
        const ping = await pingMongo();
        log(`  connection: ${ping.ok ? 'OK' : ping.message}\n`);
        report.mongo = { plan, ping };
      }
      if (targets.supabase) {
        const prepared = prepareSupabaseRows(snapshot);
        log('Supabase plan: ' + Object.entries(prepared).map(([t, rows]) => `${t} ${rows.length}`).join(', '));
        const ping = await pingSupabase();
        log(`  connection: ${ping.ok ? 'OK' : (ping.databaseError || ping.authError)}\n`);
        report.supabase = { ping };
      }
      report.ok = true;
      log('Dry run: nothing was written to the cloud.');
      return report;
    }

    if (targets.mongo) {
      log(`MongoDB → "${config.mongodbDatabase}"`);
      report.mongo = { export: await exportToMongo(snapshot, { prune: flag('prune'), log }) };
      report.mongo.verify = await verifyMongo(snapshot, { log });
      printVerify('MongoDB', report.mongo.verify);
      log('');
    }
    if (targets.supabase) {
      log(`Supabase → ${config.supabase.url}`);
      report.supabase = { export: await exportToSupabase(snapshot, { log }) };
      report.supabase.verify = await verifySupabase(snapshot, { log });
      printVerify('Supabase', report.supabase.verify);
      log('');
    }
    report.ok = [report.mongo?.verify, report.supabase?.verify].filter(Boolean).every((v) => v.ok);
    return report;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(snapshot.dir, 'report.json'), JSON.stringify(report, null, 2));
    if (!report.dryRun) fs.writeFileSync(path.join(SNAPSHOT_ROOT, 'latest.json'), JSON.stringify(report, null, 2));
    snapshot.close();
    pruneOldSnapshots();
  }
}

async function verifyCommand() {
  const dir = args.includes('--snapshot') ? args[args.indexOf('--snapshot') + 1] : latestSnapshotDir();
  if (!dir) throw new Error('No snapshot yet. Run npm run cloud:export first.');
  const snapshot = openSnapshot(path.isAbsolute(dir) ? dir : path.join(SNAPSHOT_ROOT, dir));
  const targets = selectedTargets();
  log(`Verifying snapshot ${snapshot.id} (${snapshot.takenAt})\n`);
  try {
    const results = [];
    if (targets.mongo) {
      const result = await verifyMongo(snapshot, { log });
      printVerify('MongoDB', result);
      results.push(result);
    }
    if (targets.supabase) {
      const result = await verifySupabase(snapshot, { log });
      printVerify('Supabase', result);
      results.push(result);
    }
    return { ok: results.every((r) => r.ok) };
  } finally {
    snapshot.close();
  }
}

const commands = { status, export: exportCommand, verify: verifyCommand };

try {
  if (!commands[command]) throw new Error(`Unknown command "${command}". Use status, export or verify.`);
  const result = await commands[command]();
  if (result && result.ok === false) {
    log('\nNot everything matched. The local database is untouched; fix the reported issue and re-run.');
    process.exitCode = 1;
  } else if (command === 'export' && !result.dryRun) {
    log('Done. Every row in the snapshot is in the cloud and identical.');
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  await closeMongo().catch(() => {});
}
