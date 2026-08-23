# TracInvent — Phase 1 Retail Module

Production-oriented retail layer for FMCG, grocery, electronics, and electrical shops. Built on the existing WMS/inventory stack with **Provider + Service + Repository** architecture and **SQLite schema v3**.

---

## 1. Schema (DB v3)

**Migration:** `WmsSchema.version = 3` → `RetailSchema.createTables()` on create and `DatabaseManager._migrateV2ToV3()`.

| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier master — contact, GSTIN, credit limit/balance |
| `customers` | Customer master — mobile, GSTIN, type, outstanding balance |
| `purchase_orders` | PO header — supplier, warehouse, status, amounts, invoice ref |
| `purchase_order_lines` | PO lines — item, ordered/received qty, cost, tax |
| `sales_invoices` | POS/GST invoice header — customer, payment mode/status, GST totals |
| `sale_lines` | Invoice line items with tax breakdown |
| `ledger_entries` | Party ledger (customer/supplier) — debit/credit, running balance |
| `stock_reservations` | Reserved stock for pending orders |
| `stocks.reservedQty` | Column added — available = quantity − reservedQty |

**Indexes:** party codes, phones, PO/sale dates, ledger party+date, reservation item+warehouse.

**Sequences:** `PO`, `SALE`, `SUPPLIER`, `CUSTOMER` document numbering.

---

## 2. Architecture

```
Screens (retail/*)
    ↓
Providers (retail_providers.dart)
    ↓
Services (purchase_service, sale_service, ledger_service, stock_control_service, sequence_service)
    ↓
Repositories (party_repository.dart)
    ↓
DatabaseManager → tracinvent.db
```

| Layer | Files |
|-------|-------|
| Schema | `lib/data/database/retail_schema.dart`, `wms_schema.dart` (v3) |
| Models | `lib/models/retail_models.dart` |
| Repositories | `lib/data/repositories/party_repository.dart` |
| Services | `lib/services/purchase_service.dart`, `sale_service.dart`, `ledger_service.dart`, `stock_control_service.dart`, `sequence_service.dart` |
| Providers | `lib/providers/retail_providers.dart` |
| Screens | `lib/screens/retail/*.dart` |

---

## 3. Feature map

| Feature | Screen | Service |
|---------|--------|---------|
| Supplier CRUD | `suppliers_screen.dart` | `SupplierRepository` |
| Customer CRUD | `customers_screen.dart` | `CustomerRepository` |
| Purchase orders | `purchase_orders_screen.dart` | `PurchaseService` |
| Receive stock | PO screen → Receive | `PurchaseService.receiveOrder()` + `StockControlService.stockIn()` |
| POS billing | `pos_billing_screen.dart` | `SaleService.completeSale()` |
| Credit ledger | `ledger_screen.dart` | `LedgerService` + `SaleService.recordCustomerPayment()` |
| Reports | `reports_screen.dart` (Sales/Purchases/Dues tabs) | `RetailReportsProvider`, `LedgerProvider` |

---

## 4. Stock control algorithm

**Available quantity:**

```
available = SUM(stocks.quantity) - SUM(stocks.reservedQty)
```

**Stock in (purchase receive):** increments `stocks.quantity` (FIFO bin allocation optional).

**Stock out (sale):** `StockControlService.assertAvailable()` → deduct from oldest stock rows; **throws if insufficient** (no negative stock).

**Reservations:** `reserveStock()` increments `reservedQty` + `stock_reservations` row; `releaseReservation()` reverses.

**Fix applied:** `InventoryProvider.addTransaction()` now delegates to `StockControlService` instead of allowing negative quantities.

---

## 5. Transaction handling

All retail writes use **SQLite transactions** (`db.transaction`):

### Purchase receive
1. Update `purchase_order_lines.receivedQty`
2. `StockControlService.stockIn()` per line
3. Update PO status (`partial` / `received`)
4. If due > 0 → `LedgerService.recordSupplierPurchase()` + supplier `creditBalance`

### POS sale
1. Validate available stock for each cart line
2. Insert `sales_invoices` + `sale_lines`
3. `StockControlService.stockOut()` per line
4. Insert legacy `transactions` row (audit compat)
5. If credit due → update customer `outstandingBalance` + ledger entry

### Customer payment
1. Decrease `customers.outstandingBalance`
2. Insert `ledger_entries` (credit)

---

## 6. POS UX

| Shortcut | Action |
|----------|--------|
| **F8** | Focus barcode field |
| **F2** | Clear cart |
| **F4** | Complete sale |

**Payment modes:** cash, UPI, card, credit, split.

**Barcode flow:** scan/enter SKU or barcode → lookup `inventory_items` → add/increment cart line → GST from `taxRate`.

---

## 7. Sample code — complete sale

```dart
final invoice = await SaleService().completeSale(
  warehouseId: warehouseId,
  cart: posCartItems,
  customerId: customer?.id,
  customerName: customer?.name,
  paymentMode: 'cash',
  paidAmount: grandTotal,
);
```

## 8. Sample code — receive PO

```dart
await PurchaseService().receiveOrder(
  purchaseOrderId: poId,
  receiveQtyByLineId: {lineId: qty},
  paidAmount: 0,
  invoiceNumber: 'SUP-INV-001',
);
```

## 9. Sample UI flow

```
Sidebar → POS Billing
  → Scan barcode → Cart builds
  → Select warehouse + payment mode
  → F4 Complete → Invoice saved, stock deducted

Sidebar → Purchase Orders → New PO
  → Select supplier + item + qty
  → Receive → Stock updated in warehouse

Sidebar → Credit & Ledger
  → Customer Dues tab → tap customer → ledger history
  → Payment tab → record partial payment
```

---

## 10. Navigation indices

| Index | Screen |
|-------|--------|
| 12 | POS Billing |
| 13 | Suppliers |
| 14 | Customers |
| 15 | Purchase Orders |
| 16 | Credit & Ledger |

---

## 11. Mobile sync compatibility

All retail tables include:
- `syncStatus TEXT DEFAULT 'local'`
- `serverId TEXT` (nullable)

Payload-friendly flat structures mirror BillEase POS export shapes for future sync adapter.

---

## 12. Phase 2 recommendations

- GST invoice PDF (`pdf` package) with HSN breakdown
- Multi-line PO editor and supplier payment vouchers
- Unify WMS `stock` table with legacy `stocks`
- Port BillEase POS receipt printer integration
- Role gates on retail screens (cashier vs admin)
