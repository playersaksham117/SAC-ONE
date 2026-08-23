import { randomUUID } from 'crypto'
import { getDb } from './db.mjs'

function now() {
  return new Date().toISOString()
}

function getSettings() {
  const db = getDb()
  return db.prepare('SELECT * FROM app_settings WHERE id = ?').get('singleton')
}

export function validatePosApiKey(apiKey) {
  if (!apiKey) return false
  const settings = getSettings()
  return Boolean(settings?.sync_enabled && settings?.sync_api_key && settings.sync_api_key === apiKey)
}

export function handlePosPing() {
  return { ok: true, message: 'OK', service: 'sacone-erp', version: '1.0.0' }
}

export function touchLastSyncAt() {
  getDb()
    .prepare('UPDATE app_settings SET last_sync_at = ?, updated_at = ? WHERE id = ?')
    .run(now(), now(), 'singleton')
}

function findItem(line) {
  const db = getDb()
  if (line.sku) {
    const row = db
      .prepare('SELECT id, name, sku, selling_price FROM inventory_items WHERE sku = ? AND is_deleted = 0')
      .get(line.sku)
    if (row) return row
  }
  if (line.barcode) {
    const row = db
      .prepare('SELECT id, name, sku, selling_price FROM inventory_items WHERE barcode = ? AND is_deleted = 0')
      .get(line.barcode)
    if (row) return row
  }
  return null
}

function resolveWarehouseId(warehouseName) {
  const db = getDb()
  if (warehouseName) {
    const row = db
      .prepare('SELECT id FROM warehouses WHERE name = ? AND is_deleted = 0 LIMIT 1')
      .get(warehouseName)
    if (row) return row.id
  }
  const row = db.prepare('SELECT id FROM warehouses WHERE is_deleted = 0 LIMIT 1').get()
  return row?.id ?? null
}

function saleAlreadySynced(invoiceNo) {
  const db = getDb()
  const sale = db.prepare('SELECT id FROM sales WHERE invoice_no = ? LIMIT 1').get(invoiceNo)
  return Boolean(sale)
}

function transactionExistsForSaleLine(invoiceNo, sku) {
  const db = getDb()
  return Boolean(
    db.prepare('SELECT id FROM transactions WHERE transaction_no = ?').get(`OUT-POS-${invoiceNo}-${sku}`)
  )
}

