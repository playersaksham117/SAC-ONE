# SACONE

Modular Business Management System — Phase 1: Core System & RBAC.

## Structure

```
sacone/
├── sacone-api/     # Express + SQLite API (repository pattern)            → :4000 (LAN)
├── sacone-erp/     # Next.js ERP web app (responsive, phone → desktop)      → :3000
├── sacone-owner/   # SACONE Owner web app: CEO Dashboard + Income & Expense → :3001
├── sac-pos/        # SAC-POS: Expo / React Native mobile POS: the ONLY place POS billing happens
├── local-server/   # local-domain gateway (erp./owner./api.sacone.local) + hosts-file script
└── start-all.bat   # starts API + ERP + Owner + gateway + SAC-POS
```

```
 SAC-POS (phone, offline store)
        │  /api/v1/sync  (device key, idempotent inbox, erp_user_id attribution)
        ▼
 sacone-api  ──►  services ──► repositories ──► SQLite (Mongo-ready)
        ▲
        │  /api/*  (session token, RBAC)
 sacone-erp (Next.js :3000)   sacone-owner (Next.js :3001)
```

See **ARCHITECTURE.md** for layering rules and roadmap, and **sac-pos/README.md** for the mobile app.

## Quick Start (local server)

```bash
# From sacone/
npm run install:all
npm run db:setup     # real data only: no sample products, parties or keys
npm run dev          # API + ERP + Owner + local-domain gateway
```

- **ERP UI:** http://erp.sacone.local (or http://localhost:3000)
- **Owner app:** http://owner.sacone.local (or http://localhost:3001; CEO Dashboard, Income & Expense, same login)
- **API:** http://api.sacone.local (or http://localhost:4000)
- **SAC-POS:** `npm run dev:pos` → scan the QR code with Expo Go (see `sac-pos/README.md`)

The `*.sacone.local` names need a one-time hosts entry. See **local-server/README.md**.

## Local server, real time, cloud link

| Topic | Where |
|-------|-------|
| This PC as the server: SQLite, local domain, LAN phones | `local-server/README.md` |
| Real-time data: every write is pushed to ERP/Owner screens (SSE) and SAC-POS phones (long-poll) | `local-server/README.md` |
| Moving to MongoDB (data) + Supabase (auth/RBAC) without data loss: `npm run cloud:export` | `sacone-api/docs/CLOUD_LINK.md` |

The cloud export is server-side only. The ERP no longer shows the Data Export / Mongo Migration screens.

## Default Login

| Field    | Value                |
|----------|----------------------|
| Email    | admin@sacone.local   |
| Password | Admin@123            |

Only the admin exists on a fresh database. Create staff logins (e.g. a cashier for SAC-POS) in **ERP → Administration → Users**.
The demo cashier `cashier@sacone.local` / `Cashier@123` exists only when the database was set up with `SEED_DEMO_DATA=true`.

## Phase 1 Features

- Authentication (login, logout, session tokens)
- Company setup (profile, GST, contact)
- User management (CRUD, activate/deactivate, role assignment)
- RBAC (8 default roles + custom roles with permission checkboxes)
- Audit log (all core actions tracked)

## Phase 2 Features

- ERP Home with Operations / Business / Administration cards
- Permission-filtered navigation from a single config

## Phase 3 Features

- Central Product Master (single products table for all modules)
- Categories, Brands, Units lookup management
- Product/barcode/SKU search with SKU uniqueness validation
- CSV import and export
- Audit logging for create, update, price change, and deactivation

## Phase 4 Features

- Inventory Movement Engine (source of truth for stock)
- Movement ledger with standard movement types
- Derived stock_levels cache (never updated outside the engine)
- Stock views by product and warehouse
- Stock adjustment approval workflow
- Negative stock validation
- Default warehouse DB support (warehouse UI deferred)

## Phase 5 Features

- Warehouse hierarchy: Warehouse → Zone → Rack → Shelf/Bin/Cell
- Warehouse CRUD with activate/deactivate
- Location codes and QR generate/scan
- Warehouse stock, location stock, and occupancy views
- Internal transfers via movement engine only (`transfer_out` → `transfer_in`)
- Transfer approval workflow and history
- Stock counts with variance posted as adjustments
- Role restrictions: Warehouse Staff / Warehouse Manager / Owner-Admin

## Phase 6 Features

- Fast POS terminal (product / SKU / barcode search, cart, discounts, GST)
- Walk-in and registered customers with outstanding balance
- Payments: cash, UPI, bank, credit, and split
- Hold / resume bills, invoice + printable receipt
- Sales returns restock via `sales_return` movements
- Stock reduced only via `pos_sale` inventory movements
- Negative stock controlled by system setting `allow_negative_stock`
- Cashier role: POS only (no adjustments, CEO dashboard, or administration)
- Sample scenarios: `sacone-api/scripts/test-pos-scenarios.js`

## Phase 7 Features

- Single customer master (shared by POS and future web store — no duplicate tables)
- Customer CRUD: ID, name, phone, email, GST, address, credit limit, outstanding, status, notes
- Customer views: sales, invoices, payments, outstanding, statement
- Supplier master: contact, GST, address, payment terms, outstanding payable
- Supplier views: purchase history, payments, payable, statement
- Clean APIs: `GET /api/customers/lookup`, `POST /api/customers`

