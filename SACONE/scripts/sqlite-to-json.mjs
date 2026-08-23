/**
 * SQLite → JSON
 * Reads data/sacone.sqlite and writes exports/sacone-sqlite.json
 *
 * Shape:
 * {
 *   exportedAt, source, tables: { [tableName]: [ {..rows} ] }
 * }
 */
import fs from 'fs'
import Database from 'better-sqlite3'
import {
  ensureDirs,
  MASTER_SQLITE,
  JSON_EXPORT,
  loadEnvFiles,
} from './lib/db-paths.mjs'

loadEnvFiles()
ensureDirs()

function listTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all()
    .map((r) => r.name)
}

function main() {
  if (!fs.existsSync(MASTER_SQLITE)) {
    console.error(`[json] Missing ${MASTER_SQLITE}`)
    console.error('Run: npm run db:sqlite')
    process.exit(1)
  }

  const db = new Database(MASTER_SQLITE, { readonly: true, fileMustExist: true })
  const tables = listTables(db)
  const payload = {
    exportedAt: new Date().toISOString(),
    source: MASTER_SQLITE,
    engine: 'sqlite',
    tableCount: tables.length,
    tables: {},
  }

  for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all()
    payload.tables[table] = rows
    console.log(`[json] ${table}: ${rows.length}`)
  }
  db.close()

  fs.writeFileSync(JSON_EXPORT, JSON.stringify(payload, null, 2), 'utf8')
  const sizeKb = Math.round(fs.statSync(JSON_EXPORT).size / 1024)
  console.log(`[json] Wrote ${JSON_EXPORT} (${sizeKb} KB, ${tables.length} tables)`)
}

main()