function resolveSaleLocationId(itemId, warehouseId, invoiceNo) {
  const db = getDb()
  const movement = db
    .prepare(
      `SELECT location_id FROM stock_movements
       WHERE item_id = ? AND reference_id = ? AND movement_type = 'OUT'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(itemId, invoiceNo)
  if (movement?.location_id) return movement.location_id

  const cell = db
    .prepare(
      'SELECT location_id FROM stock WHERE item_id = ? AND warehouse_id = ? ORDER BY quantity DESC LIMIT 1'
    )
    .get(itemId, warehouseId)
  return cell?.location_id ?? null
}

function ensurePosOutTransaction({
  item,
  warehouseId,
  quantity,
  unitPrice,
  totalPrice,
  invoiceNo,
  notes,
}) {
  if (transactionExistsForSaleLine(invoiceNo, item.sku)) return false

  const locationId = resolveSaleLocationId(item.id, warehouseId, invoiceNo)
  if (!locationId) return false

  dbInsertTransaction({
    itemId: item.id,
    warehouseId,
    locationId,
    quantity,
    unitPrice,
    totalPrice,
    invoiceNo,
    sku: item.sku,
    notes: notes || `POS sale: ${invoiceNo}`,
  })
  return true
}

function stockEventAlreadySynced(eventUuid) {
  const db = getDb()
  const row = db
    .prepare(`SELECT id FROM stock_movements WHERE notes LIKE ? LIMIT 1`)
    .get(`%event_uuid:${eventUuid}%`)
  return Boolean(row)
}

function deductStock(itemId, quantity, warehouseId, reference, notes) {
  const db = getDb()
  const cell = db
    .prepare(
      'SELECT * FROM stock WHERE item_id = ? AND warehouse_id = ? ORDER BY quantity DESC LIMIT 1'
    )
    .get(itemId, warehouseId)

  if (!cell) throw new Error('No stock record for item in warehouse')

  const available = Number(cell.quantity)
  if (quantity > available) {
    throw new Error(`Insufficient stock (${available} available, ${quantity} requested)`)
  }

  db.prepare('UPDATE stock SET quantity = ?, updated_at = ? WHERE id = ?').run(
    available - quantity,
    now(),
    cell.id
  )

  db.prepare(
    `INSERT INTO stock_movements (id, item_id, warehouse_id, location_id, movement_type, quantity, reference_id, notes, created_at)
     VALUES (?, ?, ?, ?, 'OUT', ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    itemId,
    warehouseId,
    cell.location_id,
    quantity,
    reference,
    notes,
    now()
  )

  return cell.location_id
}

function addStock(itemId, quantity, warehouseId, reference, notes) {
  const db = getDb()
  const cell = db
    .prepare(
      'SELECT * FROM stock WHERE item_id = ? AND warehouse_id = ? ORDER BY quantity DESC LIMIT 1'
    )
    .get(itemId, warehouseId)

  if (!cell) throw new Error('No stock record for item in warehouse')

  db.prepare('UPDATE stock SET quantity = ?, updated_at = ? WHERE id = ?').run(
    Number(cell.quantity) + quantity,
    now(),
    cell.id
  )

  db.prepare(
    `INSERT INTO stock_movements (id, item_id, warehouse_id, location_id, movement_type, quantity, reference_id, notes, created_at)
     VALUES (?, ?, ?, ?, 'IN', ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    itemId,
    warehouseId,
    cell.location_id,
    quantity,
    reference,
    notes,
    now()
  )

  return cell.location_id
}

export function processStockEvents(events) {
  let processed = 0
  let skipped = 0

  for (const event of events) {
    const eventUuid = event.event_uuid
    if (!eventUuid) continue
    if (stockEventAlreadySynced(eventUuid)) {
      skipped++
      continue
    }

    const item = findItem(event)
    if (!item) throw new Error(`Item not found: ${event.sku || event.barcode}`)

    const warehouseId = resolveWarehouseId(event.warehouse)
    if (!warehouseId) throw new Error('No warehouse available for POS sync')

    const quantity = Math.abs(Number(event.quantity_change || 0))
    if (quantity <= 0) {
      skipped++
      continue
    }

    const reference = event.reference_number || eventUuid
    const notes = `POS event_uuid:${eventUuid} type:${event.event_type}`
    const eventType = String(event.event_type || '').toUpperCase()

    if (eventType === 'SALE') {
      deductStock(item.id, quantity, warehouseId, reference, notes)
      const unitPrice = Number(item.selling_price) || 0
      ensurePosOutTransaction({
        item,
        warehouseId,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        invoiceNo: reference,
        notes: `POS sale: ${reference}`,
      })
      processed++
      continue
    }

    if (eventType === 'RETURN') {
      addStock(item.id, quantity, warehouseId, reference, notes)
      processed++
      continue
    }

    skipped++
  }

  return { processed, skipped }
}

export function processPosSale(sale, options = {}) {
  const skipStockDeduction = options.skipStockDeduction ?? false

  if (!sale.invoice_no || !sale.items?.length) {
    throw new Error('Sale must include invoice_no and items')
  }

  if (saleAlreadySynced(sale.invoice_no)) {
    return { skipped: true, invoice_no: sale.invoice_no, linesProcessed: 0 }
  }

  const warehouseId = resolveWarehouseId(sale.warehouse)
  if (!warehouseId) throw new Error('No warehouse available for POS sync')

  let subtotal = Number(sale.subtotal) || 0
  let hasSubtotal = subtotal > 0
  const saleLines = []

  for (const line of sale.items) {
    const item = findItem(line)
    if (!item) throw new Error(`Item not found: ${line.sku || line.barcode}`)

    const unitPrice = line.unit_price ?? Number(item.selling_price) ?? 0
    const totalPrice = unitPrice * line.quantity
    if (!hasSubtotal) subtotal += totalPrice

    if (!skipStockDeduction) {
      const locationId = deductStock(
        item.id,
        line.quantity,
        warehouseId,
        sale.invoice_no,
        `POS push: ${sale.invoice_no}`
      )

      dbInsertTransaction({
        itemId: item.id,
        warehouseId,
        locationId,
        quantity: line.quantity,
        unitPrice,
        totalPrice,
        invoiceNo: sale.invoice_no,
        sku: item.sku,
        notes: `POS sale: ${sale.invoice_no}`,
      })
    } else {
      ensurePosOutTransaction({
        item,
        warehouseId,
        quantity: line.quantity,
        unitPrice,
        totalPrice,
        invoiceNo: sale.invoice_no,
        notes: `POS sale sync: ${sale.invoice_no}`,
      })
    }

    saleLines.push({
      item_id: item.id,
      item_name: item.name,
      quantity: line.quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    })
  }

  const taxAmount = Number(sale.tax_amount) || subtotal * 0.18
  const totalAmount = Number(sale.total_amount) || subtotal + taxAmount
  const amountPaid = Number(sale.paid_amount ?? sale.amount_paid) || totalAmount
  const paymentMethod = sale.payment_method || 'CASH'
  const saleId = randomUUID()
  const db = getDb()

  db.prepare(
    `INSERT INTO sales (id, invoice_no, sale_date, subtotal, tax_amount, total_amount, amount_paid, payment_method, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)`
  ).run(
    saleId,
    sale.invoice_no,
    sale.sale_date || now(),
    subtotal,
    taxAmount,
    totalAmount,
    amountPaid,
    paymentMethod,
    now()
  )

  for (const line of saleLines) {
    db.prepare(
      `INSERT INTO sale_items (id, sale_id, item_id, item_name, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), saleId, line.item_id, line.item_name, line.quantity, line.unit_price, line.total_price)
  }

  return { skipped: false, invoice_no: sale.invoice_no, linesProcessed: saleLines.length }
}

