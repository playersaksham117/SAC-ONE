/**
 * Local PostgreSQL for temporary offline dev (no Supabase, no SQLite).
 * Uses pg-mem (in-memory Postgres). Data resets when the Vite process restarts.
 */
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { newDb, DataType } from 'pg-mem'
import { createPgCompatBlocking, createPgPool } from './pgPool.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Migrations live with the ERP UI package (moved under SACHIN ELECTRICALS/erp)
const MIGRATIONS_DIR = path.join(
  __dirname,
  '..',
  '..',
  'SACHIN ELECTRICALS',
  'erp',
  'supabase',
  'migrations'
)
// Fallback while erp package still at top-level during migrate
const MIGRATIONS_DIR_LEGACY = path.join(
  __dirname,
  '..',
  '..',
  'SACHIN ELECTRICALS/erp',
  'supabase',
  'migrations'
)
const BLANK_PATH = path.join(__dirname, 'pg', 'blank.sql')
const RBAC_SEED_PATH = path.join(__dirname, 'pg', 'rbac_seed.sql')

function resolveMigrationsDir() {
  if (fs.existsSync(MIGRATIONS_DIR)) return MIGRATIONS_DIR
  return MIGRATIONS_DIR_LEGACY
}

export const BOOLEAN_FIELDS = new Set([
  'is_active',
  'is_deleted',
  'sync_enabled',
  'is_primary',
  'is_system',
  'granted',
])

export const TABLE_RELATIONS = {
  stock_movements: {
    inventory_items: 'item_id',
    warehouses: 'warehouse_id',
    users: 'created_by',
  },
  stock: {
    inventory_items: 'item_id',
    warehouses: 'warehouse_id',
    storage_locations: 'location_id',
  },
  transactions: {
    inventory_items: 'item_id',
    warehouses: 'warehouse_id',
    users: 'created_by',
    suppliers: 'supplier_id',
    customers: 'customer_id',
  },
  purchase_orders: {
    suppliers: 'supplier_id',
  },
  purchase_order_items: {
    inventory_items: 'item_id',
  },
  stock_adjustments: {
    inventory_items: 'item_id',
    warehouses: 'warehouse_id',
  },
  customers: {
    customer_groups: 'group_id',
  },
  sales: {
    customers: 'customer_id',
  },
  vendor_price_history: {
    suppliers: 'supplier_id',
    inventory_items: 'item_id',
  },
  vendor_ratings: {
    suppliers: 'supplier_id',
  },
  cash_register_sessions: {
    warehouses: 'warehouse_id',
  },
}

let memInstance = null
let dbInstance = null
let pgPool = null
let dbMode = 'pg-mem'

function masterDatabaseUrl() {
  const url = process.env.SACONE_DATABASE_URL || process.env.DATABASE_URL || ''
  return url.startsWith('postgres') ? url : ''
}

export async function initMasterDb() {
  const url = masterDatabaseUrl()
  if (!url) {
    getDb()
    return { mode: dbMode }
  }
  if (dbInstance && dbMode === 'postgres') return { mode: dbMode }

  try {
    pgPool = await createPgPool(url)
    dbInstance = createPgCompatBlocking(pgPool)
    dbMode = 'postgres'
    console.log('[sacone-db] Master PostgreSQL connected')
    return { mode: dbMode }
  } catch (err) {
    console.warn(
      '[sacone-db] PostgreSQL unavailable — falling back to in-memory pg-mem.',
      String(err && err.message ? err.message : err).slice(0, 120)
    )
    dbInstance = null
    pgPool = null
    getDb()
    return { mode: dbMode }
  }
}

export function getDbMode() {
  return dbMode
}

function stripSupabaseOnly(sql) {
  return sql
    .replace(/CREATE\s+EXTENSION[\s\S]*?;/gi, '')
    .replace(/ALTER\s+TABLE[\s\S]*?ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi, '')
    .replace(/CREATE\s+POLICY[\s\S]*?;/gi, '')
    // pg-mem struggles with precision args on numeric types
    .replace(/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'DECIMAL')
    .replace(/\bNUMERIC\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'NUMERIC')
    .replace(/\bJSONB\b/gi, 'JSON')
    .replace(/\buuid_generate_v4\(\)::TEXT/gi, 'uuid_generate_v4()')
    .replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN')
}

function splitStatements(sql) {
  const cleaned = stripSupabaseOnly(sql).replace(/--[^\n]*/g, '')
  const parts = []
  let buf = ''
  let inSingle = false
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === "'" && cleaned[i - 1] !== '\\') inSingle = !inSingle
    if (ch === ';' && !inSingle) {
      const stmt = buf.trim()
      if (stmt) parts.push(stmt)
      buf = ''
    } else {
      buf += ch
    }
  }
  const tail = buf.trim()
  if (tail) parts.push(tail)
  return parts
}

