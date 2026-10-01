/**
 * SQLite snapshot → Supabase (authentication + RBAC).
 *
 *   users            → auth.users (same UUID, bcrypt password hash imported as-is,
 *                      inactive users banned) + public.profiles (name, phone, role, status)
 *   modules, features, permissions, roles, role_permissions → public tables of the same name
 *
 * Safety:
 *   - every row is converted and validated before anything is written;
 *   - a local column the Supabase schema doesn't have aborts the export (no silent loss);
 *   - RBAC tables are mirrored inside one transaction (all or nothing);
 *   - auth accounts are created/updated, never deleted;
 *   - everything is read back and compared with the snapshot afterwards.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config/index.js';
import { iterateRows } from './snapshot.js';

const SCHEMA_SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supabase', 'schema.sql');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h';
const BATCH = 500;

const TIMES = { created_at: 'time', updated_at: 'time' };

/** SQLite source → Supabase target, parents first. Column types: uuid | text | num | bool | time. */
export const SUPABASE_TABLES = [
  {
    source: 'modules',
    target: 'modules',
    columns: { id: 'uuid', code: 'text', name: 'text', sort_order: 'num', is_active: 'bool', ...TIMES },
  },
  {
    source: 'features',
    target: 'features',
    columns: {
      id: 'uuid', module_id: 'uuid', code: 'text', name: 'text', sort_order: 'num', is_active: 'bool', ...TIMES,
    },
  },
  {
    source: 'permissions',
    target: 'permissions',
    columns: {
      id: 'uuid', module_id: 'uuid', feature_id: 'uuid', action: 'text', permission_key: 'text', created_at: 'time',
    },
  },
  {
    source: 'roles',
    target: 'roles',
    columns: {
      id: 'uuid', name: 'text', slug: 'text', description: 'text', is_system: 'bool', is_active: 'bool', ...TIMES,
      created_by: 'text',
    },
  },
  {
    source: 'role_permissions',
    target: 'role_permissions',
    columns: { id: 'uuid', role_id: 'uuid', permission_id: 'uuid', created_at: 'time' },
  },
  {
    source: 'users',
    target: 'profiles',
    columns: {
      id: 'uuid', email: 'text', full_name: 'text', phone: 'text', role_id: 'uuid', is_active: 'bool',
      last_login_at: 'time', ...TIMES, created_by: 'text',
    },
    /** Goes to auth.users instead of a table column. */
    authColumns: ['password_hash'],
  },
];

const RBAC_SPECS = SUPABASE_TABLES.filter((s) => s.target !== 'profiles');
const PROFILE_SPEC = SUPABASE_TABLES.find((s) => s.target === 'profiles');

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey && config.supabase.dbUrl);
}

