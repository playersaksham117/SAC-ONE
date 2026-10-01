# SACONE / BillEase Suite — Architecture & Code Audit

_Last reviewed: 28 Sep 2026_

## 1. System at a glance

| App | Stack | Role | Runs on |
|-----|-------|------|---------|
| `sacone-api` | Node 20+ · Express 4 · better-sqlite3 (Mongo-ready repos) | System of record: products, stock engine, POS, parties, finance, HR, approvals | Server / shop PC (`:4000`) |
| `sacone-erp` | Next.js 14 (App Router) · Tailwind · Recharts | Back-office web app | Any browser — desktop, tablet, phone |
| `sacone-owner` | Next.js 14 · Tailwind · Recharts | Owner app: CEO Dashboard + Income & Expense | Any browser (`:3001`) |
| `sac-pos` | Expo SDK 57 · React Native 0.86 · TypeScript · zustand + AsyncStorage | Offline-first mobile POS (the only POS) | Android · iOS · web |

The legacy Flutter POS (`billease pos/`), GST Billing (`desktop-apps/`) and SpendSight (`mobile-apps/`) were retired in favour of SAC-POS.

```
┌────────────────────────────┐       /api/v1/sync (device key)        ┌──────────────────────────────┐
│ SAC-POS (Expo)             │ ─ push sales/returns/payments/cust ──▶ │ sacone-api                   │
│  offline store, ERP login  │ ◀─ pull products/stock/customers ───── │  routes → services → repos   │
│  + PIN, RBAC from ERP role │ ◀─ staff status (role, permissions) ── │  inventory movement engine   │
└────────────────────────────┘                                        │  pos_sync_inbox (idempotent) │
                                                                      └──────────────▲───────────────┘
                                    /api/* (session token + RBAC)                    │
                                   ┌─────────────────────────────────────────────────┘
                                   │ sacone-erp (Next.js :3000)  ·  sacone-owner (Next.js :3001, CEO + Income & Expense)
```

## 2. What was wrong (audit findings)

### 2.1 Integration — **critical**
- The POS pushed to `/api/v1/sync/*`, but **sacone-api had no such endpoints** — POS and ERP were not connected at all.
- The POS sent both `sales` **and** `SALE` stock events; any server applying both would **double-deduct stock**.
- On a failed push the POS queued the batch **and** left rows unsynced → the same sales were sent twice on recovery (duplicate invoices on a non-idempotent server).
- Pull cursors used the **terminal clock** and advanced even when a page failed → silently skipped product updates.
- Sale timestamps were sent as local time without an offset.

### 2.2 sacone-api
| Finding | Severity | Status |
|---------|----------|--------|
| `index.js` hand-wired 35 routers + app + listener in one file (untestable) | Medium | **Fixed** → `app.js` (factory) + `routes/registry.js` (single mount table) + thin `index.js` |
| CORS single origin; server bound to localhost only; 100 kb JSON limit | Medium | **Fixed** → `CORS_ORIGIN` list, `HOST=0.0.0.0`, `JSON_BODY_LIMIT` |
| `PosService.checkout` rejects offline sales for stock/credit | High for sync | **Fixed** → `offlineSync` option records + warns |
| Two different `WarehouseRepository` classes (`sqlite/inventory.js`, `sqlite/warehouse.js`) | Medium | Open — merge into `warehouse.js` |
| `checkout()` / `createReturn()` not wrapped in one DB transaction (partial writes possible on crash) | Medium | Sync path now wraps each record in a transaction; wrap the ERP terminal path the same way |
| No request validation layer (ad-hoc checks in services) | Medium | Open — add zod schemas per route |
| No automated test runner; `scripts/test-inventory-stock.js` fails on the current code (posts a POS-only movement type via `/movements`) | Medium | Open — move scripts to `node --test`, fix stale script |
| No login rate limiting; default `Admin@123` seeded | High (prod) | Open — `express-rate-limit` on `/api/auth/login`, force password change |
| `repositories/sqlite/ceo-dashboard.js` is 1,600 lines | Low | Open — split by widget |

### 2.3 sacone-erp
| Finding | Severity | Status |
|---------|----------|--------|
| Fixed 256 px sidebar, `p-8` padding — **unusable on phones** | High | **Fixed** → responsive `AppShell` (drawer < 1024 px, sticky header, viewport meta) |
| No UI for POS terminals / sync | High | **Added** `/admin/pos-devices` (Devices · POS users · Sync inbox) |
| Page files of 35–52 KB (`products`, `pos`, `warehouse`, `crm`, `hr`, `finance`) | Medium | Open — split into `components/<module>/*` + hooks |
| Session token in `localStorage` (XSS-exfiltratable) | Medium | Open — move to httpOnly cookie |
| No data-fetch layer (each page re-implements loading/error state) | Low | Open — `useApi()` hook or SWR |