function toPgPlaceholders(sql) {
  let n = 0
  return sql.replace(/\?/g, () => `$${++n}`)
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

/** pg-mem sync API breaks on $1 params; interpolate safely (local-only). */
function bindLocalSql(sql, params = []) {
  let i = 0
  return sql.replace(/\?/g, () => {
    if (i >= params.length) throw new Error('Missing SQL parameter')
    return sqlLiteral(params[i++])
  })
}

function createCompatDb(mem) {
  const schema = mem.public

  function runSql(sql, params) {
    const bound = bindLocalSql(sql, params)
    return schema.query(bound)
  }

  return {
    prepare(sql) {
      return {
        all(...params) {
          const result = runSql(sql, params)
          return result.rows || []
        },
        get(...params) {
          const result = runSql(sql, params)
          return (result.rows && result.rows[0]) || undefined
        },
        run(...params) {
          const result = runSql(sql, params)
          return {
            changes: result.rowCount ?? 0,
            lastInsertRowid: null,
          }
        },
      }
    },
    exec(sql) {
      for (const stmt of splitStatements(sql)) {
        schema.query(stmt)
      }
    },
    transaction(fn) {
      return (...args) => fn(...args)
    },
    pragma() {
      return null
    },
  }
}

function registerUuid(mem) {
  mem.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.text,
    implementation: () => randomUUID(),
    impure: true,
  })
}

function applyMigrations(compat) {
  const migrationsDir = resolveMigrationsDir()
  if (!fs.existsSync(migrationsDir)) {
    console.warn('[sacone-db] No migrations dir found at', migrationsDir)
    return
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    for (const stmt of splitStatements(sql)) {
      try {
        compat.exec(stmt)
      } catch (err) {
        const msg = String(err.message || err)
        // Ignore idempotent / unsupported Supabase leftovers
        if (
          /already exists/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /auth\.role/i.test(msg) ||
          /Not supported/i.test(msg) ||
          /failed to parse/i.test(msg)
        ) {
          continue
        }
        console.warn(`[local-pg] migration warn (${file}):`, msg.slice(0, 200))
      }
    }
  }
}

function runSqlFile(compat, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  for (const stmt of splitStatements(sql)) {
    try {
      compat.exec(stmt)
    } catch (err) {
      console.warn(`[local-pg] seed warn:`, String(err.message || err).slice(0, 200))
    }
  }
}

function ensureApprovalTables(compat) {
  compat.exec(`
    CREATE TABLE IF NOT EXISTS public.approval_requests (
      id TEXT PRIMARY KEY,
      request_no TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT,
      requester_role TEXT,
      operation TEXT NOT NULL,
      reason TEXT,
      warehouse_id TEXT,
      reference_no TEXT,
      notes TEXT,
      payload TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS public.approval_history (
      id TEXT PRIMARY KEY,
      approval_id TEXT,
      action TEXT NOT NULL,
      actor_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role_code TEXT,
      action TEXT NOT NULL,
      module TEXT,
      entity_type TEXT,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      approval_id TEXT,
      status TEXT,
      ip_address TEXT,
      device TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
}

function ensurePosExtensions(compat) {
  try {
    compat.exec(`
      CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT,
        opened_by TEXT,
        opened_at TIMESTAMPTZ DEFAULT NOW(),
        opening_float DECIMAL DEFAULT 0,
        closed_by TEXT,
        closed_at TIMESTAMPTZ,
        closing_cash DECIMAL,
        expected_cash DECIMAL,
        variance DECIMAL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
  } catch (e) {
    console.warn('[local-pg] cash_register ensure:', String(e.message || e).slice(0, 120))
  }
  try {
    compat.exec(`ALTER TABLE public.sales ADD COLUMN original_sale_id TEXT`)
  } catch {
    /* may already exist */
  }
  // Relax status constraint for quotations / returns (pg-mem / PG)
  try {
    compat.exec(`ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check`)
  } catch {
    /* ignore */
  }
}

function bootstrapMem() {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  registerUuid(mem)
  const compat = createCompatDb(mem)
  applyMigrations(compat)
  ensureApprovalTables(compat)
  ensurePosExtensions(compat)
  runSqlFile(compat, BLANK_PATH)
  runSqlFile(compat, RBAC_SEED_PATH)
  console.log('[local-pg] In-memory PostgreSQL ready (pg-mem) — no Supabase, no SQLite')
  return { mem, compat }
}

export function getDb() {
  if (dbInstance) return dbInstance
  const boot = bootstrapMem()
  memInstance = boot.mem
  dbInstance = boot.compat
  dbMode = 'pg-mem'
  return dbInstance
}

export function blankDb() {
  if (dbMode === 'postgres') {
    console.warn('[sacone-db] reset not supported on master PostgreSQL — run migrate-master-db')
    return dbInstance
  }
  memInstance = null
  dbInstance = null
  const boot = bootstrapMem()
  memInstance = boot.mem
  dbInstance = boot.compat
  console.log('[local-pg] Database re-seeded (blank)')
  return dbInstance
}

export function resetDb() {
  return blankDb()
}

export function tableHasColumn(table, column) {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`
    )
    .get(table, column)
  return Boolean(row)
}

export function normalizeValue(value) {
  // Keep real booleans for Postgres
  return value
}

export function normalizeRow(row) {
  if (!row) return row
  const out = { ...row }
  for (const key of Object.keys(out)) {
    if (BOOLEAN_FIELDS.has(key)) {
      out[key] = Boolean(out[key])
    }
  }
  return out
}

export function normalizeRows(rows) {
  return rows.map(normalizeRow)
}
