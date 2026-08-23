import { randomUUID } from 'crypto'
import {
  getDb,
  normalizeRow,
  normalizeRows,
  normalizeValue,
  tableHasColumn,
  TABLE_RELATIONS,
} from './db.mjs'
import { checkQueryPermission } from './rbacEngine.mjs'

function parseSelect(selectStr) {
  const embeds = []
  let remaining = selectStr.trim()

  const embedRegex = /(\w+)\s*\(([^)]+)\)/g
  let match
  while ((match = embedRegex.exec(selectStr)) !== null) {
    embeds.push({
      table: match[1],
      columns: match[2].split(',').map((c) => c.trim()).filter(Boolean),
    })
    remaining = remaining.replace(match[0], '')
  }

  const columns = remaining
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  if (columns.length === 0 && embeds.length > 0) {
    return { columns: ['*'], embeds }
  }

  return { columns: columns.length ? columns : ['*'], embeds }
}

function buildWhere(filters) {
  const clauses = []
  const params = []

  for (const filter of filters) {
    // Local engine does not support PostgREST embedded filters (e.g. sales.sale_date)
    if (filter.column && String(filter.column).includes('.')) {
      continue
    }

    switch (filter.op) {
      case 'eq':
        clauses.push(`${filter.column} = ?`)
        params.push(normalizeValue(filter.value))
        break
      case 'neq':
        clauses.push(`${filter.column} != ?`)
        params.push(normalizeValue(filter.value))
        break
      case 'gte':
        clauses.push(`${filter.column} >= ?`)
        params.push(filter.value)
        break
      case 'lte':
        clauses.push(`${filter.column} <= ?`)
        params.push(filter.value)
        break
      case 'not_is':
        if (filter.value === null) {
          clauses.push(`${filter.column} IS NOT NULL`)
        } else {
          clauses.push(`${filter.column} IS NOT ?`)
          params.push(filter.value)
        }
        break
      case 'or': {
        const orParts = []
        for (const part of filter.parts) {
          orParts.push(`${part.column} = ?`)
          params.push(normalizeValue(part.value))
        }
        if (orParts.length) clauses.push(`(${orParts.join(' OR ')})`)
        break
      }
      case 'in': {
        const values = (Array.isArray(filter.value) ? filter.value : []).filter(
          (v) => v !== undefined && v !== null && v !== ''
        )
        if (!values.length) {
          clauses.push('1=0')
          break
        }
        const placeholders = values.map(() => '?').join(', ')
        clauses.push(`${filter.column} IN (${placeholders})`)
        params.push(...values.map(normalizeValue))
        break
      }
      default:
        break
    }
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
  }
}

function projectColumns(row, columns) {
  if (columns.includes('*')) return { ...row }
  const projected = {}
  for (const col of columns) {
    projected[col] = row[col]
  }
  return projected
}

function attachEmbeds(table, rows, embeds) {
  if (!embeds.length || !rows.length) return rows

  const relations = TABLE_RELATIONS[table] || {}
  const db = getDb()

  for (const embed of embeds) {
    const fk = relations[embed.table]
    if (!fk) continue

    const ids = [...new Set(rows.map((row) => row[fk]).filter(Boolean))]
    if (!ids.length) {
      for (const row of rows) row[embed.table] = null
      continue
    }

    const placeholders = ids.map(() => '?').join(', ')
    const embedCols = embed.columns.includes('*')
      ? '*'
      : ['id', ...embed.columns.filter((c) => c !== 'id')].join(', ')

    const relatedRows = db
      .prepare(`SELECT ${embedCols} FROM ${embed.table} WHERE id IN (${placeholders})`)
      .all(...ids)

    const relatedMap = new Map(relatedRows.map((r) => [r.id, normalizeRow(r)]))

    for (const row of rows) {
      const related = relatedMap.get(row[fk]) || null
      if (related && !embed.columns.includes('*')) {
        const nested = {}
        for (const col of embed.columns) {
          nested[col] = related[col]
        }
        row[embed.table] = nested
      } else {
        row[embed.table] = related
      }
    }
  }

  return rows
}

function executeSelect(payload) {
  const db = getDb()
  const { columns, embeds } = parseSelect(payload.columns || '*')
  const { sql: whereSql, params } = buildWhere(payload.filters || [])

  if (payload.head && payload.count) {
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM ${payload.table}${whereSql}`)
      .get(...params)
    return { data: null, count: countRow.count, error: null }
  }

  let sql = `SELECT * FROM ${payload.table}${whereSql}`

  if (payload.order) {
    sql += ` ORDER BY ${payload.order.column} ${payload.order.ascending ? 'ASC' : 'DESC'}`
  }

  if (payload.limit != null) {
    sql += ` LIMIT ${Number(payload.limit)}`
  }

  let rows = normalizeRows(db.prepare(sql).all(...params))

  rows = attachEmbeds(payload.table, rows, embeds)

  if (!columns.includes('*')) {
    rows = rows.map((row) => {
      const projected = projectColumns(row, columns)
      for (const embed of embeds) {
        if (row[embed.table] !== undefined) {
          projected[embed.table] = row[embed.table]
        }
      }
      return projected
    })
  }

  if (payload.single) {
    if (rows.length === 0) {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      }
    }
    if (rows.length > 1) {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      }
    }
    return { data: rows[0], error: null }
  }

  if (payload.count) {
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM ${payload.table}${whereSql}`)
      .get(...params)
    return { data: rows, count: countRow.count, error: null }
  }

  return { data: rows, error: null }
}

