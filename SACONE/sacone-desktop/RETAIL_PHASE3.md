# TracInvent Phase 3 — Mobile Ecosystem

Phase 3 adds a **desktop-first sync hub**, **mobile inventory/POS companions**, and an **offline-capable event sync engine**.

## Architecture Overview

```
┌─────────────────┐     push/pull REST      ┌──────────────────────┐
│ Desktop POS/WMS │ ◄──────────────────────►│ FastAPI Sync Hub     │
│ SQLite + queue  │   Bearer device token   │ entity_store + audit │
└────────┬────────┘                         └──────────┬───────────┘
         │                                             │
         │              same API                        │
         ▼                                             ▼
┌─────────────────┐                         ┌──────────────────────┐
│ Mobile Inventory│                         │ Mobile POS           │
│ barcode/transfer│                         │ billing + offline  │
└─────────────────┘                         └──────────────────────┘
```

**Desktop remains source of truth.** Mobile devices enqueue local mutations, push when online, and pull server deltas. The hub stores canonical entities per tenant in `entity_store`.

---

## 1. API Layer (FastAPI)

**Location:** `backend/api/main.py`  
**Default URL:** `http://localhost:8000/api/v1`

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Liveness check |
| POST | `/auth/login` | None | User credentials → tenant context |
| POST | `/devices/register` | Optional Bearer | Issue device API token |
| POST | `/sync/push` | Bearer | Apply outbound change batch |
| POST | `/sync/pull` | Bearer | Fetch deltas since timestamp |

### Example: Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username": "admin@123", "password": "admin123"}
```

```json
{
  "tenant_id": "...",
  "tenant_name": "Default Shop",
  "user_id": "...",
  "username": "admin@123",
  "role": "admin"
}
```

### Example: Register device

```http
POST /api/v1/devices/register
Authorization: Bearer <device_or_dev_token>
Content-Type: application/json

{"name": "Store Tablet 1", "device_type": "mobile_pos", "role": "operator"}
```

```json
{
  "device_id": "...",
  "api_token": "...",
  "tenant_id": "..."
}
```

### Example: Push sync batch

```http
POST /api/v1/sync/push
Authorization: Bearer <api_token>
Content-Type: application/json

{
  "changes": [{
    "client_id": "queue-uuid",
    "table_name": "sales_invoices",
    "record_id": "inv-uuid",
    "operation": "upsert",
    "payload": { "id": "inv-uuid", "totalAmount": 1500, ... },
    "client_updated_at": "2026-05-23T10:00:00"
  }]
}
```

Response per change: `applied`, `duplicate`, or `rejected`.

### Example: Pull deltas

```http
POST /api/v1/sync/pull
Authorization: Bearer <api_token>
Content-Type: application/json

{"since": "2026-05-23T09:00:00", "tables": ["inventory_items", "stocks"]}
```

### Start server

```bash
cd backend/api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 2. Mobile App Structure

| App | Path | Role |
|-----|------|------|
| Desktop | `desktop-apps/tracinvent` | Full WMS + POS + sync hub client |
| Mobile companion | `mobile-apps/tracinvent_mobile` | Inventory + POS on phone/tablet |

### Desktop mobile hubs (for testing layouts)

- **Mobile Inventory** — nav index 18: barcode lookup, transfer, adjustment shortcuts
- **Mobile POS** — nav index 19: wraps `PosBillingScreen` with offline/sync indicators

### Mobile companion screens

Bottom nav + drawer mirrors desktop indices. Pair via **Settings → Mobile Sync & Device Pairing**.

---

## 3. Sync Engine Logic

**Files:**

- `lib/services/sync_queue_service.dart` — persists outbound mutations in `sync_queue`
- `lib/services/sync_engine.dart` — push → pull → apply loop
- `lib/providers/sync_provider.dart` — connectivity, auto-sync every 5 min, pending count

### Flow

