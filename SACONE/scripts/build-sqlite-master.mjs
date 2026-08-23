/**
 * Build / refresh the master SQLite file that holds EVERYTHING:
 *  - ERP tables (from sqlite schema + optional live API pull)
 *  - Web Store / Prisma tables (copied from prisma/dev.db as store_* names)
 *
 * Output: data/sacone.sqlite
 */
import fs from 'fs'
import Database from 'better-sqlite3'
import {
  ensureDirs,
  MASTER_SQLITE,
  PRISMA_SQLITE,
  ERP_SQLITE_SCHEMA,
  ERP_SQLITE_SEED,
  ERP_SQLITE_RBAC,
  ERP_TABLES,
  loadEnvFiles,
} from './lib/db-paths.mjs'

loadEnvFiles()
ensureDirs()

function splitSql(sql) {
  const cleaned = sql.replace(/--[^\n]*/g, '')
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

function execSqlFile(db, filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[sqlite] skip missing ${label}: ${filePath}`)
    return
  }
  const sql = fs.readFileSync(filePath, 'utf8')
  for (const stmt of splitSql(sql)) {
    try {
      db.exec(stmt)
    } catch (err) {
      const msg = String(err.message || err)
      if (/already exists|duplicate/i.test(msg)) continue
      console.warn(`[sqlite] ${label}:`, msg.slice(0, 160))
    }
  }
}

function listTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all()
    .map((r) => r.name)
}

function copyTableRows(src, dest, srcTable, destTable) {
  const info = src.prepare(`PRAGMA table_info("${srcTable}")`).all()
  if (!info.length) return 0

  const colNames = info.map((c) => c.name)
  const colList = colNames.map((c) => `"${c}"`).join(', ')
  const placeholders = colNames.map(() => '?').join(', ')

  const master = src
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(srcTable)
  if (!master?.sql) return 0

  let createSql = master.sql
  if (srcTable !== destTable) {
    createSql = createSql.replace(
      new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?["']?${srcTable}["']?`, 'i'),
      `CREATE TABLE IF NOT EXISTS "${destTable}"`
    )
  } else {
    createSql = createSql.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ')
  }

  try {
    dest.exec(createSql)
  } catch (err) {
    if (srcTable !== destTable || destTable.startsWith('web_')) {
      dest.exec(`DROP TABLE IF EXISTS "${destTable}"`)
      dest.exec(createSql)
    } else {
      console.warn(`[sqlite] keep existing ${destTable}:`, String(err.message || err).slice(0, 120))
    }
  }

  const rows = src.prepare(`SELECT * FROM "${srcTable}"`).all()
  if (!rows.length) return 0

  const insert = dest.prepare(
    `INSERT OR REPLACE INTO "${destTable}" (${colList}) VALUES (${placeholders})`
  )
  const tx = dest.transaction((batch) => {
    for (const row of batch) {
      insert.run(
        ...colNames.map((c) => {
          const v = row[c]
          if (typeof v === 'boolean') return v ? 1 : 0
          return v
        })
      )
    }
  })
  tx(rows)
  return rows.length
}

async function pullErpFromApi(db) {
  const base = process.env.SACONE_API_URL || 'http://localhost:4000'
  let pulled = 0
  for (const table of ERP_TABLES) {
    try {
      const res = await fetch(`${base}/api/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table,
          op: 'select',
        }),
      })
      if (!res.ok) continue
      const json = await res.json()
      if (json?.error) continue
      const rows = json?.data
      if (!Array.isArray(rows) || !rows.length) continue

      // Ensure table exists
      const exists = db
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?`
        )
        .get(table)
      if (!exists) {
        // Create a loose JSON-blob style table if schema missing
        const cols = Object.keys(rows[0])
        const defs = cols.map((c) => `"${c}" TEXT`).join(', ')
        db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${defs})`)
      }

      const info = db.prepare(`PRAGMA table_info(${table})`).all()
      const colNames = info.map((c) => c.name)
      if (!colNames.length) continue

      const colList = colNames.map((c) => `"${c}"`).join(', ')
      const placeholders = colNames.map(() => '?').join(', ')
      db.exec(`DELETE FROM "${table}"`)
      const insert = db.prepare(
        `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`
      )
      const tx = db.transaction((batch) => {
        for (const row of batch) {
          insert.run(
            ...colNames.map((c) => {
              const v = row[c]
              if (v === null || v === undefined) return null
              if (typeof v === 'object') return JSON.stringify(v)
              if (typeof v === 'boolean') return v ? 1 : 0
              return v
            })
          )
        }
      })
      tx(rows)
      pulled += rows.length
      console.log(`[sqlite] ERP ${table}: ${rows.length} rows`)
    } catch {
      // API may be down — keep schema-only
    }
  }
  return pulled
}

async function main() {
  console.log('[sqlite] Building master database…')
  if (fs.existsSync(MASTER_SQLITE)) {
    fs.unlinkSync(MASTER_SQLITE)
  }

  const db = new Database(MASTER_SQLITE)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF')

  // 1) ERP schema + seeds
  execSqlFile(db, ERP_SQLITE_SCHEMA, 'erp-schema')
  execSqlFile(db, ERP_SQLITE_SEED, 'erp-seed')
  execSqlFile(db, ERP_SQLITE_RBAC, 'erp-rbac')

  // 2) Pull live ERP data from API when available
  const erpRows = await pullErpFromApi(db)
  console.log(`[sqlite] ERP live rows pulled: ${erpRows}`)

  // 3) Copy Prisma / web-store SQLite tables as web_*
  if (fs.existsSync(PRISMA_SQLITE)) {
    const prisma = new Database(PRISMA_SQLITE, { readonly: true, fileMustExist: true })
    const tables = listTables(prisma)
    let copied = 0
    for (const table of tables) {
      if (table === '_prisma_migrations') continue
      const dest = table.startsWith('web_') ? table : `web_${table}`
      const n = copyTableRows(prisma, db, table, dest)
      copied += n
      console.log(`[sqlite] Prisma ${table} → ${dest}: ${n} rows`)
    }
    prisma.close()
    console.log(`[sqlite] Prisma rows copied: ${copied}`)
  } else {
    console.warn(`[sqlite] Prisma DB not found: ${PRISMA_SQLITE}`)
  }

  // Meta
  db.exec(`
    CREATE TABLE IF NOT EXISTS _sacone_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)
  db.prepare(
    `INSERT OR REPLACE INTO _sacone_meta (key, value) VALUES (?, ?)`
  ).run('built_at', new Date().toISOString())
  db.prepare(
    `INSERT OR REPLACE INTO _sacone_meta (key, value) VALUES (?, ?)`
  ).run('source', 'erp-sqlite-schema+prisma+api')

  const all = listTables(db)
  db.close()

  console.log(`[sqlite] Master ready: ${MASTER_SQLITE}`)
  console.log(`[sqlite] Tables (${all.length}): ${all.join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
