/**
 * PostgreSQL pool with pg-mem-compatible prepare/exec API for queryEngine.
 */
import pg from 'pg'

function toPgPlaceholders(sql) {
  let n = 0
  return sql.replace(/\?/g, () => `$${++n}`)
}

export async function createPgPool(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 20 })
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }
  return pool
}

/** Blocking sync compat — queryEngine.mjs uses synchronous .get/.all */
export function createPgCompatBlocking(pool) {
  const pending = new Map()
  let reqId = 0

  function syncQuery(pgSql, params) {
    const id = ++reqId
    pool
      .query(pgSql, params)
      .then((result) => {
        pending.set(id, { ok: true, result })
      })
      .catch((err) => {
        pending.set(id, { ok: false, err })
      })

    const start = Date.now()
    while (!pending.has(id)) {
      if (Date.now() - start > 30000) throw new Error('PostgreSQL query timeout')
    }
    const out = pending.get(id)
    pending.delete(id)
    if (!out.ok) throw out.err
    return out.result
  }

  return {
    prepare(sql) {
      const pgSql = toPgPlaceholders(sql)
      return {
        all(...params) {
          const result = syncQuery(pgSql, params)
          return result.rows || []
        },
        get(...params) {
          const result = syncQuery(pgSql, params)
          return (result.rows && result.rows[0]) || undefined
        },
        run(...params) {
          const result = syncQuery(pgSql, params)
          return { changes: result.rowCount ?? 0, lastInsertRowid: null }
        },
      }
    },
    exec(sql) {
      for (const stmt of sql.split(';').filter((s) => s.trim())) {
        syncQuery(stmt, [])
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