1. **Local write** → `trackMutation()` enqueues row in `sync_queue`
2. **Sync run** (manual, auto, or on reconnect):
   - `_pushPending()` — POST batch to `/sync/push`
   - Mark queue rows `done` on `applied` / `duplicate`
   - `_pullAndApply()` — POST `/sync/pull` with `last_sync_time`
   - Upsert/delete locally inside a DB transaction
3. **Audit** — `AuditService.log(module: 'sync', ...)`

### Wired mutations (desktop)

- `InventoryProvider` — items, transactions
- `StockControlService` — stock in/out rows
- `SaleService` — invoices + sale lines after checkout

---

## 4. Offline Sync Strategy

| Concern | Strategy |
|---------|----------|
| Local storage | SQLite on each device (same schema family) |
| Outbound queue | `sync_queue` table with status `pending` / `failed` / `done` |
| Unstable network | Queue accumulates; sync on connectivity restore + 5 min timer |
| Duplicate transactions | Server idempotency key: `{device_id}:{client_id}` |
| Conflict resolution | **Last-write-wins** on `entity_store.updated_at`; server timestamp wins on pull |
| Stock safety | Local `StockControlService.assertAvailable` before sale; server applies same payloads |

### Conflict rules

1. Push rejected → row stays in queue with `failed` + error message
2. Duplicate push → treated as success (safe retry)
3. Pull always uses `ConflictAlgorithm.replace` for upserts

---

## 5. Security Model

| Layer | Mechanism |
|-------|-----------|
| User auth | Username + SHA-256 password hash (login endpoint) |
| Device auth | Per-device `api_token` (Bearer header on sync) |
| Roles | `admin`, `operator` on users/devices (extend for fine-grained RBAC) |
| Tenant isolation | All `entity_store` rows scoped by `tenant_id` |
| Transport | HTTPS in production (dev uses HTTP localhost) |
| Token storage | `SharedPreferences` keys: `sync_api_token`, `sync_device_id`, `sync_tenant_id` |

### Device types

- `desktop` — full sync client
- `mobile_inventory` — stock lookup, transfer, adjustment
- `mobile_pos` — billing + offline sales

---

## 6. Pairing & Operations

1. Start FastAPI sync hub
2. Desktop → **Settings → Mobile Sync & Device Pairing**
3. Enter LAN URL (e.g. `http://192.168.1.10:8000/api/v1`), credentials, device name
4. Click **Pair & Sync** — registers device, stores token, runs first sync
5. Repeat on each mobile device with type `mobile_inventory` or `mobile_pos`

Sidebar shows pending queue count and sync status.

---

## 7. Real-time Sync (Roadmap)

Current implementation is **REST batch sync** (push/pull). For near-real-time:

- Add WebSocket channel `/api/v1/sync/stream` broadcasting `entity_store` changes
- Mobile subscribes after pull; debounce local writes 2–3 s before push
- Desktop hub publishes on each `_apply_change`

---

## 8. Files Added / Updated (Phase 3)

```
backend/api/main.py
backend/api/requirements.txt
lib/services/api_client.dart
lib/services/device_auth_service.dart
lib/services/sync_queue_service.dart
lib/services/sync_engine.dart
lib/providers/sync_provider.dart
lib/screens/mobile/mobile_hub_screens.dart
lib/widgets/sync_pairing_panel.dart
RETAIL_PHASE3.md
```

---

## 9. Testing Checklist

- [ ] `GET /api/v1/health` returns `ok`
- [ ] Pair desktop device from Settings
- [ ] Create inventory item → pending count increases → sync → hub `entity_store` row
- [ ] Complete POS sale offline → queue grows → sync when online
- [ ] Pull on second device shows updated stock
- [ ] Retry push with same `client_id` returns `duplicate` (no double sale)

---

## Default credentials

| Field | Value |
|-------|-------|
| Username | `admin@123` |
| Password | `admin123` |

Change `TRACINVENT_SECRET` and admin password before production deployment.
