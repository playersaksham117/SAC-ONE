# POS Device Sync API (`/api/v1/sync`)

Connects **SAC-POS** (the Expo mobile POS in `sacone/sac-pos`, Android · iOS · web) and any other POS terminal to SACONE.
Terminals are **offline-first**: they bill locally and sync when a connection is available.

| Direction | Data | Master |
|-----------|------|--------|
| Terminal → ERP | sales, returns, customer payments, new customers, stock adjustments, new-product requests | Terminal (facts that already happened) |
| ERP → Terminal | products, prices, GST, warehouse stock, POS PIN users | ERP |

## 1. Setup

1. ERP → **Operations → POS Devices & Sync → Register device**. Pick the warehouse the terminal sells from.
2. Copy the **server URL** and **device sync key** (`sk_live_…`, shown once).
3. SAC-POS → first screen **Connect to SACONE** → paste both → *Connect*.
4. Staff sign in once with their **ERP email + password** (role must include `pos.terminal.view`), then set a 4–6 digit PIN
   for offline unlock. Permissions come from the ERP role and refresh on every sync (`GET /staff`).
   (Legacy terminals may still use PIN users from the **POS users** tab.)

Server env (sacone-api `.env`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOST` | `0.0.0.0` | Listen on the LAN so terminals/phones can reach the API |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated browser origins (native apps send none) |
| `JSON_BODY_LIMIT` | `5mb` | Max sync batch size |
| `POS_SYNC_TOTAL_TOLERANCE` | `1` | Max ₹ difference between terminal total and ERP-computed total before a sale is held for review |
| `POS_DEFAULT_TZ_OFFSET` | `+05:30` | Timezone for terminal timestamps sent without an offset |

## 2. Authentication

```
X-API-Key: sk_live_xxxxxxxx          (or Authorization: Bearer sk_live_…)
X-Device-Id: 3f0c…-uuid              (generated once per install)
X-App-Version: 1.1.0                 (optional, shown in ERP)
X-Device-Platform: android           (optional, shown in ERP)
```

The first `X-Device-Id` seen is **bound** to the key. The same key from another install returns
`403 DEVICE_MISMATCH` — rotate the key in ERP to move a device. Revoked keys return `401`.

The device acts as its **acting ERP user** (audit trail) with a narrow permission set:
`pos.terminal.view, pos.sales.*, pos.returns.*, parties.customers.view/create, parties.customer_receipts.view/create, inventory.adjustments.create`.

## 3. Response envelope

All responses use the SACONE envelope:

```json
{ "success": true, "data": { … } }
{ "success": false, "error": { "message": "…", "code": "UNAUTHORIZED" } }
```

Push endpoints return one result per record:

```json
{
  "success": true,
  "data": {
    "message": "sale: 2 applied, 1 duplicate, 1 failed",
    "received": 4, "applied": 2, "duplicate": 1, "failed": 1, "ignored": 0, "pending_review": 0,
    "results": [
      { "ref": "INV-0012", "status": "applied", "stored": true, "id": "uuid", "number": "POS1-INV-0012", "warnings": [] },
      { "ref": "INV-0013", "status": "failed",  "stored": true, "error": "Line 1: product not found in ERP", "errorCode": "UNKNOWN_PRODUCT" }
    ],
    "serverTime": "2026-09-26T08:00:00.000Z"
  }
}
```

**`stored: true` ⇒ the terminal may mark the record synced.** Failed records are kept in the ERP
**Sync inbox** with their payload; staff fix the cause (e.g. create the product) and press **Retry** —
the terminal never needs to resend.

## 4. Idempotency

Every record is ledgered in `pos_sync_inbox` by `(device, entity, ref)`. Re-sending an applied record
returns `duplicate` and changes nothing. Synced invoices are numbered `<DEVICE_CODE>-<terminal invoice no>`
so two counters can never collide.

## 5. Endpoints

| Method | Path | Body / query | Notes |
|--------|------|--------------|-------|
| GET/POST | `/ping` · `/bootstrap` | — | Device, warehouse, company, `serverTime`, settings |
| POST | `/push/sales` | `{ sales: [...] }` | → POS invoice + `pos_sale` stock movements + commissions |
| POST | `/push/returns` | `{ returns: [...] }` | → sales return + `sales_return` movements |
| POST | `/push/payments` | `{ payments: [...] }` | → **draft** customer receipt (accountant posts it) |
| POST | `/push/customers` | `{ customers: [...] }` | Matches by GSTIN / phone, else creates (`source_channel = pos`) |
| POST | `/push/stock-events` | `{ stock_events: [...] }` | SALE/RETURN ignored (moved by documents); others → adjustment **awaiting approval** |
| POST | `/push/products` | `{ products: [...] }` | New items → **pending review** in ERP |
| POST | `/push` | any of the above keys | Processed in dependency order |
| GET | `/products` | `since, page, limit≤500` | Changed products **or** stock in the device warehouse |
| GET | `/products/pending-count` | `since` | |
| POST | `/products/ack` | `{ uuids: [] }` | Informational |
| GET | `/customers` | `since, page, limit≤500` | Changed customers (walk-in excluded) with `credit_limit`, `outstanding` |
| GET | `/staff` | `ids=uuid,uuid` | Active flag, role and permission keys of ERP users signed in on the terminal |
| GET | `/users` | `since, page, limit` | POS PIN users (global + device warehouse) |
| POST | `/users/ack` | `{ uuids: [] }` | Informational |

Use the returned `server_time` as the next `since` cursor (never the terminal clock).

### Sale record

```json
{
  "invoice_no": "INV-0012",
  "sale_date": "2026-09-26T13:05:10.123",          // local time (offset assumed POS_DEFAULT_TZ_OFFSET)
  "sale_date_utc": "2026-09-26T07:35:10.123Z",     // preferred
  "customer_name": "Ravi Traders", "customer_phone": "9876543210", "customer_gstin": null,
  "discount_amount": 10,                            // invoice-level discount (pre-tax)
  "total_amount": 1170.4, "paid_amount": 500, "due_amount": 670.4,
  "payment_method": "UPI",                          // Cash | UPI | Card | Wallet | Credit
  "payments": [ { "method": "cash", "amount": 500 } ],   // optional explicit split
  "items": [
    { "product_uuid": "erp-product-id", "sku": "GRO-RIC-007", "barcode": "890…",
      "quantity": 2, "unit_price": 499, "discount_amount": 0, "tax_rate": 18 }
  ]
}
```

Rules:
- Prices are **GST-exclusive**; ERP recomputes GST (CGST/SGST vs IGST by state).
- If the terminal total differs from ERP by more than `POS_SYNC_TOTAL_TOLERANCE`, the sale fails with `TOTAL_MISMATCH` for review; smaller differences are absorbed with a `TOTAL_ROUNDING` warning.
- Offline reality wins: insufficient stock and exceeded credit limits **do not reject** the sale — they add `NEGATIVE_STOCK` / `CREDIT_LIMIT` warnings.
- A due/credit sale needs a customer name + phone/GSTIN (a customer is created if not found).

### Return record

```json
{ "return_number": "RET-0003", "sale_number": "INV-0012", "refund_method": "cash", "reason": "damaged",
  "items": [ { "sku": "GRO-RIC-007", "quantity": 1 } ] }
```

Returns/payments for a sale that hasn't synced yet fail with `SALE_NOT_SYNCED` and are **retried
automatically** as soon as that sale is applied.

### Staff attribution (`erp_user_id`)

Any pushed record (sale, return, payment, customer, stock event) may include `"erp_user_id": "<ERP user uuid>"` —
the staff member who was signed in on the terminal. The server re-checks that user:

| Record | Permission required |
|--------|--------------------|
| sale | `pos.sales.create` |
| return | `pos.returns.create` |
| payment | `parties.customer_receipts.create` |
| customer | `parties.customers.create` |
| stock_event | `inventory.adjustments.create` |

If the user is active and allowed, the document is created **as that user**. Otherwise it falls back to the
device's acting user and the result carries a `USER_INACTIVE` / `USER_NOT_PERMITTED` warning (offline reality wins —
the sale already happened).

## 6. Error codes

| Code | Meaning | Fix |
|------|---------|-----|
| `UNKNOWN_PRODUCT` | SKU/barcode/uuid not in ERP | Create/approve the product, then Retry |
| `TOTAL_MISMATCH` | Terminal and ERP totals differ | Align product GST/price, then Retry or Reject |
| `CUSTOMER_REQUIRED` | Credit sale without customer details | Reject, or edit customer & Retry |
| `SALE_NOT_SYNCED` | Return/payment before its sale | Auto-retried |
| `DEVICE_MISMATCH` | Key used from a second install | Rotate key |
| `DEVICE_USER_INACTIVE` | Device's acting ERP user disabled | Edit device → choose an active user |

## 7. ERP admin API (`/api/pos-devices`, session auth)

| Method | Path | Permission |
|--------|------|-----------|
| GET/POST | `/` | `pos.devices.view` / `.create` (returns `syncKey` once) |
| PUT | `/:id` | `pos.devices.edit` |
| POST | `/:id/rotate-key` · `/:id/revoke` | `.edit` / `.delete` |
| GET/POST/PUT | `/users` · `/users/:id` | view / create / edit |
| GET | `/inbox?status=&entityType=&deviceId=` · `/inbox/summary` | `.view` |
| POST | `/inbox/:id/retry` | `.edit` |
| POST | `/inbox/:id/approve` · `/inbox/:id/reject` | `.approve` |

## 8. Test

```bash
cd sacone-api
SEED_DEMO_DATA=true npm run db:setup
npm run dev
npm run test:pos-sync        # 27 end-to-end checks (incl. customer pull, staff status, attribution)
```