function dbInsertTransaction({
  itemId,
  warehouseId,
  locationId,
  quantity,
  unitPrice,
  totalPrice,
  invoiceNo,
  sku,
  notes,
}) {
  const db = getDb()
  db.prepare(
    `INSERT INTO transactions (id, transaction_no, type, item_id, warehouse_id, location_id, quantity, unit_price, total_price, reference, notes, created_at)
     VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    `OUT-POS-${invoiceNo}-${sku}`,
    itemId,
    warehouseId,
    locationId,
    quantity,
    unitPrice,
    totalPrice,
    invoiceNo,
    notes || `POS sale: ${invoiceNo}`,
    now()
  )
}

function getItemStockTotal(itemId) {
  const db = getDb()
  const row = db
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE item_id = ?')
    .get(itemId)
  return Number(row?.total || 0)
}

export function downloadProducts({ since, page = 1, limit = 100 }) {
  const db = getDb()
  const offset = (Math.max(page, 1) - 1) * limit
  const sinceIso = since || '1970-01-01T00:00:00.000Z'

  const rows = db
    .prepare(
      `SELECT id, name, sku, barcode, category, brand, unit, hsn, tax_rate, selling_price, is_active, updated_at
       FROM inventory_items
       WHERE is_deleted = 0 AND updated_at >= ?
       ORDER BY updated_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(sinceIso, limit + 1, offset)

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows

  const products = items.map((item) => {
    const stock = getItemStockTotal(item.id)
    return {
      uuid: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      category: item.category,
      brand: item.brand,
      unit: item.unit || 'piece',
      hsn: item.hsn,
      gst_rate: Number(item.tax_rate || 0),
      selling_price: Number(item.selling_price || 0),
      wholesale_price: Number(item.selling_price || 0),
      current_stock: stock,
      reserved_stock: 0,
      available_stock: stock,
      is_active: Boolean(item.is_active),
      updated_at: item.updated_at || now(),
    }
  })

  return { products, has_more: hasMore, page, count: products.length }
}

export function pendingProductCount(since) {
  const db = getDb()
  const sinceIso = since || '1970-01-01T00:00:00.000Z'
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM inventory_items WHERE is_deleted = 0 AND updated_at >= ?`
    )
    .get(sinceIso)
  return { count: Number(row?.count || 0) }
}

export function acknowledgeProducts(uuids) {
  return { ok: true, message: 'Acknowledged', count: (uuids || []).length }
}

export function importPosPayload(payload, options = {}) {
  const skipStockDeduction = options.skipStockDeduction ?? false
  let salesSynced = 0
  let salesSkipped = 0
  let productsMerged = 0

  if (payload.products?.length) {
    for (const prod of payload.products) {
      if (!prod.sku && !prod.name) continue
      const db = getDb()
      db.prepare(
        `INSERT INTO inventory_items (id, name, sku, category, unit, cost_price, selling_price, barcode, is_active, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
         ON CONFLICT(sku) DO UPDATE SET
           name = excluded.name,
           category = excluded.category,
           unit = excluded.unit,
           cost_price = excluded.cost_price,
           selling_price = excluded.selling_price,
           barcode = excluded.barcode,
           updated_at = excluded.updated_at`
      ).run(
        prod.uuid || randomUUID(),
        prod.name,
        prod.sku,
        prod.category || 'General',
        prod.unit || 'pieces',
        prod.cost_price || prod.cost || 0,
        prod.selling_price || prod.price || 0,
        prod.barcode || null,
        now(),
        now()
      )
      productsMerged++
    }
  }

  if (payload.sales?.length) {
    for (const sale of payload.sales) {
      const result = processPosSale(sale, { skipStockDeduction })
      if (result.skipped) salesSkipped++
      else salesSynced++
    }
  }

  return { salesSynced, salesSkipped, productsMerged }
}

export function handlePosSyncRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid JSON body')
  }

  if (body.ping) {
    return handlePosPing()
  }

  if (body.sale) {
    const result = processPosSale(body.sale)
    if (!result.skipped) touchLastSyncAt()
    return { ok: true, ...result }
  }

  const result = importPosPayload(body)
  if (result.salesSynced > 0 || result.salesSkipped > 0) touchLastSyncAt()
  return { ok: true, ...result }
}
