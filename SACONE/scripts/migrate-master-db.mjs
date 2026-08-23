/**
 * Apply all ERP + web store SQL migrations to the master PostgreSQL database.
 *
 * Usage:
 *   SACONE_DATABASE_URL=postgresql://sacone:sacone@localhost:5432/sacone node scripts/migrate-master-db.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MIGRATIONS_DIR = path.join(ROOT, 'SACHIN ELECTRICALS', 'erp', 'supabase', 'migrations')
const BLANK_PATH = path.join(ROOT, 'sacone-api', 'erp', 'pg', 'blank.sql')
const RBAC_SEED_PATH = path.join(ROOT, 'sacone-api', 'erp', 'pg', 'rbac_seed.sql')

const DATABASE_URL =
  process.env.SACONE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://sacone:sacone@localhost:5432/sacone'

function stripSupabaseOnly(sql) {
  return sql
    .replace(/CREATE\s+EXTENSION[\s\S]*?;/gi, '')
    .replace(/ALTER\s+TABLE[\s\S]*?ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi, '')
    .replace(/CREATE\s+POLICY[\s\S]*?;/gi, '')
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

async function runFile(client, filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[migrate] skip missing ${label}`)
    return
  }
  const sql = fs.readFileSync(filePath, 'utf8')
  for (const stmt of splitStatements(sql)) {
    try {
      await client.query(stmt)
    } catch (err) {
      const msg = String(err.message || err)
      if (/already exists/i.test(msg) || /duplicate/i.test(msg)) continue
      console.warn(`[migrate] warn (${label}):`, msg.slice(0, 200))
    }
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      console.log(`[migrate] ${file}`)
      await runFile(client, path.join(MIGRATIONS_DIR, file), file)
    }
    await runFile(client, BLANK_PATH, 'blank.sql')
    await runFile(client, RBAC_SEED_PATH, 'rbac_seed.sql')
    console.log('[migrate] Master database ready:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
