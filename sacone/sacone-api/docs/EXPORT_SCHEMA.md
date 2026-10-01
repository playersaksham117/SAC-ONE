# SACONE JSON Export Schema (Phase 10)

Read-only export from SQLite. **Business tables are never modified or deleted during export.**

## Envelope format

Every file uses:

```json
{
  "export_version": "1.0",
  "exported_at": "ISO_TIMESTAMP",
  "company_id": "UUID",
  "meta": {
    "import_ready": true,
    "schema": "sacone.<dataset>.v1",
    "dataset": "products",
    "datasets": ["products"],
    "record_count": 0,
    "date_from": null,
    "date_to": null,
    "uuid_relationships_preserved": true,
    "source": "sqlite",
    "read_only_export": true,
    "relationships": [],
    "notes": "Safe for import tooling. Passwords and API secrets are excluded."
  },
  "data": {}
}
```

| Field | Purpose |
|-------|---------|
| `export_version` | Envelope version (`1.0`) |
| `exported_at` | UTC ISO timestamp |
| `company_id` | Company UUID (tenant anchor) |
| `meta` | Import-ready metadata |
| `data` | Dataset payload (object of collections) |

UUIDs are preserved exactly as stored in SQLite.

## Datasets → files

| Dataset key | File | Date range? | `data` keys |
|-------------|------|-------------|-------------|
| `company` | `company.json` | No | `companies` |
| `products` | `products.json` | No | `categories`, `brands`, `units`, `products` |
| `customers` | `customers.json` | No | `customers` |
| `suppliers` | `suppliers.json` | No | `suppliers` |
| `warehouses` | `warehouses.json` | No | `warehouses`, `warehouse_locations` |
| `inventory_movements` | `inventory_movements.json` | Yes (`created_at`) | `inventory_movements` |
| `stock_levels` | `stock_levels.json` | No | `stock_levels`, `location_stock_levels` |
| `sales` | `sales.json` | Yes (`created_at`) | `sales` (from `pos_sales`) |
| `sales_items` | `sales_items.json` | Yes (via sale) | `sales_items` (from `pos_sale_items`) |
| `payments` | `payments.json` | Yes (`created_at`) | `payments` (from `pos_payments`) |
| `supplier_bills` | `supplier_bills.json` | Yes (`bill_date`) | `supplier_bills`, `supplier_bill_items` |
| `supplier_payments` | `supplier_payments.json` | Yes (`payment_date`) | `supplier_payments` |
| `purchase_orders` | `purchase_orders.json` | Yes (`order_date`) | `purchase_orders`, `purchase_order_items` |
| `system_settings` | `system_settings.json` | No | `system_settings` (no secrets) |
| `users` | `users.json` | No | `roles`, `users` (**no** `password_hash`) |
| complete | `complete_system.json` + all above | Optional on dated sets | All keys combined |

CLI: `npm run export:json -- --complete`  
Mongo import docs: `docs/MONGODB_MIGRATION.md`

## Excluded secrets

Never exported:

- `users.password_hash`
- Session tokens
- API key raw secrets / `key_hash`
- Any field matching secret heuristics in validation

## Relationships (UUID)

- `products.category_id` → `categories.id`
- `products.brand_id` → `brands.id`
- `products.unit_id` → `units.id`
- `warehouse_locations.warehouse_id` → `warehouses.id`
- `warehouse_locations.parent_id` → `warehouse_locations.id`
- `inventory_movements.product_id` → `products.id`
- `inventory_movements.warehouse_id` → `warehouses.id`
- `sales.customer_id` → `customers.id`
- `sales.warehouse_id` → `warehouses.id`
- `sales_items.sale_id` → `sales.id` / `pos_sales.id`
- `sales_items.product_id` → `products.id`
- `payments.sale_id` → `sales.id`
- `users.role_id` → `roles.id`

## API

Base: `/api/exports` (session auth)  
Permissions: `core.data_export.view`, `core.data_export.create`

| Method | Endpoint | Body / notes |
|--------|----------|--------------|
| `GET` | `/datasets` | List dataset definitions |
| `GET` | `/logs` | Export history |
| `GET` | `/:id` | Export job detail |
| `POST` | `/` | `{ "datasets": ["products"], "dateFrom", "dateTo" }` or `{ "complete": true }` |
| `GET` | `/:id/files/:filename` | Download JSON file |

## Validation

Before write completes, each envelope is:

1. Serialized and re-parsed as JSON  
2. Checked for required envelope fields  
3. Scanned for forbidden secret tokens  
4. Logged in `export_logs` with `validation_ok`

## Output location

`sacone-api/data/exports/{EXP-#####}/`
