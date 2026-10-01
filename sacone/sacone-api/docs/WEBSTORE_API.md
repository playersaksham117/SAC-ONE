# SACONE Web Store Integration API

**Base URL:** `http://localhost:4000/api/webstore/v1`  
**Version:** v1  
**Phase:** 9 — Integration layer only (not a full ecommerce backend)

This API lets an existing or future web store connect to SACONE’s **Product Master**, **Inventory Movement Engine stock cache**, and **Customer Master**.

---

## Authentication

All public endpoints require an API key.

| Method | How |
|--------|-----|
| Header (preferred) | `X-API-Key: sk_live_...` |
| Bearer | `Authorization: Bearer sk_live_...` |
| ApiKey scheme | `Authorization: ApiKey sk_live_...` |

### Scopes

| Scope | Access |
|-------|--------|
| `products.read` | Product catalog |
| `inventory.read` | Stock availability |
| `customers.read` | Customer search / get |
| `customers.write` | Customer create / update |
| `orders.provision` | Future order provision endpoint |

Keys are managed by Owner/Admin via session-authenticated admin APIs (`/api/webstore/admin/...`) with permission `webstore.api_settings.*`.

**Raw secret is shown once at creation.** SACONE stores only a SHA-256 hash.

### Common auth errors

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 403 | `FORBIDDEN` | Key lacks required scope |

Every request is written to `api_request_logs` (method, path, status, duration, key id, IP). Response header: `X-Request-Id`.

---

## 1. Products

Only products with **Web Store Publish = enabled** and **Active** are returned.  
Sensitive ERP fields (purchase price, reorder internals, audit) are **not** exposed.

### List products

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/webstore/v1/products` |
| **Auth** | API key + `products.read` |
| **Query** | `search` (optional), `limit` (default 100, max 500), `offset` |

**Request body:** none

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "uuid",
        "productName": "Mineral Water 1L",
        "sku": "BEV-WTR-001",
        "category": "Beverages",
        "brand": "FreshCo",
        "mrp": 20,
        "sellingPrice": 18,
        "gst": 12,
        "productImage": null,
        "activeStatus": true
      }
    ],
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

**Errors:** `401`, `403`

### Get product

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/webstore/v1/products/:productId` |
| **Auth** | API key + `products.read` |

**Response `200`:** single product object (same fields as list item)

**Errors:** `404 NOT_FOUND` if missing, inactive, or not web-published

---

## 2. Inventory

Aggregated **available** quantity across warehouses for web-published products.

### Stock status rules

| Status | Rule |
|--------|------|
| `Out of Stock` | available ≤ 0 |
| `Low Stock` | 0 < available ≤ reorder level (or minimum stock if reorder is 0) |
| `In Stock` | otherwise |

### List inventory

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/webstore/v1/inventory` |
| **Auth** | API key + `inventory.read` |
| **Query** | `productId`, `sku`, `limit`, `offset` |

**Request body:** none

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "uuid",
        "sku": "BEV-WTR-001",
        "availableQuantity": 42,
        "stockStatus": "In Stock"
      }
    ],
    "total": 1,
    "limit": 200,
    "offset": 0
  }
}
```

**Errors:** `401`, `403`

---

## 3. Customers

Uses the **same central customer master** as POS and ERP (`sourceChannel: "web"` on create).  
No separate web-store customer table.

### Search customers

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/webstore/v1/customers` |
| **Auth** | API key + `customers.read` |
| **Query** | `q` or `search` (required for useful results), `limit` (max 50) |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "customerId": "uuid",
        "customerCode": "CUST-0001",
        "name": "Retail Mart Pvt Ltd",
        "phone": "9876543210",
        "email": "accounts@retailmart.example",
        "gstNumber": "27AABCU9603R1ZM",
        "gstStateCode": null,
        "address": "12 Market Road",
        "city": "Mumbai",
        "state": "Maharashtra",
        "activeStatus": true,
        "sourceChannel": "manual"
      }
    ]
  }
}
```

Walk-in customers are excluded. Outstanding balance and credit limit are **not** returned.

