# TracInvent Web Application — Engineer Specification

**Version:** 1.0  
**Reference App:** TracInvent Desktop v1.2.0  
**Purpose:** Build a feature-complete web version of the TracInvent inventory management system. This document describes every feature, screen, data model, and business rule from the desktop app so the web version can be built independently.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack Recommendation](#2-tech-stack-recommendation)
3. [Authentication & Roles](#3-authentication--roles)
4. [Database Schema](#4-database-schema)
5. [Feature Modules](#5-feature-modules)
   - 5.1 Dashboard
   - 5.2 Inventory Management
   - 5.3 Warehouse Management
   - 5.4 Stock Locations & Cell View
   - 5.5 Stock Adjustments
   - 5.6 Transactions (Stock In / Out)
   - 5.7 Daily Transaction Log
   - 5.8 Reports & Analytics
   - 5.9 Barcode & QR Scanner
   - 5.10 Supplier Management
   - 5.11 Customer Management
   - 5.12 Purchase Orders
   - 5.13 POS / Retail Billing
   - 5.14 Ledger & Accounting
   - 5.15 POS Data Import
   - 5.16 User Management
   - 5.17 Settings
6. [Business Rules](#6-business-rules)
7. [API Design (REST)](#7-api-design-rest)
8. [UI/UX Guidelines](#8-uiux-guidelines)
9. [Non-Functional Requirements](#9-non-functional-requirements)

---

## 1. Project Overview

TracInvent is a multi-warehouse inventory management system. The desktop app is built in Flutter and uses SQLite locally. The web version should:

- Run entirely in the browser
- Support multiple simultaneous users (multi-tenant per organization)
- Persist all data in a server-side database (PostgreSQL recommended)
- Be accessible from any device (responsive design)
- Support all the same features as the desktop app

**Product Name:** TracInvent Web  
**Target Users:** Warehouse staff, managers, and administrators in small-to-medium businesses.

---

## 2. Tech Stack Recommendation

These are recommendations. The engineer may choose alternatives.

| Layer | Recommended | Alternatives |
|-------|------------|--------------|
| Frontend | React 18 + TypeScript | Next.js, Vue 3, SvelteKit |
| UI Library | shadcn/ui + Tailwind CSS | Ant Design, MUI |
| State Management | Zustand or TanStack Query | Redux, Jotai |
| Backend | Node.js + Express or FastAPI (Python) | NestJS, Django |
| Database | PostgreSQL | MySQL, Supabase (Postgres) |
| ORM | Prisma (Node) or SQLAlchemy (Python) | TypeORM, Drizzle |
| Auth | JWT (access + refresh tokens) | NextAuth, Auth0 |
| File Storage | AWS S3 or local disk | Cloudinary |
| QR/Barcode | `@zxing/library` (web) | QuaggaJS |
| PDF Generation | `react-pdf` or Puppeteer | jsPDF |
| Excel Export | `xlsx` (SheetJS) | ExcelJS |
| Charts | Recharts or Chart.js | Nivo, Victory |
| Real-time | WebSockets or Server-Sent Events | Supabase Realtime |

---

## 3. Authentication & Roles

### 3.1 First-Run Setup
- If the database has **zero users**, redirect to a one-time **Admin Setup** page.
- Admin Setup collects: Full Name, Username/Email, Password (min 6 chars), Confirm Password.
- Creates the first user with role `admin`.
- After setup, redirect to login.

### 3.2 Login
- Fields: Username or Email + Password.
- On success: issue a JWT access token (15 min expiry) + refresh token (7 days, stored in httpOnly cookie).
- Show error: "Invalid username or password" on failure.
- No self-registration — users are added only by an admin.

### 3.3 PIN Quick Lock
- Each user can optionally set a 4–6 digit numeric PIN.
- When the browser tab is idle for X minutes (configurable, default 10 min), show a PIN lock overlay.
- User enters PIN to resume without full re-login.
- PIN is stored as a SHA-256 hash (salt: `tracInvent_pin_salt:<pin>`).

### 3.4 Password Hashing
- Hash algorithm: SHA-256 with prefix salt `tracInvent_pw_salt:<password>`.
- This must match the desktop app's hash so desktop-exported user records can be imported.

### 3.5 Roles & Permissions

| Role | Description |
|------|-------------|
| `admin` | Full access to everything |
| `manager` | All features except Settings and User Management |
| `staff` | Inventory, stock tracking, adjustments, scanner |
| `viewer` | Read-only: Dashboard and Inventory only |

**Role permission matrix:**

| Feature | admin | manager | staff | viewer |
|---------|-------|---------|-------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Inventory (read) | ✅ | ✅ | ✅ | ✅ |
| Inventory (write) | ✅ | ✅ | ✅ | ❌ |
| Stock Locations | ✅ | ✅ | ✅ | ❌ |
| Cell Stock View | ✅ | ✅ | ✅ | ❌ |
| Daily Log | ✅ | ✅ | ✅ | ❌ |
| Adjustments | ✅ | ✅ | ✅ | ❌ |
| Warehouses | ✅ | ✅ | ❌ | ❌ |
| Stock In/Out | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| QR/Barcode Scanner | ✅ | ✅ | ✅ | ❌ |
| Suppliers | ✅ | ✅ | ❌ | ❌ |
| Customers | ✅ | ✅ | ❌ | ❌ |
| Purchase Orders | ✅ | ✅ | ❌ | ❌ |
| POS Billing | ✅ | ✅ | ✅ | ❌ |
| Ledger | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ |

### 3.6 User Model

```
users table:
  id            TEXT PRIMARY KEY
  username      TEXT UNIQUE NOT NULL
  email         TEXT
  display_name  TEXT NOT NULL
  password_hash TEXT NOT NULL
  pin_hash      TEXT
  role          TEXT NOT NULL  -- admin | manager | staff | viewer
  is_active     BOOLEAN DEFAULT true
  is_deleted    BOOLEAN DEFAULT false
  created_at    TIMESTAMP
  updated_at    TIMESTAMP
  last_login    TIMESTAMP
```

---

## 4. Database Schema

> The web database should mirror the desktop SQLite schema so data can be migrated. Use PostgreSQL with equivalent column types.

### 4.1 Core Tables

#### `inventory_items`
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
sku             TEXT UNIQUE NOT NULL
barcode         TEXT
category        TEXT NOT NULL
unit            TEXT NOT NULL          -- pieces, kg, litres, boxes, etc.
reorder_level   DECIMAL(10,3) DEFAULT 0
min_stock_level DECIMAL(10,3) DEFAULT 0
cost_price      DECIMAL(10,2) DEFAULT 0
selling_price   DECIMAL(10,2) DEFAULT 0
description     TEXT
hsn             TEXT                   -- HSN code for GST
brand           TEXT
is_active       BOOLEAN DEFAULT true
is_deleted      BOOLEAN DEFAULT false
created_at      TIMESTAMP
updated_at      TIMESTAMP
sync_status     TEXT DEFAULT 'local'
```

#### `warehouses`
```sql
id              TEXT PRIMARY KEY
code            TEXT UNIQUE            -- Auto-generated e.g. WH-MAIN
name            TEXT NOT NULL
address         TEXT
city            TEXT
state           TEXT
postal_code     TEXT
country         TEXT
contact_person  TEXT
contact_phone   TEXT
contact_email   TEXT
is_active       BOOLEAN DEFAULT true
is_deleted      BOOLEAN DEFAULT false
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### `storage_locations`
```sql
id              TEXT PRIMARY KEY
warehouse_id    TEXT REFERENCES warehouses(id)
type            TEXT NOT NULL          -- cell | rack | zone | aisle | bin
code            TEXT NOT NULL          -- e.g. A-01-01
description     TEXT
row             INTEGER
column          INTEGER
level           INTEGER
zone_id         TEXT
zone_name       TEXT
capacity        DECIMAL(10,3)
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMP
```

#### `stock`
```sql
id              TEXT PRIMARY KEY
item_id         TEXT REFERENCES inventory_items(id)
warehouse_id    TEXT REFERENCES warehouses(id)
location_id     TEXT REFERENCES storage_locations(id)
quantity        DECIMAL(10,3) DEFAULT 0
batch_number    TEXT
expiry_date     DATE
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### `stock_movements`
```sql
id              TEXT PRIMARY KEY
item_id         TEXT REFERENCES inventory_items(id)
warehouse_id    TEXT REFERENCES warehouses(id)
location_id     TEXT
movement_type   TEXT NOT NULL   -- IN | OUT | TRANSFER | ADJUSTMENT
quantity        DECIMAL(10,3)
reference_id    TEXT            -- links to adjustment/transaction id
notes           TEXT
created_by      TEXT REFERENCES users(id)
created_at      TIMESTAMP
```

#### `stock_adjustments`
```sql
id                  TEXT PRIMARY KEY
item_id             TEXT REFERENCES inventory_items(id)
item_name           TEXT                -- denormalized
item_sku            TEXT                -- denormalized
warehouse_id        TEXT REFERENCES warehouses(id)
warehouse_name      TEXT                -- denormalized
cell_id             TEXT
cell_name           TEXT
batch_number        TEXT
expiry_date         DATE
quantity_before     DECIMAL(10,3)
quantity_adjusted   DECIMAL(10,3)
quantity_after      DECIMAL(10,3)
adjustment_type     TEXT    -- INC | DEC | COR | DMG | EXP | PHY
status              TEXT    -- PND | APR | REJ
reason              TEXT NOT NULL
reference_document  TEXT
notes               TEXT
created_by          TEXT REFERENCES users(id)
approved_by         TEXT REFERENCES users(id)
created_at          TIMESTAMP
approved_at         TIMESTAMP
updated_at          TIMESTAMP
```

**Adjustment types:**
| Code | Label |
|------|-------|
| `INC` | Increase |
| `DEC` | Decrease |
| `COR` | Correction |
| `DMG` | Damage/Waste |
| `EXP` | Expiry |
| `PHY` | Physical Inventory |

#### `transactions` (Stock In / Out)
```sql
id              TEXT PRIMARY KEY
transaction_no  TEXT UNIQUE
type            TEXT NOT NULL   -- IN | OUT
item_id         TEXT REFERENCES inventory_items(id)
warehouse_id    TEXT REFERENCES warehouses(id)
location_id     TEXT
quantity        DECIMAL(10,3)
unit_price      DECIMAL(10,2)
total_price     DECIMAL(10,2)
reference       TEXT            -- PO number, invoice, etc.
notes           TEXT
created_by      TEXT REFERENCES users(id)
created_at      TIMESTAMP
```

### 4.2 Retail / POS Tables

#### `suppliers`
```sql
id                  TEXT PRIMARY KEY
code                TEXT UNIQUE
name                TEXT NOT NULL
contact_person      TEXT
phone               TEXT
email               TEXT
address             TEXT
city                TEXT
state               TEXT
gstin               TEXT        -- GST Identification Number
credit_limit        DECIMAL(12,2) DEFAULT 0
credit_balance      DECIMAL(12,2) DEFAULT 0
payment_terms_days  INTEGER DEFAULT 30
is_active           BOOLEAN DEFAULT true
notes               TEXT
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

#### `customers`
```sql
id              TEXT PRIMARY KEY
code            TEXT UNIQUE
name            TEXT NOT NULL
phone           TEXT
email           TEXT
address         TEXT
city            TEXT
gstin           TEXT
loyalty_points  DECIMAL(10,2) DEFAULT 0
credit_limit    DECIMAL(12,2) DEFAULT 0
credit_balance  DECIMAL(12,2) DEFAULT 0
is_active       BOOLEAN DEFAULT true
notes           TEXT
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### `purchase_orders`
```sql
id              TEXT PRIMARY KEY
po_number       TEXT UNIQUE
supplier_id     TEXT REFERENCES suppliers(id)
status          TEXT    -- DRAFT | SENT | PARTIAL | RECEIVED | CANCELLED
order_date      DATE
expected_date   DATE
received_date   DATE
subtotal        DECIMAL(12,2)
tax_amount      DECIMAL(12,2)
discount        DECIMAL(12,2)
total_amount    DECIMAL(12,2)
notes           TEXT
created_by      TEXT REFERENCES users(id)
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### `purchase_order_items`
```sql
id              TEXT PRIMARY KEY
po_id           TEXT REFERENCES purchase_orders(id)
item_id         TEXT REFERENCES inventory_items(id)
ordered_qty     DECIMAL(10,3)
received_qty    DECIMAL(10,3) DEFAULT 0
unit_price      DECIMAL(10,2)
total_price     DECIMAL(10,2)
```

#### `sales` (POS invoices)
```sql
id              TEXT PRIMARY KEY
invoice_no      TEXT UNIQUE
customer_id     TEXT REFERENCES customers(id)
sale_date       TIMESTAMP
subtotal        DECIMAL(12,2)
discount        DECIMAL(12,2)
tax_amount      DECIMAL(12,2)
total_amount    DECIMAL(12,2)
amount_paid     DECIMAL(12,2)
payment_method  TEXT    -- CASH | CARD | UPI | CREDIT
status          TEXT    -- COMPLETED | PARTIAL | CANCELLED
notes           TEXT
created_by      TEXT REFERENCES users(id)
created_at      TIMESTAMP
```

#### `sale_items`
```sql
id              TEXT PRIMARY KEY
sale_id         TEXT REFERENCES sales(id)
item_id         TEXT REFERENCES inventory_items(id)
item_name       TEXT        -- denormalized
quantity        DECIMAL(10,3)
unit_price      DECIMAL(10,2)
discount        DECIMAL(10,2) DEFAULT 0
total_price     DECIMAL(10,2)
```

#### `ledger_entries`
```sql
id              TEXT PRIMARY KEY
entity_type     TEXT    -- SUPPLIER | CUSTOMER
entity_id       TEXT
transaction_type TEXT   -- PURCHASE | PAYMENT | SALE | RECEIPT | ADJUSTMENT
reference_id    TEXT
debit           DECIMAL(12,2) DEFAULT 0
credit          DECIMAL(12,2) DEFAULT 0
balance         DECIMAL(12,2)
notes           TEXT
created_by      TEXT REFERENCES users(id)
created_at      TIMESTAMP
```

### 4.3 Batch / Expiry Tracking

#### `batch_info`
```sql
id              TEXT PRIMARY KEY
item_id         TEXT REFERENCES inventory_items(id)
warehouse_id    TEXT
batch_number    TEXT NOT NULL
manufacture_date DATE
expiry_date     DATE
quantity        DECIMAL(10,3)
unit_cost       DECIMAL(10,2)
supplier_id     TEXT
notes           TEXT
created_at      TIMESTAMP
```

### 4.4 App Settings

#### `app_settings`
```sql
id              TEXT PRIMARY KEY DEFAULT 'singleton'
company_name    TEXT
currency        TEXT DEFAULT 'INR'
currency_symbol TEXT DEFAULT '₹'
timezone        TEXT DEFAULT 'Asia/Kolkata'
date_format     TEXT DEFAULT 'dd/MM/yyyy'
low_stock_threshold DECIMAL DEFAULT 10
pin_lock_minutes    INTEGER DEFAULT 10
sync_api_url    TEXT
sync_enabled    BOOLEAN DEFAULT false
```

---

## 5. Feature Modules

### 5.1 Dashboard

**Route:** `/` or `/dashboard`  
**Access:** All roles

Display cards and charts summarizing the current state:

| Card | Data |
|------|------|
| Total Items | Count of active inventory items |
| Total Quantity | Sum of all stock quantities |
| Low Stock Items | Items where total quantity ≤ reorder_level |
| Warehouses | Count of active warehouses |

**Charts:**
- **Category Distribution** — Pie/donut chart of item count by category.
- **Stock Movement (Last 7 Days)** — Bar chart: Stock In vs Stock Out per day.
- **Top 10 Items by Value** — Horizontal bar chart (quantity × cost_price).
- **Expiry Alerts** — Items expiring in next 30/60/90 days.

**Widgets:**
- Recent Transactions (last 10 stock movements).
- Low Stock Alerts list (items below reorder level).
- Dead Stock Warning (items with zero movement in 60+ days).

---

### 5.2 Inventory Management

**Route:** `/inventory`  
**Access:** All roles (viewer: read-only)

#### List View
- Table with columns: SKU, Name, Category, Unit, Total Qty, Cost Price, Selling Price, Reorder Level, Status.
- Search by name, SKU, barcode, category.
- Filter by category, stock status (in-stock / low / out).
- Sort by any column.
- Pagination (50 rows per page).

#### Add Item
Fields:
- Name (required)
- SKU (required, auto-generate from name if blank, format: `ITEM-XXXXXX`)
- Barcode (optional, scan or manual entry)
- Category (dropdown + create new)
- Unit (pieces / kg / litres / boxes / metres / custom)
- Cost Price
- Selling Price
- Reorder Level
- Minimum Stock Level
- Description
- HSN Code (for GST)
- Brand

#### Edit Item
Same fields as Add. Show stock history.

#### Item Detail View
- Item info card.
- Stock by warehouse (table: Warehouse | Location | Quantity | Batch | Expiry).
- Movement history (last 50 movements).
- Batch list.

#### Import/Export
- Export to Excel (.xlsx) and CSV.
- Import from CSV/Excel (template provided, validate before import).

---

### 5.3 Warehouse Management

**Route:** `/warehouses`  
**Access:** admin, manager

#### Warehouse List
- Cards showing warehouse name, code, city, location count, total stock value.
- Add / Edit / Deactivate warehouses.

#### Warehouse Form Fields
- Name (required)
- Code (auto-generated as `WH-<FIRST4CHARS>`, editable)
- Address, City, State, Postal Code, Country
- Contact Person, Phone, Email

#### Storage Locations
- Each warehouse has a tree of **Zones → Racks → Cells**.
- Location code format: `<Zone>-<Row>-<Col>` e.g. `A-01-03`.
- CRUD on zones, racks, cells.
- Cell capacity (optional).

---

### 5.4 Stock Locations

**Route:** `/stock-locations`  
**Access:** staff, manager, admin

Searchable table of all stock locations across all warehouses:

| Column | Description |
|--------|-------------|
| Location Code | e.g. A-01-03 |
| Warehouse | Warehouse name |
| Zone | Zone name |
| Item | Item name / SKU |
| Quantity | Current quantity |
| Batch | Batch number |
| Expiry | Expiry date (highlighted if <30 days) |

Filters: Warehouse, Zone, Item, show only occupied cells.

---

### 5.5 Cell Stock View (Grid)

**Route:** `/cell-stock-view`  
**Access:** staff, manager, admin

Visual grid representation of a selected warehouse's cells:

- Warehouse selector (dropdown).
- Zone selector (tabs).
- Grid of cells color-coded:
  - 🟢 Green = has stock
  - 🔴 Red = empty
  - 🟡 Yellow = low stock (quantity ≤ reorder level)
  - ⚫ Gray = inactive/disabled
- Click a cell → popup showing: Item Name, SKU, Quantity, Batch, Expiry.
- Cell correction: admin/staff can directly edit cell quantity from popup.

---

### 5.6 Stock Adjustments

**Route:** `/adjustments`  
**Access:** staff, manager, admin

#### Adjustment List
- Table: Date, Item, Warehouse, Cell, Before Qty, Adjusted Qty, After Qty, Type, Status, By.
- Filter by type, status, date range, warehouse.
- Manager/Admin can approve or reject `Pending` adjustments.

#### New Adjustment Form
Fields:
- Item (searchable dropdown — search by name, SKU, barcode)
- Warehouse (dropdown)
- Cell/Location (dropdown filtered by warehouse)
- Batch Number (optional)
- Expiry Date (optional)
- Adjustment Type (dropdown):
  - Increase — add stock
  - Decrease — remove stock
  - Correction — set exact quantity
  - Damage/Waste — reduce with damage reason
  - Expiry — reduce expired stock
  - Physical Inventory — result of physical count
- Quantity Adjusted (number; for Correction, enter the new absolute quantity)
- Reason (required text)
- Reference Document (optional)
- Notes (optional)

**Calculation rules:**
- `Increase`: `after = before + adjusted`
- `Decrease / Damage / Expiry`: `after = before - adjusted`
- `Correction / Physical`: `after = adjusted` (adjusted IS the new value)

**Approval workflow:**
- Staff creates adjustment → status = `Pending`.
- Manager/Admin reviews → `Approve` or `Reject`.
- On approval: stock is updated in `stock` table, movement record created.

---

### 5.7 Transactions (Stock In / Out)

**Route:** `/transactions`  
**Access:** manager, admin

#### Transaction List
- Filter by type (IN/OUT), warehouse, item, date range.
- Export to Excel/PDF.

#### New Transaction Form
**Stock In:**
- Transaction No (auto-generated: `IN-YYYYMMDD-XXX`)
- Date
- Warehouse
- Location (optional)
- Item (searchable)
- Quantity
- Unit Price
- Batch Number / Expiry Date (optional)
- Reference (PO number, invoice, etc.)
- Notes

**Stock Out:**
- Same fields, type = OUT.
- Cannot out more than available quantity (validate server-side).

---

### 5.8 Daily Transaction Log

**Route:** `/daily-log`  
**Access:** staff, manager, admin

Calendar-based view of all stock movements:
- Date picker (default: today).
- Table for selected day: Time, Item, Warehouse, Type, Qty, By.
- Summary card: Total IN qty, Total OUT qty, Net change, Transactions count.
- Click a row → movement detail panel.

---

### 5.9 Reports & Analytics

**Route:** `/reports`  
**Access:** manager, admin

#### Available Reports

| Report | Description |
|--------|-------------|
| Stock Summary | Current stock by warehouse, item, category |
| Stock Valuation | Total stock value (qty × cost price) |
| Movement Report | Filtered movements by date range |
| Low Stock Report | Items below reorder level |
| Dead Stock Report | Items with no movement in N days (configurable, default 60) |
| Expiry Report | Batches expiring in next 30/60/90 days |
| Adjustment Report | All adjustments in date range with approval status |
| Category Analysis | Stock and value breakdown by category |
| Warehouse Utilization | Stock count and value per warehouse |
| Supplier Purchase History | PO history by supplier |
| Customer Sales History | Sales by customer |

**Export options:** PDF, Excel for every report.

---

### 5.10 Supplier Management

**Route:** `/suppliers`  
**Access:** manager, admin

#### Supplier List
Table: Code, Name, Contact, Phone, GSTIN, Credit Balance, Status.

#### Supplier Form Fields
- Code (auto-generated: `SUP-XXXX`)
- Name (required)
- Contact Person, Phone, Email
- Address, City, State
- GSTIN
- Credit Limit
- Payment Terms (days)
- Notes

#### Supplier Detail
- Info card.
- Ledger balance.
- Purchase order history.

---

### 5.11 Customer Management

**Route:** `/customers`  
**Access:** manager, admin

#### Customer Form Fields
- Code (auto-generated: `CUS-XXXX`)
- Name (required)
- Phone, Email
- Address, City
- GSTIN
- Credit Limit
- Loyalty Points

#### Customer Detail
- Info card.
- Ledger balance.
- Purchase history (sales).
- Loyalty points balance.

---

### 5.12 Purchase Orders

**Route:** `/purchase-orders`  
**Access:** manager, admin

#### PO List
Table: PO Number, Supplier, Date, Expected Date, Status, Total Amount.

Statuses: `DRAFT → SENT → PARTIAL → RECEIVED | CANCELLED`

#### New PO Form
- PO Number (auto-generated: `PO-YYYYMMDD-XXX`)
- Supplier (dropdown)
- Order Date, Expected Delivery Date
- Line Items table:
  - Item (searchable dropdown)
  - Ordered Qty
  - Unit Price
  - Total (auto-calculated)
- Notes
- Subtotal / Tax / Discount / Total (auto-calculated footer)

#### Receive PO
- Mark PO as received.
- For each line item, enter received quantity.
- On save: create Stock IN transactions for all received items.
- If partial: status = `PARTIAL`.
- Print/export PO as PDF.

---

### 5.13 POS / Retail Billing

**Route:** `/pos`  
**Access:** staff, manager, admin

#### Billing Interface
Two-column layout:
- **Left:** Cart
- **Right:** Item search / barcode scan

**Cart:**
- Item rows: Name, Qty (editable), Unit Price (editable), Discount, Total.
- Remove item button.
- Cart total: Subtotal, Discount, Tax, Grand Total.
- Customer selector (optional — search by name/phone).

**Item Search:**
- Search by name, SKU, barcode.
- Show matching items with current stock.
- Click to add to cart.
- Barcode scanner (web camera) support.

**Payment Panel:**
- Payment method: Cash / Card / UPI / Credit.
- Amount paid (cash → calculate change).
- Complete Sale button.

**After Sale:**
- Reduce stock automatically.
- Create sale record.
- Print invoice (thermal 80mm or A4).

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `F2` | Focus barcode field |
| `F4` | Clear cart |
| `F8` | Open payment / checkout |
| `Esc` | Cancel |

---

### 5.14 Ledger & Accounting

**Route:** `/ledger`  
**Access:** manager, admin

Two sub-tabs: **Supplier Ledger** and **Customer Ledger**

**Supplier Ledger:**
- Select supplier.
- Table: Date, Type, Reference, Debit, Credit, Balance.
- Record payment button (enter payment amount → credit entry).
- Export to PDF.

**Customer Ledger:**
- Select customer.
- Same table.
- Record receipt button.

---

### 5.15 POS Data Import

**Route:** `/settings` → "POS Data Import" section  
**Access:** admin

Two modes to import external POS data into TracInvent:

**Mode 1: Network (API)**
- Enter API URL.
- Enter API Key.
- Click "Fetch & Preview" — calls external endpoint, shows preview table.
- Click "Import" — merges data.

**Mode 2: Manual JSON Upload**
- File picker → `.json` file.
- Preview parsed data.
- Import.

**Expected JSON format for import:**
```json
{
  "products": [
    { "sku": "SKU001", "name": "Item Name", "category": "Cat",
      "unit": "pcs", "cost_price": 100, "selling_price": 150,
      "barcode": "8901234567890" }
  ],
  "stock": [
    { "sku": "SKU001", "warehouse": "Main", "quantity": 50 }
  ],
  "sales": [
    { "invoice_no": "INV001", "date": "2024-01-01",
      "items": [{ "sku": "SKU001", "qty": 2, "price": 150 }],
      "total": 300, "payment_method": "CASH" }
  ]
}
```

---

### 5.16 User Management

**Route:** `/settings/users`  
**Access:** admin only

#### User List
Table: Name, Username, Role (badge), Has PIN, Status, Actions.

Role badge colors:
- Admin → Blue
- Manager → Purple
- Staff → Green
- Viewer → Gray

#### Add User Dialog
Fields: Full Name, Username/Email, Password (min 6 chars), Role (dropdown).

#### Edit User Dialog
Fields: Full Name, Role (cannot change own role), New Password (optional).

#### Delete User
Soft-delete (set `is_deleted = true`). Cannot delete yourself.

---

### 5.17 Settings

**Route:** `/settings`  
**Access:** admin only

#### Sections:

**Company Settings**
- Company Name
- Currency (dropdown: INR, USD, EUR, GBP, AED)
- Currency Symbol
- Timezone
- Date Format

**Inventory Settings**
- Low Stock Threshold (default 10)
- Dead Stock Days (default 60)

**Security Settings**
- PIN Lock After (minutes: 5, 10, 15, 30, Never)

**Sync Settings**
- Enable API Sync (toggle)
- API Server URL
- API Key
- Test Connection button

**Database**
- Export database backup (downloads `.sql` file)
- Import backup

---

## 6. Business Rules

### Stock Quantity
- Stock can never go negative. If a transaction or adjustment would make stock negative, block it with an error message.
- Stock is tracked at the level of: **Item + Warehouse + Location (cell)**.

### Barcode
- If barcode is EAN-8 or EAN-13, validate checksum before saving.
- If invalid checksum, fall back to Code128 (no checksum required).

### Auto-Generated Codes
| Entity | Format | Example |
|--------|--------|---------|
| SKU | `ITEM-<6 random alphanumeric>` | `ITEM-A3F7K2` |
| Warehouse Code | `WH-<FIRST4CHARS_UPPERCASE>` | `WH-MAIN` |
| Supplier Code | `SUP-<4 digit sequence>` | `SUP-0001` |
| Customer Code | `CUS-<4 digit sequence>` | `CUS-0042` |
| PO Number | `PO-YYYYMMDD-XXX` | `PO-20240115-001` |
| Transaction No | `IN-YYYYMMDD-XXX` or `OUT-YYYYMMDD-XXX` | `IN-20240115-003` |
| Invoice No | `INV-YYYYMMDD-XXX` | `INV-20240115-007` |

### Adjustment Approval
- `staff` creates → `Pending`.
- `manager` or `admin` approves → stock updated, movement logged.
- Rejected adjustments do NOT change stock.
- Admin can approve their own adjustments.

### Dead Stock
- Item is "dead stock" if its last stock movement date is older than the configured threshold (default 60 days).

### Expiry
- Items expiring within 30 days: show orange warning.
- Items already expired: show red warning.
- Filter these in Reports > Expiry Report.

### Low Stock
- `low stock` = total quantity across all warehouses ≤ `reorder_level`.
- `out of stock` = total quantity = 0.

---

## 7. API Design (REST)

Base URL: `/api/v1`

### Authentication

```
POST /api/v1/auth/setup          — First-run admin creation
POST /api/v1/auth/login          — Login, returns JWT
POST /api/v1/auth/refresh        — Refresh token
POST /api/v1/auth/logout         — Invalidate refresh token
GET  /api/v1/auth/me             — Get current user profile
POST /api/v1/auth/pin/verify     — Verify PIN for lock screen
POST /api/v1/auth/pin/set        — Set/update PIN
```

### Users (admin only)

```
GET    /api/v1/users             — List all users
POST   /api/v1/users             — Create user
PUT    /api/v1/users/:id         — Update user (name, role, password)
DELETE /api/v1/users/:id         — Soft-delete user
```

### Inventory

```
GET    /api/v1/inventory                  — List items (paginated, filterable)
POST   /api/v1/inventory                  — Create item
GET    /api/v1/inventory/:id              — Get item detail + stock by location
PUT    /api/v1/inventory/:id              — Update item
DELETE /api/v1/inventory/:id              — Soft-delete
GET    /api/v1/inventory/:id/movements    — Movement history
POST   /api/v1/inventory/import           — Bulk import from CSV/JSON
GET    /api/v1/inventory/export           — Export CSV/Excel
```

### Warehouses

```
GET    /api/v1/warehouses                    — List
POST   /api/v1/warehouses                    — Create
PUT    /api/v1/warehouses/:id                — Update
DELETE /api/v1/warehouses/:id                — Deactivate
GET    /api/v1/warehouses/:id/locations      — Get all locations in warehouse
POST   /api/v1/warehouses/:id/locations      — Add location
PUT    /api/v1/warehouses/:id/locations/:lid — Update location
```

### Stock

```
GET  /api/v1/stock                           — All stock (filterable by warehouse, item)
GET  /api/v1/stock/locations                 — Stock by location
GET  /api/v1/stock/cell-view?warehouse_id=   — Grid data for cell view
PUT  /api/v1/stock/cell/:id                  — Direct cell stock correction (admin/staff)
```

### Adjustments

```
GET    /api/v1/adjustments          — List (filterable)
POST   /api/v1/adjustments          — Create new adjustment
GET    /api/v1/adjustments/:id      — Get detail
PUT    /api/v1/adjustments/:id/approve  — Approve (manager/admin)
PUT    /api/v1/adjustments/:id/reject   — Reject (manager/admin)
```

### Transactions

```
GET  /api/v1/transactions           — List (filterable)
POST /api/v1/transactions           — Create Stock IN or OUT
GET  /api/v1/transactions/daily     — Daily log (by date)
```

### Suppliers

```
GET    /api/v1/suppliers
POST   /api/v1/suppliers
PUT    /api/v1/suppliers/:id
GET    /api/v1/suppliers/:id/ledger
POST   /api/v1/suppliers/:id/payment
```

### Customers

```
GET    /api/v1/customers
POST   /api/v1/customers
PUT    /api/v1/customers/:id
GET    /api/v1/customers/:id/ledger
POST   /api/v1/customers/:id/receipt
```

### Purchase Orders

```
GET    /api/v1/purchase-orders
POST   /api/v1/purchase-orders
GET    /api/v1/purchase-orders/:id
PUT    /api/v1/purchase-orders/:id
POST   /api/v1/purchase-orders/:id/receive    — Receive items (creates stock IN)
GET    /api/v1/purchase-orders/:id/pdf        — Download PDF
```

### Sales (POS)

```
GET    /api/v1/sales
POST   /api/v1/sales                          — Complete sale (reduces stock)
GET    /api/v1/sales/:id
GET    /api/v1/sales/:id/invoice              — Download invoice PDF
```

### Reports

```
GET /api/v1/reports/stock-summary
GET /api/v1/reports/stock-valuation
GET /api/v1/reports/movements?from=&to=
GET /api/v1/reports/low-stock
GET /api/v1/reports/dead-stock?days=60
GET /api/v1/reports/expiry?days=30
GET /api/v1/reports/adjustments?from=&to=
```

All report endpoints accept `?format=json|excel|pdf`.

### Settings

```
GET  /api/v1/settings
PUT  /api/v1/settings
POST /api/v1/settings/test-sync         — Test API sync connection
POST /api/v1/pos-import/network         — Import from network URL
POST /api/v1/pos-import/json            — Import from uploaded JSON file
GET  /api/v1/backup                     — Download database backup
```

---

## 8. UI/UX Guidelines

### Layout
- **Sidebar navigation** (280px wide, fixed) + main content area.
- Sidebar collapses to icon-only on small screens.
- Sidebar sections match the desktop app:
  - (No section label) — Dashboard, Inventory
  - STOCK TRACKING — Stock Locations, Cell Stock View, Daily Log
  - ADJUSTMENTS — Adjustments & Batches
  - MANAGEMENT — Warehouses, Stock In/Out, Reports
  - TOOLS — QR/Barcode Scanner
  - SYSTEM — Settings (admin only)
- Bottom of sidebar: user profile card (avatar with initial, name, role badge, logout button).
- Online/Offline indicator (green "Online" / red "Offline" pill) above user profile.

### Colors
| Token | Hex |
|-------|-----|
| Primary | `#2563EB` |
| Primary Light | `#EFF6FF` |
| Text Dark | `#0F172A` |
| Text Mid | `#475569` |
| Text Light | `#94A3B8` |
| Border | `#E2E8F0` |
| Background | `#F8FAFC` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |
| Role Admin | `#2563EB` |
| Role Manager | `#7C3AED` |
| Role Staff | `#059669` |
| Role Viewer | `#6B7280` |

### Typography
- Font: **Inter** (Google Fonts).
- Table headers: 11px, uppercase, `#94A3B8`, letter-spacing 0.5px.
- Body text: 14px, `#475569`.
- Card titles: 16–18px, bold, `#0F172A`.

### Component Patterns
- **Cards** — white background, 1px border `#E2E8F0`, 12px border radius, 2px elevation.
- **Tables** — zebra striping optional, row hover highlight `#F8FAFC`.
- **Buttons** — Primary: blue filled. Secondary: outlined. Danger: red filled.
- **Search fields** — left icon, placeholder "Search...".
- **Status badges** — colored pills (rounded, small text, colored background at 10% opacity).
- **Empty states** — centered icon + message when table has no rows.
- **Loading** — centered spinner (`CircularProgressIndicator` equivalent).

### Responsive
- Mobile (< 768px): sidebar hidden, hamburger menu opens it as a drawer.
- Tablet (768–1024px): sidebar collapsed to icons only.
- Desktop (> 1024px): full sidebar visible.

---

## 9. Non-Functional Requirements

### Performance
- Page load (first paint): < 2 seconds on 4G.
- API responses: < 300ms for list queries, < 100ms for single-item reads.
- Dashboard loads in < 1 second (parallelize API calls).
- Tables handle 10,000+ rows with server-side pagination.

### Security
- All API endpoints require JWT (except `/auth/login` and `/auth/setup`).
- Role checks enforced **on the server** (never trust client-side only).
- Passwords hashed with SHA-256 + salt (matching desktop format).
- PIN hashed with SHA-256 + salt.
- HTTPS only in production.
- Rate limit: 10 login attempts per minute per IP.
- CORS: restrict to known origins in production.
- SQL injection prevention: use parameterized queries / ORM only.

### Offline / Sync
- Basic offline support (read-only from service worker cache) is nice-to-have in v1.
- Full offline write support is out of scope for v1.

### Browser Support
- Chrome 100+, Firefox 100+, Edge 100+, Safari 16+.
- Internet Explorer: not supported.

### Accessibility
- All interactive elements must be keyboard-navigable.
- ARIA labels on icon-only buttons.
- Color contrast ratio ≥ 4.5:1.

### Data Integrity
- All writes go through transactions (DB transactions).
- Soft-delete only: nothing is permanently deleted.
- Audit trail: all stock changes logged in `stock_movements`.

### Import/Export Compatibility
- Excel exports must be compatible with Microsoft Excel 2016+.
- JSON import must be tolerant of missing optional fields.

---

## Appendix A — Sidebar Navigation Map

```
TracInvent (logo)
│
├── Dashboard                    (all roles)
├── Inventory                    (all roles)
│
├── ── STOCK TRACKING ──
├── Stock Locations              (staff+)
├── Cell Stock View              (staff+)
├── Daily Log                    (staff+)
│
├── ── ADJUSTMENTS ──
├── Adjustments & Batches        (staff+)
│
├── ── MANAGEMENT ──
├── Warehouses                   (manager+)
├── Stock In/Out                 (manager+)
├── Reports                      (manager+)
│
├── ── TOOLS ──
├── QR/Barcode Scanner           (staff+)
│
└── ── SYSTEM ──
    ├── Settings                 (admin only)
    └── User Management          (admin only)
```

---

## Appendix B — Key Screens Quick Reference

| Screen | Desktop Route | Web Route | Primary Action |
|--------|--------------|-----------|----------------|
| First Setup | (auto on first run) | `/setup` | Create admin |
| Login | (auth gate) | `/login` | Sign in |
| PIN Lock | (overlay) | Modal overlay | Enter PIN |
| Dashboard | index 0 | `/` | View KPIs |
| Inventory | index 1 | `/inventory` | Manage items |
| Stock Locations | index 3 | `/stock-locations` | Browse stock |
| Cell Stock View | index 4 | `/cell-view` | Visual grid |
| Daily Log | index 5 | `/daily-log` | Day's movements |
| Adjustments | index 6 | `/adjustments` | Adjust stock |
| Warehouses | index 7 | `/warehouses` | Manage WH |
| Stock In/Out | index 8 | `/transactions` | Add transaction |
| Reports | index 9 | `/reports` | Analytics |
| Settings | index 10 | `/settings` | App config |
| QR Scanner | index 11 | `/scanner` | Scan items |
| User Management | (push nav) | `/settings/users` | Manage users |
| Suppliers | (settings hub) | `/suppliers` | Supplier list |
| Customers | (settings hub) | `/customers` | Customer list |
| Purchase Orders | (settings hub) | `/purchase-orders` | PO list |
| POS Billing | (settings hub) | `/pos` | Make a sale |
| Ledger | (settings hub) | `/ledger` | Account ledger |

---

*End of specification. For questions about the desktop app behavior, refer to the source at `desktop-apps/tracinvent/` in the BillEase Suite monorepo.*