export function assertSupabaseConfigured() {
  const missing = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['SUPABASE_DB_URL', config.supabase.dbUrl],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Set ${missing.join(', ')} in sacone-api/.env`);
}

/* ───────────────────────── value conversion ───────────────────────── */

/** SQLite datetime('now') has no zone and is UTC; ISO strings keep their offset. */
function toDate(value) {
  const text = String(value).trim();
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
  const date = new Date(naive ? `${text.replace(' ', 'T')}Z` : text);
  if (Number.isNaN(date.getTime())) throw new Error(`not a date: "${text}"`);
  return date;
}

function convert(value, type) {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'uuid':
      if (!UUID.test(String(value))) throw new Error(`not a UUID: "${value}"`);
      return String(value).toLowerCase();
    case 'bool': return Boolean(Number(value));
    case 'num': return Number(value);
    case 'time': return toDate(value);
    default: return String(value);
  }
}

/** Postgres returns numeric as a string and timestamptz as a Date; compare on values. */
function canonical(value, type) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (type === 'num') return Number(value);
  return value;
}

function fingerprint(spec, row) {
  const values = Object.entries(spec.columns).map(([c, type]) => canonical(row[c], type));
  return crypto.createHash('sha1').update(JSON.stringify(values)).digest('hex');
}

/** Convert every row up front; any bad value or unknown column aborts before a single write. */
export function prepareSupabaseRows(snapshot) {
  const prepared = {};
  const problems = [];
  for (const spec of SUPABASE_TABLES) {
    const table = snapshot.table(spec.source);
    if (!table) {
      problems.push(`local table "${spec.source}" not found`);
      continue;
    }
    const known = new Set([...Object.keys(spec.columns), ...(spec.authColumns || [])]);
    const unknown = table.columns.filter((c) => !known.has(c));
    if (unknown.length) {
      problems.push(`${spec.source} has columns the Supabase schema lacks: ${unknown.join(', ')} `
        + '(add them to src/cloud/supabase/schema.sql and SUPABASE_TABLES)');
      continue;
    }
    prepared[spec.target] = [];
    for (const raw of iterateRows(snapshot, table)) {
      const row = {};
      try {
        for (const [column, type] of Object.entries(spec.columns)) row[column] = convert(raw[column], type);
      } catch (err) {
        problems.push(`${spec.source} ${raw.id}: ${err.message}`);
        continue;
      }
      if (spec.authColumns) row.auth = Object.fromEntries(spec.authColumns.map((c) => [c, raw[c]]));
      prepared[spec.target].push(row);
    }
  }
  if (problems.length) {
    throw new Error(`Supabase export blocked, nothing was written:\n  - ${problems.slice(0, 20).join('\n  - ')}`);
  }
  return prepared;
}

/* ───────────────────────── connections ───────────────────────── */

function pgClient() {
  const url = new URL(config.supabase.dbUrl);
  url.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Supabase certificates chain to Supabase's own CA, which Node does not ship.
  const mode = (process.env.SUPABASE_DB_SSL || (local ? 'disable' : 'no-verify')).toLowerCase();
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'verify' },
  });
  // A dropped connection then fails the pending query (and the export) instead of crashing.
  client.on('error', () => {});
  return client;
}

async function authAdmin(method, route, body) {
  const key = config.supabase.serviceRoleKey;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role JWTs also go in Authorization; new sb_secret_ keys must not.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${config.supabase.url}/auth/v1${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    data,
    error: data.msg || data.message || data.error_description || data.error || `HTTP ${res.status}`,
  };
}

export async function pingSupabase() {
  if (!isSupabaseConfigured()) return { ok: false, message: 'not configured' };
  const result = { ok: false };
  const client = pgClient();
  try {
    await client.connect();
    const { rows } = await client.query(`
      select current_setting('server_version') as version,
             to_regclass('public.profiles') is not null as schema_applied,
             exists (select 1 from pg_namespace where nspname = 'auth') as has_auth
    `);
    Object.assign(result, { database: true, ...rows[0] });
  } catch (err) {
    result.databaseError = err.message;
  } finally {
    await client.end().catch(() => {});
  }
  try {
    const res = await authAdmin('GET', '/admin/users?page=1&per_page=1');
    result.auth = res.ok;
    if (!res.ok) result.authError = res.error;
  } catch (err) {
    result.authError = err.message;
  }
  result.ok = Boolean(result.database && result.auth && result.has_auth);
  if (result.database && !result.has_auth) result.databaseError = 'no "auth" schema: SUPABASE_DB_URL is not a Supabase database';
  return result;
}

/* ───────────────────────── export ───────────────────────── */

async function upsertRows(client, spec, rows) {
  const columns = Object.keys(spec.columns);
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params = [];
    const tuples = chunk.map((row) => `(${columns.map((c) => {
      params.push(row[c]);
      return `$${params.length}`;
    }).join(', ')})`);
    await client.query(
      `insert into public.${spec.target} (${columns.join(', ')}) values ${tuples.join(', ')}
       on conflict (id) do update set ${updates}`,
      params,
    );
  }
}

/** Remove rows that no longer exist locally, children first (inside the open transaction). */
async function deleteStale(client, prepared) {
  let removed = 0;
  for (const spec of [...SUPABASE_TABLES].reverse()) {
    const ids = prepared[spec.target].map((r) => r.id);
    const res = await client.query(`delete from public.${spec.target} where not (id = any($1::uuid[]))`, [ids]);
    removed += res.rowCount;
  }
  return removed;
}

function authPayload(user, roleSlugs) {
  return {
    email: user.email,
    user_metadata: { full_name: user.full_name, phone: user.phone },
    app_metadata: { sacone_role_id: user.role_id, sacone_role: roleSlugs.get(user.role_id) || null },
  };
}

async function syncAuthUsers(prepared, log) {
  const roleSlugs = new Map(prepared.roles.map((r) => [r.id, r.slug]));
  const results = [];
  for (const user of prepared.profiles) {
    const base = authPayload(user, roleSlugs);
    const passwordHash = user.auth.password_hash;
    const existing = await authAdmin('GET', `/admin/users/${user.id}`);
    let res;
    let action;
    const warnings = [];

    if (existing.status === 404) {
      action = 'created';
      res = await authAdmin('POST', '/admin/users', {
        id: user.id,
        ...base,
        password_hash: passwordHash,
        email_confirm: true,
        ...(user.is_active ? {} : { ban_duration: BAN_FOREVER }),
      });
    } else if (existing.ok) {
      action = 'updated';
      const update = { ...base, ban_duration: user.is_active ? 'none' : BAN_FOREVER };
      res = await authAdmin('PUT', `/admin/users/${user.id}`, { ...update, password_hash: passwordHash });
      if (!res.ok && /password/i.test(res.error)) {
        const rejected = res.error;
        res = await authAdmin('PUT', `/admin/users/${user.id}`, update);
        if (res.ok) warnings.push(`password not updated (${rejected})`);
      }
    } else {
      action = 'lookup';
      res = existing;
    }

    results.push({ id: user.id, email: user.email, action, ok: res.ok, error: res.ok ? null : res.error, warnings });
    log(`  auth ${user.email.padEnd(32)} ${res.ok ? action : `FAILED (${res.error})`}`);
  }
  return results;
}

export async function exportToSupabase(snapshot, { log = () => {} } = {}) {
  assertSupabaseConfigured();
  const prepared = prepareSupabaseRows(snapshot);
  const client = pgClient();
  await client.connect();
  const summary = { tables: {}, removed: 0, auth: [] };

  try {
    await client.query(fs.readFileSync(SCHEMA_SQL, 'utf8'));
    log('  schema applied (tables, RLS policies, has_permission(), access-token hook)');

    await client.query('begin');
    try {
      summary.removed = await deleteStale(client, prepared);
      for (const spec of RBAC_SPECS) {
        await upsertRows(client, spec, prepared[spec.target]);
        summary.tables[spec.target] = prepared[spec.target].length;
        log(`  ${spec.target.padEnd(32)} ${String(prepared[spec.target].length).padStart(7)} rows`);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    }

    summary.auth = await syncAuthUsers(prepared, log);
    const authed = new Set(summary.auth.filter((a) => a.ok).map((a) => a.id));
    const profiles = prepared.profiles.filter((p) => authed.has(p.id));

    await client.query('begin');
    try {
      await upsertRows(client, PROFILE_SPEC, profiles);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    }
    summary.tables.profiles = profiles.length;
    log(`  ${'profiles'.padEnd(32)} ${String(profiles.length).padStart(7)} rows`);
    return summary;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Read everything back and compare with the snapshot. */
export async function verifySupabase(snapshot, { log = () => {} } = {}) {
  assertSupabaseConfigured();
  const prepared = prepareSupabaseRows(snapshot);
  const client = pgClient();
  await client.connect();
  const tables = [];
  try {
    for (const spec of SUPABASE_TABLES) {
      const expected = new Map(prepared[spec.target].map((r) => [r.id, fingerprint(spec, r)]));
      const { rows } = await client.query(`select ${Object.keys(spec.columns).join(', ')} from public.${spec.target}`);
      let matched = 0;
      let extra = 0;
      const mismatched = [];
      for (const row of rows) {
        const want = expected.get(row.id);
        if (want === undefined) extra += 1;
        else if (fingerprint(spec, row) === want) matched += 1;
        else mismatched.push(row.id);
      }
      const missing = expected.size - matched - mismatched.length;
      const result = {
        table: spec.target,
        rows: expected.size,
        matched,
        missing,
        mismatched: mismatched.length,
        mismatchedSample: mismatched.slice(0, 5),
        extra,
        ok: missing === 0 && mismatched.length === 0 && extra === 0,
      };
      tables.push(result);
      if (!result.ok) log(`  ${spec.target}: ${matched}/${expected.size} match, ${missing} missing, ${mismatched.length} different, ${extra} extra`);
    }
  } finally {
    await client.end().catch(() => {});
  }

  const auth = [];
  for (const user of prepared.profiles) {
    const res = await authAdmin('GET', `/admin/users/${user.id}`);
    const banned = Boolean(res.data?.banned_until && new Date(res.data.banned_until) > new Date());
    const ok = res.ok
      && String(res.data.email || '').toLowerCase() === String(user.email).toLowerCase()
      && banned === !user.is_active;
    auth.push({ id: user.id, email: user.email, ok, error: res.ok ? null : res.error });
    if (!ok) log(`  auth ${user.email}: ${res.ok ? 'email or active status differs' : res.error}`);
  }
  tables.push({
    table: 'auth.users',
    rows: auth.length,
    matched: auth.filter((a) => a.ok).length,
    missing: auth.filter((a) => !a.ok).length,
    ok: auth.every((a) => a.ok),
  });

  return { ok: tables.every((t) => t.ok), tables };
}
