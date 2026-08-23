# TracInvent — Phase 2 Advanced Retail Module

Enterprise-grade extensions for FMCG, electronics, and electrical retail on top of Phase 1 (POS, PO, ledger, suppliers, customers).

**Schema version:** 4 (`AdvancedRetailSchema`)

---

## 1. Database schema additions (v4)

| Table | Feature |
|-------|---------|
| `serial_numbers` | Per-item serial/IMEI with status lifecycle |
| `sale_serial_mappings` | Sale-to-serial mapping |
| `serial_returns` | Return validation audit |
| `item_warranty_config` | Warranty duration per SKU |
| `warranty_records` | Customer warranty instances |
| `warranty_service_logs` | Service/repair tracking |
| `price_tiers` | Retail / wholesale / contractor / bulk prices |
| `customer_price_tiers` | Customer tier assignment |
| `offers` | Buy-X-get-Y, combo, time-based, percent-off |
| `coupons` | Coupon codes with usage limits |
| `loyalty_accounts` | Points balance & tier |
| `loyalty_transactions` | Earn / redeem history |
| `warehouse_picking_config` | Pick priority, fast-moving zones |
| `audit_events` | Cross-module audit trail |

**Column migrations on existing tables:**
- `inventory_items`: `trackSerial`, `warrantyMonths`, `defaultPriceTier`
- `customers`: `priceTier`
- `stocks`: `reservedQty` (from Phase 1)

---

## 2. Service architecture

```
lib/services/
├── serial_tracking_service.dart   # Register, map-to-sale, return validation
├── warranty_service.dart          # Config, auto-create on sale, lookup, service logs
├── pricing_engine.dart            # Tier + qty-break price resolution (reusable)
├── offer_engine.dart              # Offers + coupons at checkout
├── loyalty_service.dart           # Earn on sale, redeem, tier progression
├── expiry_analytics_service.dart  # Near-expiry, FEFO recommendations
├── dead_stock_analytics_service.dart  # Unsold detection, aging buckets
├── warehouse_optimization_service.dart # Velocity scores, pick path
└── audit_service.dart             # audit_events writer
```

**Provider:** `lib/providers/phase2_providers.dart`  
**UI hub:** `lib/screens/retail/advanced_retail_hub_screen.dart` (6 tabs)

---

## 3. Feature logic

### 3.1 Serial number tracking

**Flow:**
1. Register serial on GRN/PO receive → `serial_numbers.status = in_stock`
2. POS sale with serial list → `mapSerialsToSale()` → status `sold`
3. Return → `validateAndProcessReturn()` checks mapping, optional restock

**Lookup:** serial, IMEI, or SKU — indexed search.

### 3.2 Warranty system

**On sale:** `WarrantyService.createWarrantyFromSale()` reads `item_warranty_config` or `inventory_items.warrantyMonths`, sets `startDate` / `endDate`.

**Lookup:** customer name, serial, or item — shows active/expired status.

**Service:** `logService()` on `warranty_service_logs`.

### 3.3 Multi pricing engine

```dart
final price = await PricingEngine.resolveUnitPrice(
  itemId: itemId,
  quantity: qty,
  customerId: customerId, // resolves tier from customer_price_tiers or customers.priceTier
);
```

Tiers: `retail`, `wholesale`, `contractor`, `bulk` with optional `minQty` breaks.

**POS integration:** `PosProvider.addByBarcode()` calls PricingEngine before adding to cart.

### 3.4 Offer & discount engine

| Type | Config JSON |
|------|-------------|
| `percent_off` | `{ "percent": 10 }` |
| `buy_x_get_y` | `{ "buyQty": 2, "freeQty": 1, "itemId": "..." }` |
| `combo` | `{ "itemIds": [...], "discount": 100 }` |
| `time_based` | `{ "startHour": 14, "endHour": 17, "percent": 5 }` |

Coupons: `percent` or `fixed` discount with `minPurchase` and `maxUses`.

**POS:** `PosProvider.recalculateOffers()` before checkout; discount passed to `SaleService.completeSale()`.

### 3.5 Loyalty system

- **Earn:** 1 point per ₹100 on completed sale (customer required)
- **Tiers:** standard → silver (1000) → gold (5000) → platinum (10000 lifetime points)
- **Redeem:** `LoyaltyService.redeemPoints()` (integrate at POS in Phase 2+)

### 3.6 Expiry intelligence

- **Alerts:** stock rows with `expiryDate` within N days
- **FEFO:** `getFefoRecommendations()` orders picks by earliest expiry
- **Dashboard:** expired / ≤7d / 8–30d batch counts

### 3.7 Dead stock analytics

- **Unsold:** on-hand items with no sale in 90+ days
- **Aging buckets:** 0–30, 31–60, 61–90, 90+ days since last sale
- **Tied-up value:** `costPrice × onHand`

### 3.8 Warehouse optimization

- **Velocity:** sold qty last 30 days from `sale_lines`
- **Fast-moving zone:** items with soldQty ≥ 20
- **Pick path:** sort by `isFastMovingZone DESC, pickingPriority ASC, velocityScore DESC`

---

## 4. Stock & sale flow (Phase 2)

```
POS Checkout
  → PricingEngine.resolveUnitPrice (per line)
  → OfferEngine.applyOffers (cart + coupon)
  → StockControlService.assertAvailable
  → Insert sales_invoices + sale_lines
  → StockControlService.stockOut
  → SerialTrackingService.mapSerialsToSale (if serials)
  → WarrantyService.createWarrantyFromSale
  → LoyaltyService.earnFromPurchase
  → LedgerService (if credit)
  → AuditService.log
```

---

## 5. UI structure

| Nav index | Screen | Tabs / sections |
|-----------|--------|-----------------|
| 17 | Advanced Retail Hub | Serial & Warranty, Pricing & Offers, Loyalty, Expiry, Dead Stock, Warehouse |

**POS enhancements:** coupon field, applied offers list, tier-based pricing.

---

## 6. Analytics calculations

**Near expiry days:**
```sql
julianday(expiryDate) - julianday('now')
```

**Dead stock:**
```sql
onHand > 0 AND (lastSaleDate IS NULL OR lastSaleDate < cutoff)
```

**Velocity score:**
```sql
SUM(sale_lines.quantity) WHERE invoiceDate >= last_30_days GROUP BY itemId
```

---

## 7. Migration

- v3 → v4: `DatabaseManager._migrateV3ToV4()` runs `AdvancedRetailSchema.createTables()`
- All DDL uses `IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` guards

**Restart app** after deploy to apply migration.

---

## 8. Phase 3 roadmap

- GST invoice PDF with serial/warranty block
- POS loyalty redeem UI
- Serial capture dialog at POS for tracked items
- Offer builder UI (admin)
- Push expiry alerts to dashboard widget
- Cloud sync payloads for serial/warranty/loyalty tables
