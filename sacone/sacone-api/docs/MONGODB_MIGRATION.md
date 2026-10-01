> **Superseded.** Use `npm run cloud:export` (see [CLOUD_LINK.md](CLOUD_LINK.md)): it copies every
> table, verifies each row field by field, and also moves auth/RBAC to Supabase. The JSON pipeline
> below covers 15 datasets only and is kept for reference.

# SACONE MongoDB Migration (SQLite → JSON → MongoDB)

**Runtime default:** `DATABASE_DRIVER=sqlite` (system of record).  
**Do not** switch the live app to Mongo until dual-read verification and full Mongo repositories are complete.

## Pipeline

```
SQLite (SoR)
    → Phase 10 JSON export  (data/exports/EXP-#####/)
        → Dry-run validate
            → JSON → Mongo write import (optional)
                → Dual-read verification (manual)
                    → Future: DATABASE_DRIVER=mongodb
```

| Step | How |
|------|-----|
| 1. Export | Admin → **Data Export**, or `npm run export:json -- --complete` |
| 2. Dry-run | Admin → **Mongo Migration**, or `npm run migrate:dry-run -- --export EXP-00001` |
| 3. Write | Set `MONGODB_URI` + `MONGODB_WRITE_ENABLED=true`, then import with `--write` |
| 4. Cutover | Only after Mongo repos are implemented and verified |

## Configuration (`.env`)

```env
DATABASE_DRIVER=sqlite
EXPORT_DIR=./data/exports

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=sacone
MONGODB_WRITE_ENABLED=false   # set true only for write imports
```

## CLI

```bash
# From sacone/ or sacone-api/
npm run export:json -- --complete
npm run migrate:dry-run -- --export EXP-00001
npm run migrate:json-to-mongo -- --export EXP-00001 --write
```

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/migration/architecture` | Status, mapping, pipeline |
| GET | `/api/migration/ping` | Mongo connectivity |
| GET | `/api/migration/logs` | Batch history |
| GET | `/api/migration/checkpoints/:batchId` | Resume checkpoints |
| POST | `/api/migration/plan` | Plan batch (no writes) |
| POST | `/api/migration/dry-run/validate` | Validate envelope body |
| POST | `/api/migration/dry-run/directory` | Validate `EXP-#####` folder |
| POST | `/api/migration/import` | `{ exportDir, dryRun, dropCollections? }` |

Permissions: `core.system_settings.view` / `.edit`.

## ID strategy

- `preserve_uuid`: Mongo `_id` = source UUID string; document also has `id`
- Foreign keys remain UUID strings
- Collisions: existing `_id` is skipped (idempotent re-import)
- User `password_hash` is **not** exported — plan password reset / re-invite after cutover

## Export datasets (complete)

company, products, customers, suppliers, warehouses, inventory_movements, stock_levels, sales, sales_items, payments, supplier_bills, supplier_payments, purchase_orders, system_settings, users

## Source layout

| Area | Path |
|------|------|
| Export datasets | `src/core/export-datasets.js` |
| Mapping | `src/migration/mapping.js` |
| Validation | `src/migration/validate.js` |
| Importer | `src/migration/importer.js` |
| Mongo connection | `src/database/mongo.js` |
| Service | `src/services/migration-provision.js` |
| ERP UI | `/admin/migration` |

## Rollback

1. SQLite remains SoR until cutover.
2. Keep every `EXP-#####` JSON snapshot.
3. Failed Mongo import → mark batch failed; do **not** alter SQLite.
4. Drop/quarantine Mongo collections for that batch only if needed.
5. Never set `DATABASE_DRIVER=mongodb` until repository implementations exist for the full app.

## Explicit non-goals (current)

- Live dual-write between SQLite and Mongo
- Full Mongo repository implementations for ERP runtime
- Automatic password migration for users