function executeInsert(payload) {
  const db = getDb()
  const inputRows = Array.isArray(payload.body) ? payload.body : [payload.body]
  const rows = inputRows.map((row) => {
    const next = { ...row }
    if (!next.id) next.id = randomUUID()
    if (!next.created_at && payload.table !== 'purchase_order_items' && payload.table !== 'sale_items') {
      next.created_at = new Date().toISOString()
    }
    if (!next.updated_at && tableHasColumn(payload.table, 'updated_at')) {
      next.updated_at = new Date().toISOString()
    }
    return next
  })

  const inserted = []

  const insertOne = db.transaction((row) => {
    const keys = Object.keys(row)
    const normalized = keys.reduce((acc, key) => {
      acc[key] = normalizeValue(row[key])
      return acc
    }, {})
    const placeholders = keys.map(() => '?').join(', ')
    db.prepare(
      `INSERT INTO ${payload.table} (${keys.join(', ')}) VALUES (${placeholders})`
    ).run(...keys.map((k) => normalized[k]))

    const saved = db.prepare(`SELECT * FROM ${payload.table} WHERE id = ?`).get(row.id)
    inserted.push(normalizeRow(saved))
  })

  for (const row of rows) insertOne(row)

  if (payload.single) {
    return { data: inserted[0] || null, error: null }
  }

  return { data: inserted, error: null }
}

function executeUpdate(payload) {
  const db = getDb()
  const { sql: whereSql, params: whereParams } = buildWhere(payload.filters || [])
  const keys = Object.keys(payload.body || {})

  if (!keys.length) {
    return { data: null, error: { message: 'No fields to update' } }
  }

  const setSql = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => normalizeValue(payload.body[k]))

  db.prepare(`UPDATE ${payload.table} SET ${setSql}${whereSql}`).run(...values, ...whereParams)

  const rows = normalizeRows(
    db.prepare(`SELECT * FROM ${payload.table}${whereSql}`).all(...whereParams)
  )

  if (payload.single) {
    return { data: rows[0] || null, error: null }
  }

  return { data: rows, error: null }
}

function executeDelete(payload) {
  const db = getDb()
  const { sql: whereSql, params } = buildWhere(payload.filters || [])
  db.prepare(`DELETE FROM ${payload.table}${whereSql}`).run(...params)
  return { data: null, error: null }
}

function executeUpsert(payload) {
  const db = getDb()
  const row = { ...payload.body }
  if (!row.id) row.id = randomUUID()
  if (!row.updated_at) row.updated_at = new Date().toISOString()

  const keys = Object.keys(row)
  const normalized = keys.reduce((acc, key) => {
    acc[key] = normalizeValue(row[key])
    return acc
  }, {})

  const placeholders = keys.map(() => '?').join(', ')
  const updates = keys.filter((k) => k !== 'id').map((k) => `${k} = excluded.${k}`).join(', ')

  db.prepare(
    `INSERT INTO ${payload.table} (${keys.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}`
  ).run(...keys.map((k) => normalized[k]))

  const saved = db.prepare(`SELECT * FROM ${payload.table} WHERE id = ?`).get(row.id)
  return { data: normalizeRow(saved), error: null }
}

export function executeQuery(payload, options = {}) {
  try {
    const userId = options.userId
    if (userId && payload.op !== 'select') {
      const check = checkQueryPermission(userId, payload)
      if (!check.allowed) {
        return { data: null, error: { message: check.error, code: '42501' } }
      }
    }

    switch (payload.op) {
      case 'select':
        return executeSelect(payload)
      case 'insert':
        return executeInsert(payload)
      case 'update':
        return executeUpdate(payload)
      case 'delete':
        return executeDelete(payload)
      case 'upsert':
        return executeUpsert(payload)
      default:
        return { data: null, error: { message: `Unsupported operation: ${payload.op}` } }
    }
  } catch (error) {
    console.error('[local-pg query error]', error)
    return { data: null, error: { message: error.message || 'Database error' } }
  }
}

export function executeRpc(name, params = {}) {
  const db = getDb()

  if (name === 'increment_customer_loyalty') {
    const customerId = params.customer_id || params.p_customer_id
    const points = Number(params.points ?? params.p_points ?? 0)
    db.prepare(
      `UPDATE customers SET loyalty_points = COALESCE(loyalty_points, 0) + ? WHERE id = ?`
    ).run(points, customerId)
    return { data: null, error: null }
  }

  return { data: null, error: { message: `Unknown RPC: ${name}` } }
}
