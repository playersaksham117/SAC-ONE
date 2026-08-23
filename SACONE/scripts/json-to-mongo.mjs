/**
 * JSON → MongoDB cluster
 * Reads exports/sacone-sqlite.json and upserts each table as a Mongo collection.
 *
 * Env:
 *   MONGODB_URI   required  e.g. mongodb+srv://user:pass@cluster.mongodb.net
 *   MONGODB_DB    optional  default: sacone
 */
import fs from 'fs'
import { MongoClient } from 'mongodb'
import { JSON_EXPORT, loadEnvFiles } from './lib/db-paths.mjs'

loadEnvFiles()

function docId(row) {
  if (row.id != null) return String(row.id)
  if (row._id != null) return String(row._id)
  return null
}

async function upsertCollection(db, name, rows) {
  const col = db.collection(name)
  if (!rows.length) {
    await col.deleteMany({})
    return { name, upserted: 0, modified: 0, cleared: true }
  }

  const ops = []
  for (const row of rows) {
    const id = docId(row)
    const doc = { ...row }
    // Keep original id field; use _id for Mongo primary key when available
    if (id) {
      doc._id = id
      ops.push({
        updateOne: {
          filter: { _id: id },
          update: { $set: doc },
          upsert: true,
        },
      })
    } else {
      ops.push({ insertOne: { document: doc } })
    }
  }

  // Chunk bulk writes (max ~1000)
  let upserted = 0
  let modified = 0
  const chunkSize = 500
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize)
    const result = await col.bulkWrite(chunk, { ordered: false })
    upserted += result.upsertedCount || 0
    modified += result.modifiedCount || 0
  }
  return { name, upserted, modified, total: rows.length }
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'sacone'

  if (!uri) {
    console.error('[mongo] Set MONGODB_URI in .env or sacone-api/.env')
    console.error('Example: MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net')
    process.exit(1)
  }

  if (!fs.existsSync(JSON_EXPORT)) {
    console.error(`[mongo] Missing ${JSON_EXPORT}`)
    console.error('Run: npm run db:sqlite && npm run db:sqlite:json')
    process.exit(1)
  }

  const payload = JSON.parse(fs.readFileSync(JSON_EXPORT, 'utf8'))
  const tables = payload.tables || {}
  console.log(
    `[mongo] Pushing ${Object.keys(tables).length} collections → db "${dbName}"`
  )

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)

    // Meta collection
    await db.collection('_sacone_export_meta').updateOne(
      { _id: 'latest' },
      {
        $set: {
          _id: 'latest',
          exportedAt: payload.exportedAt,
          source: payload.source,
          engine: payload.engine,
          tableCount: payload.tableCount,
          pushedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    )

    for (const [table, rows] of Object.entries(tables)) {
      const result = await upsertCollection(db, table, rows)
      console.log(
        `[mongo] ${result.name}: ${result.total ?? 0} docs (upserted ${result.upserted}, modified ${result.modified})`
      )
    }

    console.log('[mongo] Done')
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('[mongo] Failed:', err.message || err)
  process.exit(1)
})
