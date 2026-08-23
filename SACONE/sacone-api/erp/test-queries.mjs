import { getDb } from './db.mjs'
import { executeQuery, executeRpc } from './queryEngine.mjs'

function assert(label, condition, detail = '') {
  if (!condition) {
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
    return false
  }
  console.log(`OK: ${label}`)
  return true
}

getDb()

const tests = [
  () => {
    const r = executeQuery({
      table: 'inventory_items',
      op: 'select',
      columns: '*',
      filters: [{ op: 'eq', column: 'is_deleted', value: false }],
    })
    return assert('inventory list', !r.error && Array.isArray(r.data) && r.data.length >= 10)
  },
  () => {
    const r = executeQuery({
      table: 'inventory_items',
      op: 'select',
      columns: '*',
      filters: [{ op: 'eq', column: 'is_deleted', value: false }],
      count: true,
      head: true,
    })
    return assert('inventory count head', !r.error && r.count >= 10)
  },
  () => {
    const r = executeQuery({
      table: 'app_settings',
      op: 'select',
      columns: '*',
      filters: [{ op: 'eq', column: 'id', value: 'singleton' }],
      single: true,
    })
    return assert('app settings single', !r.error && r.data?.id === 'singleton')
  },
  () => {
    const r = executeQuery({
      table: 'stock',
      op: 'select',
      columns: 'quantity',
      filters: [
        { op: 'eq', column: 'item_id', value: 'missing-item' },
        { op: 'eq', column: 'warehouse_id', value: 'wh-main' },
        { op: 'eq', column: 'location_id', value: 'loc-a1' },
      ],
      single: true,
    })
    return assert('missing stock single PGRST116', r.error?.code === 'PGRST116' && r.data === null)
  },
  () => {
    const r = executeQuery({
      table: 'stock_movements',
      op: 'select',
      columns: `
        id,
        movement_type,
        quantity,
        created_at,
        inventory_items (name, sku),
        warehouses (name)
      `,
      order: { column: 'created_at', ascending: false },
      limit: 5,
    })
    return assert('movements with embeds', !r.error && r.data[0]?.inventory_items?.name)
  },
  () => {
    const r = executeQuery({
      table: 'purchase_orders',
      op: 'insert',
      body: {
        po_number: `PO-TEST-${Date.now()}`,
        supplier_id: 'sup-001',
        status: 'SENT',
        order_date: new Date().toISOString().slice(0, 10),
        subtotal: 100,
        tax_amount: 18,
        total_amount: 118,
        created_by: 'dev-test-user',
      },
      single: true,
    })
    return assert('insert PO returning row', !r.error && r.data?.id)
  },
  () => {
    const r = executeQuery({
      table: 'inventory_items',
      op: 'select',
      columns: '*',
      filters: [{ op: 'or', parts: [{ column: 'barcode', value: '8901001001001' }, { column: 'sku', value: 'SKU-BOLT-M8' }] }],
      single: true,
    })
    return assert('scanner OR lookup', !r.error && r.data?.sku === 'SKU-BOLT-M8')
  },
  () => {
    const r = executeRpc('increment_customer_loyalty', { customer_id: 'cus-001', points: 5 })
    return assert('loyalty RPC', !r.error)
  },
  () => {
    const r = executeQuery({
      table: 'app_settings',
      op: 'upsert',
      body: {
        id: 'singleton',
        company_name: 'SACONE Demo Co.',
        updated_at: new Date().toISOString(),
      },
    })
    return assert('settings upsert', !r.error && r.data?.id === 'singleton')
  },
]

for (const test of tests) test()

if (process.exitCode) {
  console.error('\nSome demo DB checks failed.')
} else {
  console.log('\nAll demo DB checks passed.')
}