### Get customer

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/webstore/v1/customers/:customerId` |
| **Auth** | API key + `customers.read` |

**Errors:** `404 NOT_FOUND`

### Create customer

| | |
|--|--|
| **Method** | `POST` |
| **Endpoint** | `/api/webstore/v1/customers` |
| **Auth** | API key + `customers.write` |

**Request body**

```json
{
  "name": "Online Buyer",
  "phone": "9000000001",
  "email": "buyer@example.com",
  "gstNumber": null,
  "gstStateCode": "27",
  "address": "Line 1",
  "city": "Mumbai",
  "state": "Maharashtra",
  "notes": "optional",
  "customerCode": "optional-auto-if-omitted"
}
```

**Response `201`:** customer object (same shape as search item), `sourceChannel: "web"`

**Errors:** `400`, `409 CONFLICT` (duplicate code)

### Update customer (allowed fields only)

| | |
|--|--|
| **Method** | `PATCH` |
| **Endpoint** | `/api/webstore/v1/customers/:customerId` |
| **Auth** | API key + `customers.write` |

**Allowed body fields:** `name`, `phone`, `email`, `gstNumber`, `gstStateCode`, `address`, `city`, `state`, `notes`  
**Not allowed:** outstanding balance, credit limit, walk-in flag, active flag

**Response `200`:** updated customer object

---

## 4. Future order provision

Prepares the contract for online orders. **Does not** run full order management, stock reservation, or inventory movements in this phase.

### Intended future flow

```
Web Store → SACONE API → Customer Validation → Order Creation
         → Stock Reservation → Inventory Movement
```

### Provision order (contract intake)

| | |
|--|--|
| **Method** | `POST` |
| **Endpoint** | `/api/webstore/v1/orders/provision` |
| **Auth** | API key + `orders.provision` |
| **Success** | `202 Accepted` |

**Request body**

```json
{
  "externalOrderRef": "WS-10045",
  "customerId": "uuid",
  "currency": "INR",
  "shippingAddress": { "line1": "...", "city": "...", "state": "...", "postalCode": "..." },
  "billingAddress": { "line1": "..." },
  "notes": "optional",
  "items": [
    { "productId": "uuid", "sku": "BEV-WTR-001", "quantity": 2, "unitPrice": 18 }
  ]
}
```

`productId` **or** `sku` required per line. Products must be active and web-published.

**Response `202`**

```json
{
  "success": true,
  "data": {
    "provisionId": "uuid",
    "provisionNumber": "WEB-ORD-00001",
    "status": "received",
    "fulfillmentStatus": "pending_future_release",
    "stockReserved": false,
    "inventoryMovementCreated": false,
    "message": "Order provision recorded. Full order management and stock reservation are not enabled in this phase.",
    "customer": { "...": "..." },
    "items": [{ "productId": "...", "sku": "...", "quantity": 2, "unitPrice": 18 }],
    "intendedFlow": [
      "customer_validation",
      "order_creation",
      "stock_reservation",
      "inventory_movement"
    ],
    "createdAt": "ISO-8601"
  }
}
```

**Errors**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `INVALID_CUSTOMER` | Bad / inactive / walk-in customer |
| 400 | `INVALID_PRODUCT` | Product not web-sellable |
| 400 | `APP_ERROR` | Validation failure |
| 401 / 403 | | Auth / scope |

---

## Admin endpoints (ERP session auth)

Base: `/api/webstore/admin`  
Header: `Authorization: Bearer <session-token>`  
Permission: `webstore.api_settings.view` / `.edit`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/scopes` | List available scopes |
| `GET` | `/api-keys` | List keys (prefix only, never raw secret) |
| `POST` | `/api-keys` | Create key — response includes `apiKey` **once** |
| `POST` | `/api-keys/:id/revoke` | Revoke key |
| `GET` | `/api-logs` | Recent API request logs |

**Create key body**

```json
{
  "name": "Production Web Store",
  "scopes": ["products.read", "inventory.read", "customers.read", "customers.write", "orders.provision"],
  "notes": "optional"
}
```

---

## Security notes

- Do not send purchase price, margins, credit limits, or staff data to the storefront.
- Rotate / revoke keys via admin if compromised.
- Prefer HTTPS in production.
- Rate limiting is out of scope for Phase 9; place it at the reverse proxy if needed.
