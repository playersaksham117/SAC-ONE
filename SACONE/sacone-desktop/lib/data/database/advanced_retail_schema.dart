import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Phase 2 advanced retail — serial, warranty, pricing, offers, loyalty, WMS optimization.
class AdvancedRetailSchema {
  static Future<void> createTables(Database db) async {
    await _migrateInventoryItemColumns(db);
    await _migrateCustomerColumns(db);
    await _createSerialNumbersTable(db);
    await _createSaleSerialMappingsTable(db);
    await _createSerialReturnsTable(db);
    await _createItemWarrantyConfigTable(db);
    await _createWarrantyRecordsTable(db);
    await _createWarrantyServiceLogsTable(db);
    await _createPriceTiersTable(db);
    await _createCustomerPriceTiersTable(db);
    await _createOffersTable(db);
    await _createCouponsTable(db);
    await _createLoyaltyAccountsTable(db);
    await _createLoyaltyTransactionsTable(db);
    await _createWarehousePickingConfigTable(db);
    await _createAuditEventsTable(db);
    await _createIndices(db);
  }

  static Future<void> _migrateInventoryItemColumns(Database db) async {
    final info = await db.rawQuery('PRAGMA table_info(inventory_items)');
    final cols = info.map((c) => c['name'] as String).toSet();
    if (!cols.contains('trackSerial')) {
      await db.execute('ALTER TABLE inventory_items ADD COLUMN trackSerial INTEGER NOT NULL DEFAULT 0');
    }
    if (!cols.contains('warrantyMonths')) {
      await db.execute('ALTER TABLE inventory_items ADD COLUMN warrantyMonths INTEGER NOT NULL DEFAULT 0');
    }
    if (!cols.contains('defaultPriceTier')) {
      await db.execute("ALTER TABLE inventory_items ADD COLUMN defaultPriceTier TEXT NOT NULL DEFAULT 'retail'");
    }
  }

  static Future<void> _migrateCustomerColumns(Database db) async {
    final info = await db.rawQuery('PRAGMA table_info(customers)');
    final cols = info.map((c) => c['name'] as String).toSet();
    if (!cols.contains('priceTier')) {
      await db.execute("ALTER TABLE customers ADD COLUMN priceTier TEXT NOT NULL DEFAULT 'retail'");
    }
  }

  static Future<void> _createSerialNumbersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS serial_numbers (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        imei TEXT,
        status TEXT NOT NULL DEFAULT 'in_stock',
        warehouseId TEXT,
        stockId TEXT,
        purchaseOrderId TEXT,
        saleInvoiceId TEXT,
        warrantyRecordId TEXT,
        receivedAt TEXT NOT NULL,
        soldAt TEXT,
        returnedAt TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        FOREIGN KEY (itemId) REFERENCES inventory_items(id),
        UNIQUE(serialNumber)
      )
    ''');
  }

  static Future<void> _createSaleSerialMappingsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sale_serial_mappings (
        id TEXT PRIMARY KEY,
        serialId TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        saleInvoiceId TEXT NOT NULL,
        saleLineId TEXT NOT NULL,
        customerId TEXT,
        soldAt TEXT NOT NULL,
        returnedAt TEXT,
        returnValidated INTEGER NOT NULL DEFAULT 0,
        returnReason TEXT,
        FOREIGN KEY (serialId) REFERENCES serial_numbers(id),
        FOREIGN KEY (saleInvoiceId) REFERENCES sales_invoices(id)
      )
    ''');
  }

  static Future<void> _createSerialReturnsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS serial_returns (
        id TEXT PRIMARY KEY,
        serialId TEXT NOT NULL,
        saleInvoiceId TEXT NOT NULL,
        returnDate TEXT NOT NULL,
        isValid INTEGER NOT NULL DEFAULT 1,
        validationNotes TEXT,
        restocked INTEGER NOT NULL DEFAULT 0,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (serialId) REFERENCES serial_numbers(id)
      )
    ''');
  }

  static Future<void> _createItemWarrantyConfigTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS item_warranty_config (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL UNIQUE,
        warrantyMonths INTEGER NOT NULL DEFAULT 12,
        warrantyType TEXT NOT NULL DEFAULT 'manufacturer',
        terms TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createWarrantyRecordsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS warranty_records (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        serialId TEXT,
        serialNumber TEXT,
        customerId TEXT,
        customerName TEXT,
        saleInvoiceId TEXT,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id)
      )
    ''');
  }

  static Future<void> _createWarrantyServiceLogsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS warranty_service_logs (
        id TEXT PRIMARY KEY,
        warrantyRecordId TEXT NOT NULL,
        serviceDate TEXT NOT NULL,
        issueDescription TEXT NOT NULL,
        resolution TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        technician TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (warrantyRecordId) REFERENCES warranty_records(id)
      )
    ''');
  }

  static Future<void> _createPriceTiersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS price_tiers (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        tier TEXT NOT NULL,
        minQty REAL NOT NULL DEFAULT 1,
        unitPrice REAL NOT NULL,
        validFrom TEXT,
        validUntil TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id),
        UNIQUE(itemId, tier, minQty)
      )
    ''');
  }

  static Future<void> _createCustomerPriceTiersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS customer_price_tiers (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id)
      )
    ''');
  }

  static Future<void> _createOffersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        offerType TEXT NOT NULL,
        configJson TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createCouponsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        offerId TEXT,
        discountType TEXT NOT NULL DEFAULT 'percent',
        discountValue REAL NOT NULL DEFAULT 0,
        minPurchase REAL NOT NULL DEFAULT 0,
        maxUses INTEGER NOT NULL DEFAULT 0,
        usedCount INTEGER NOT NULL DEFAULT 0,
        validFrom TEXT NOT NULL,
        validUntil TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (offerId) REFERENCES offers(id)
      )
    ''');
  }

  static Future<void> _createLoyaltyAccountsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS loyalty_accounts (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL UNIQUE,
        pointsBalance REAL NOT NULL DEFAULT 0,
        lifetimePoints REAL NOT NULL DEFAULT 0,
        tier TEXT NOT NULL DEFAULT 'standard',
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id)
      )
    ''');
  }

  static Future<void> _createLoyaltyTransactionsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        txnType TEXT NOT NULL,
        points REAL NOT NULL,
        referenceType TEXT,
        referenceId TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id)
      )
    ''');
  }

  static Future<void> _createWarehousePickingConfigTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS warehouse_picking_config (
        id TEXT PRIMARY KEY,
        warehouseId TEXT NOT NULL,
        zoneId TEXT,
        cellId TEXT,
        locationCode TEXT,
        pickingPriority INTEGER NOT NULL DEFAULT 50,
        isFastMovingZone INTEGER NOT NULL DEFAULT 0,
        velocityScore REAL NOT NULL DEFAULT 0,
        lastOptimizedAt TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
      )
    ''');
  }

  static Future<void> _createAuditEventsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT,
        userId TEXT,
        payloadJson TEXT,
        createdAt TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createIndices(Database db) async {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_serial_item ON serial_numbers(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_serial_number ON serial_numbers(serialNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_serial_status ON serial_numbers(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_serial_imei ON serial_numbers(imei)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sale_serial_invoice ON sale_serial_mappings(saleInvoiceId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warranty_customer ON warranty_records(customerId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warranty_serial ON warranty_records(serialNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warranty_end ON warranty_records(endDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_price_tier_item ON price_tiers(itemId, tier)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(isActive, startDate, endDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customerId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_picking_wh ON warehouse_picking_config(warehouseId, pickingPriority)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_events(module, createdAt)');
  }
}
