import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** SACONE root (scripts/lib → ../..) */
export const ROOT = path.resolve(__dirname, '../..')

export const DATA_DIR = path.join(ROOT, 'data')
export const EXPORT_DIR = path.join(ROOT, 'exports')
export const MASTER_SQLITE = path.join(DATA_DIR, 'sacone.sqlite')
export const JSON_EXPORT = path.join(EXPORT_DIR, 'sacone-sqlite.json')

export const PRISMA_SQLITE = path.join(ROOT, 'sacone-api', 'prisma', 'dev.db')

export const ERP_SQLITE_SCHEMA = path.join(
  ROOT,
  'sacone-api',
  'erp',
  'sqlite',
  'schema.sql'
)

export const ERP_SQLITE_SEED = path.join(
  ROOT,
  'sacone-api',
  'erp',
  'sqlite',
  'seed.sql'
)

export const ERP_SQLITE_RBAC = path.join(
  ROOT,
  'sacone-api',
  'erp',
  'sqlite',
  'rbac_seed.sql'
)

/** Known ERP tables (pg-mem / Postgres public schema). */
export const ERP_TABLES = [
  'users',
  'app_settings',
  'product_categories',
  'warehouses',
  'storage_locations',
  'inventory_items',
  'stock',
  'stock_movements',
  'stock_adjustments',
  'transactions',
  'suppliers',
  'customer_groups',
  'customers',
  'party_contacts',
  'party_notes',
  'crm_follow_ups',
  'vendor_price_history',
  'vendor_ratings',
  'purchase_orders',
  'purchase_order_items',
  'sales',
  'sale_items',
  'ledger_entries',
  'batch_info',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'approval_requests',
  'approval_history',
  'audit_logs',
  'cash_register_sessions',
  'store_admin_users',
  'store_products',
  'store_carts',
  'store_cart_items',
  'store_orders',
  'store_order_items',
  'store_invoices',
  'store_quote_requests',
  'store_quote_items',
  'store_stock_movements',
]

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
}

export function loadEnvFiles() {
  const candidates = [
    path.join(ROOT, '.env'),
    path.join(ROOT, 'sacone-api', '.env'),
    path.join(ROOT, 'SACHIN ELECTRICALS', '.env'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}