### 2.4 POS: replaced by SAC-POS
The Flutter POS had multi-thousand-line screen files, unsalted PINs, no ERP roles and a separate mobile wrapper.
It was replaced by **SAC-POS**, a fresh Expo app with:
- ERP login plus a salted-hash PIN, with 5 attempts, a 7-day offline grace period and deactivation picked up on sync
- screens and actions gated by ERP permission keys (`src/domain/permissions.ts`), re-checked by the server through `erp_user_id`
- a pure domain layer (tax, validation, payloads) unit-tested against the server's `calculateCartTotals`
- a sync engine that pushes before it pulls, uses server-time cursors, re-maps local customers to ERP customers and retries items flagged for review

## 3. Layering rules (keep the code clean)

**API**
```
routes/*.js          HTTP only: parse req → call service → sendSuccess
services/*.js        business rules, permission checks, audit log, transactions
repositories/sqlite  SQL only, returns mapped camelCase objects (Mongo stubs mirror contracts.js)
core/                pure helpers (no DB)
```
- Stock changes **only** through `inventoryMovementService`.
- New module = migration `0NN_*.sql` + repo + service + router + one line in `routes/registry.js` + permission in `core/constants.js`.

**ERP web**
```
lib/navigation.js    single nav catalog (sidebar, home cards, guards)
lib/api.js           fetch wrapper (token, envelope, errors)
components/ui.jsx, components/module-ui.jsx   shared primitives — reuse, don't restyle
app/(dashboard)/<section>/<module>/page.jsx   thin page; heavy panels → components/<module>/
```

**SAC-POS (Expo)**
```
src/app/        screens (expo-router), UI only, no business rules
src/services/   use-cases (completeSale, createReturn, …): validate + permission check + write to ledger
src/domain/     pure TS: types, tax (mirrors server), validation, permissions, payloads (no React, no IO)
src/store/      zustand persisted stores: device, session, catalog, ledger, cart
src/sync/       push/pull engine
src/api/        typed HTTP client
src/ui/         design system: reuse components.tsx, don't restyle per screen
```
- Dependency direction: app → services → store/domain. The domain layer imports nothing.

## 4. Integration contract (summary)

Full spec: `sacone-api/docs/POS_SYNC_API.md`.

| Concern | Decision |
|---------|----------|
| Auth | One sync key per device, bound to its `X-Device-Id`, scoped to one warehouse, rotatable/revocable |
| Idempotency | `pos_sync_inbox (device, entity, ref)` — duplicates are no-ops |
| Invoice numbers | `<DEVICE_CODE>-<terminal no>` → unique across counters |
| Stock | Sales/returns move stock via their documents; `SALE`/`RETURN` events ignored; adjustments → approval queue |
| Conflicts | ERP wins for masters (products, prices, users); terminal wins for facts (sales happened) |
| Failures | Stored with payload in ERP → fix → Retry; dependants auto-retry |
| Payments | Draft customer receipts; accountant posts with the cash/bank account |
| Staff | `erp_user_id` on each record → created as that user if active and permitted, else device user + warning |
| Cursors | Server `server_time`, advanced only after a clean pull |

Verified end-to-end by `sacone-api/scripts/test-pos-sync.js` (27 checks: binding, duplicates, stock-once, returns, payments, approvals, revocation, customer pull, staff status, attribution). Existing `test-pos-scenarios.js` still passes.

## 5. Running everything

```bash
# API + ERP
npm run install:all
npm run db:setup          # applies migration 022_pos_device_sync
npm run dev               # API :4000, ERP :3000 (open ERP from a phone at http://<pc-ip>:3000)
npm run test:pos-sync

# SAC-POS
cd sac-pos
npm install
npm test                  # domain + tax parity tests
npx expo start            # scan QR with Expo Go; server URL = http://<pc-ip>:4000
```
For a phone to reach the ERP web app on the LAN, set `NEXT_PUBLIC_API_URL=http://<pc-ip>:4000` in `sacone-erp/.env.local` and add `http://<pc-ip>:3000` to `CORS_ORIGIN`.

## 6. Legacy folders to remove

These are no longer used by anything in the suite, and the launchers no longer reference them. Delete them by hand
once you have backed up any data you need:

```
BillEase Suite/sacone/billease pos/        (Flutter POS)
BillEase Suite/desktop-apps/               (GST Billing / Accounts+, with its own gst_billing.db)
BillEase Suite/mobile-apps/                (SpendSight)
BillEase Suite/database/migrations/        (pre-SACONE SQL, optional)
BillEase Suite/docs/app-handbook/          (outdated, optional)
```

## 7. Roadmap (in order)

1. **SAC-POS hardware**: Bluetooth ESC/POS thermal printing and cash-drawer kick.
2. **Security hardening**: login rate limit, httpOnly ERP session, forced change of the default password, PBKDF2 for the legacy PIN users.
3. **API quality** — zod validation, merge duplicate `WarehouseRepository`, `node --test` suite running the existing scripts in CI.
4. **ERP page decomposition** — split the 35–52 KB pages into module components + a shared `useApi` hook.
5. **SAC-POS extras**: shift open/close with cash count, offline product images, store builds through EAS.