## Phase 8 Features

- Separate CEO Dashboard (not the operational Home) — executive decision view
- Live aggregates from POS, purchases, inventory, payments (no duplicate fact tables)
- KPI cards with previous-period comparison: sales, profit, cash/UPI/bank, AR/AP, inventory, cash flow
- Charts: sales vs purchases vs profit; daily cash & UPI flows; inventory value pies
- Profitability per invoice, aging buckets with drill-down, business health score, alert center
- Filters: Today → FY, custom range, warehouse, salesperson, category, brand, firm (reserved)
- Near-real-time poll (configurable `ceo.refresh_seconds`)
- Permission `reports.ceo_dashboard.view` — Owner/Admin & Accountant; Manager only if granted
- Docs: `sacone-api/docs/CEO_DASHBOARD.md`

## Phase 9 Features

- Web Store Integration APIs (not a full ecommerce backend)
- API key auth (`X-API-Key`) with scoped access + request logs
- Products (web-published only), inventory stock status, customer search/create/update on the same master
- Future order provision contract (`POST /orders/provision`) — no stock reservation yet
- Docs: `sacone-api/docs/WEBSTORE_API.md`
- Admin: `/admin/api-keys` for key management

## Phase 10 Features

- Safe SQLite → JSON export (read-only; never modifies business data)
- Separate files: products, customers, suppliers, warehouses, inventory_movements, sales, sales_items, payments, users
- Complete system export + import-ready metadata
- Date-range filters for movements/sales/payments
- JSON validation + export logs; passwords/secrets excluded
- Docs: `sacone-api/docs/EXPORT_SCHEMA.md`
- Admin: `/admin/exports`

## Phase 11 Features

- Future MongoDB migration **provision only** (superseded by the verified cloud link: `sacone-api/docs/CLOUD_LINK.md`)
- Repository factory: Application → Service → contracts → SQLite (active) / Mongo stubs (future)
- Mapping, ID preserve (`preserve_uuid`), dry-run validation, migration log/checkpoint tables
- Docs: `sacone-api/docs/MONGODB_MIGRATION.md`
- APIs: `GET /api/migration/architecture`, `POST /api/migration/plan`, `POST /api/migration/dry-run/validate`
- Keep `DATABASE_DRIVER=sqlite` (default)

## Phase 12 Features — POS ↔ ERP integration

- `/api/v1/sync/*` device-sync API for POS terminals (used by SAC-POS)
- Per-device sync keys bound to one install, warehouse and invoice prefix (`POS1-INV-0012`)
- Idempotent sync inbox — retries never double-post invoices, payments or stock
- Sales → POS invoices + `pos_sale` movements; returns → `sales_return`; payments → draft receipts
- Offline reality wins: negative stock / credit-limit breaches become warnings, not rejections
- Product/price/stock and POS PIN users pulled incrementally with server-time cursors
- ERP **POS Devices & Sync** page: devices, PIN users, sync inbox (retry / approve / reject)
- ERP shell is now mobile-responsive (drawer navigation on phones)
- Docs: `sacone-api/docs/POS_SYNC_API.md` · Test: `npm run test:pos-sync`

## Phase 13 Features: SAC-POS mobile app

- `sac-pos/`: Expo SDK 57 / React Native / TypeScript app that replaces the legacy Flutter POS, GST Billing and SpendSight apps
- Staff sign in with their ERP login, then use a PIN for offline unlock. Screens and actions are gated by the ERP role permissions
- Pulls products, prices, GST, warehouse stock and customers; pushes sales, returns, due collections and new customers
- Offline-first with an automatic, idempotent sync; tax engine parity-tested against the server
- API additions: `GET /api/v1/sync/customers`, `GET /api/v1/sync/staff`, and `erp_user_id` attribution with a server-side permission re-check
- Tests: `npm run test:sac-pos` (app) · `npm run test:pos-sync` (API, 27 checks)

## Phase 14: App split

| App | For | Contains |
|-----|-----|----------|
| **SAC-POS** (mobile) | Counter staff | All POS billing, returns, collections. The ERP web POS page was removed. |
| **SACONE ERP** (web, :3000) | Office staff | Operations, parties, **Banking & Cash** (cash/bank/UPI books, bank import, party payments, accounts), commissions, HR, reports hub, admin |
| **SACONE Owner** (web, :3001) | Owner / CEO | **CEO Dashboard** and **Income & Expense** (transactions, approval, summary, categories) |

- Owner access needs `reports.ceo_dashboard.view` and/or `finance.ledger.view`; other roles see "No owner access".
- The API allows the Owner origin via `OWNER_APP_ORIGIN` (default `http://localhost:3001`).
- Old links `/operations/pos` and `/business/ceo-dashboard` in the ERP now explain or redirect.

## Architecture Notes

- Default driver SQLite via `better-sqlite3`; services use `repos` from `sacone-api/src/repositories/index.js`
- Contracts in `repositories/contracts.js` define the migration-ready surface
- Business logic in services — not coupled to SQLite APIs directly
- UUIDs for all primary keys (preserved for future Mongo `_id`)
- Permission keys: `{module}.{feature}.{action}` (view, create, edit, delete, approve)
- Stock changes only via `InventoryMovementService` — never direct quantity writes
