/// ============================================================
/// DATABASE SCHEMA - Production-grade SQLite schema
/// ============================================================
///
/// Defines all tables, indices, and constraints for the WMS.
/// Includes both new WMS tables and legacy compatibility tables
/// for all existing providers and services.
///
/// Architecture: Data Layer
/// ============================================================

import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'retail_schema.dart';
import 'advanced_retail_schema.dart';
import 'licensing_schema.dart';

/// Database schema manager
class WmsSchema {
  static const int version = 5;

  /// Create all tables
  static Future<void> createTables(Database db) async {
    await _createUsersTable(db);
    await _createItemsTable(db);
    await _createInventoryItemsTable(db);   // Legacy compat
    await _createWarehousesTable(db);
    await _createZonesTable(db);            // Legacy compat
    await _createLocationsTable(db);
    await _createCellsTable(db);            // Legacy compat
    await _createStockTable(db);            // New WMS stock table
    await _createStocksLegacyTable(db);     // Legacy stocks table (cellId-based)
    await _createLocationStockTable(db);    // Legacy location_stock table (bin-based)
    await _createMovementsTable(db);        // stock_movements (matches StockMovement model)
    await _createTransactionsTable(db);     // Legacy compat
    await _createStockAdjustmentsTable(db); // stock_adjustments
    await _createBatchInfoTable(db);        // batch_info
    await _createStockTransfersTable(db);   // stock_transfers
    await _createCategoriesTable(db);
    await _createSequencesTable(db);
    await _createAuditLogTable(db);
    await _createSyncQueueTable(db);
    await RetailSchema.createTables(db);
    await AdvancedRetailSchema.createTables(db);
    await LicensingSchema.createTables(db);

    await _createIndices(db);
    await _initializeSequences(db);
  }

  // ==================== USERS TABLE ====================
  static Future<void> _createUsersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        displayName TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        pinHash TEXT,
        role TEXT NOT NULL DEFAULT 'operator',
        assignedWarehouses TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        lastLoginAt TEXT,
        loginAttempts INTEGER NOT NULL DEFAULT 0,
        lockedUntil TEXT,
        passwordChangeRequired INTEGER NOT NULL DEFAULT 0,
        passwordChangedAt TEXT,
        preferences TEXT,
        phone TEXT,
        avatarUrl TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        deletedAt TEXT,
        deletedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  // ==================== ITEMS TABLE (NEW) ====================
  static Future<void> _createItemsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        barcode TEXT,
        category TEXT NOT NULL,
        subCategory TEXT,
        unit TEXT NOT NULL DEFAULT 'PCS',
        brand TEXT,
        manufacturer TEXT,
        hsnCode TEXT,
        costPrice REAL NOT NULL DEFAULT 0,
        sellingPrice REAL NOT NULL DEFAULT 0,
        taxPercent REAL NOT NULL DEFAULT 0,
        reorderLevel REAL NOT NULL DEFAULT 10,
        minimumLevel REAL NOT NULL DEFAULT 5,
        maximumLevel REAL,
        isBatchRequired INTEGER NOT NULL DEFAULT 0,
        isExpiryRequired INTEGER NOT NULL DEFAULT 0,
        isSerialRequired INTEGER NOT NULL DEFAULT 0,
        weight REAL,
        volume REAL,
        dimensionLength REAL,
        dimensionWidth REAL,
        dimensionHeight REAL,
        attributes TEXT,
        imageUrl TEXT,
        notes TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdBy TEXT,
        updatedBy TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        deletedAt TEXT,
        deletedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  // ==================== INVENTORY ITEMS TABLE (LEGACY) ====================
  static Future<void> _createInventoryItemsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT,
        description TEXT,
        category TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        costPrice REAL NOT NULL DEFAULT 0,
        sellingPrice REAL NOT NULL DEFAULT 0,
        reorderLevel REAL NOT NULL DEFAULT 0,
        minStockLevel REAL NOT NULL DEFAULT 0,
        reorderQuantity REAL NOT NULL DEFAULT 0,
        taxRate REAL NOT NULL DEFAULT 0,
        hsn TEXT,
        supplier TEXT,
        brand TEXT,
        imageUrl TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(sku)
      )
    ''');
  }

  // ==================== WAREHOUSES TABLE ====================
  static Future<void> _createWarehousesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        postalCode TEXT,
        country TEXT,
        contactPerson TEXT,
        contactPhone TEXT,
        contactEmail TEXT,
        operatingHours TEXT,
        latitude REAL,
        longitude REAL,
        capacity REAL,
        capacityUnit TEXT,
        description TEXT,
        config TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdBy TEXT,
        updatedBy TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        deletedAt TEXT,
        deletedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  // ==================== ZONES TABLE (LEGACY) ====================
  // code is nullable so Zone model (which has no code field) can insert successfully
  static Future<void> _createZonesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        warehouseId TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT DEFAULT '',
        description TEXT,
        capacity REAL,
        capacityUnit TEXT,
        locationType TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== LOCATIONS TABLE (NEW WMS) ====================
  static Future<void> _createLocationsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        locationType TEXT NOT NULL,
        parentId TEXT,
        warehouseId TEXT NOT NULL,
        row INTEGER,
        column INTEGER,
        level INTEGER,
        capacity REAL,
        capacityUnit TEXT,
        temperatureZone TEXT,
        allowsHazmat INTEGER NOT NULL DEFAULT 0,
        pickingPriority INTEGER NOT NULL DEFAULT 100,
        description TEXT,
        config TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdBy TEXT,
        updatedBy TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        deletedAt TEXT,
        deletedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE CASCADE,
        UNIQUE(warehouseId, code)
      )
    ''');
  }

  // ==================== CELLS TABLE (LEGACY) ====================
  // Includes zoneId for the Zone->Cell hierarchy used in Cell model
  static Future<void> _createCellsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cells (
        id TEXT PRIMARY KEY,
        warehouseId TEXT NOT NULL,
        zoneId TEXT,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        capacity REAL,
        description TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE,
        UNIQUE(warehouseId, code)
      )
    ''');
  }

  // ==================== STOCK TABLE (NEW WMS) ====================
  static Future<void> _createStockTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        locationId TEXT NOT NULL,
        locationType TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        reservedQuantity REAL NOT NULL DEFAULT 0,
        batchNumber TEXT,
        expiryDate TEXT,
        manufacturingDate TEXT,
        serialNumber TEXT,
        lotCostPrice REAL,
        lastCountedAt TEXT,
        lastCountedBy TEXT,
        attributes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  // ==================== STOCKS TABLE (LEGACY - cellId based) ====================
  // Used by InventoryProvider, ReportsProvider, StockOperationsService
  static Future<void> _createStocksLegacyTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stocks (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        cellId TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        batchNumber TEXT,
        serialNumber TEXT,
        expiryDate TEXT,
        lastUpdated TEXT NOT NULL,
        updatedBy TEXT,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== LOCATION STOCK TABLE (LEGACY - bin-based) ====================
  // Used by StockOperationsService for zone/rack/shelf/bin hierarchy
  static Future<void> _createLocationStockTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS location_stock (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        zoneId TEXT,
        rackId TEXT,
        shelfId TEXT,
        binId TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        batchNumber TEXT,
        expiryDate TEXT,
        lastMovementDate TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== STOCK MOVEMENTS TABLE ====================
  // Schema matches StockMovement.toMap() in models/stock_movement.dart
  static Future<void> _createMovementsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        itemSku TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        warehouseName TEXT NOT NULL,
        zoneId TEXT NOT NULL DEFAULT '',
        zoneName TEXT NOT NULL DEFAULT '',
        rackId TEXT NOT NULL DEFAULT '',
        rackName TEXT NOT NULL DEFAULT '',
        shelfId TEXT NOT NULL DEFAULT '',
        shelfName TEXT NOT NULL DEFAULT '',
        binId TEXT NOT NULL DEFAULT '',
        binName TEXT NOT NULL DEFAULT '',
        locationCode TEXT NOT NULL DEFAULT '',
        movementType TEXT NOT NULL,
        quantityBefore REAL NOT NULL,
        quantityChanged REAL NOT NULL,
        quantityAfter REAL NOT NULL,
        referenceNumber TEXT,
        batchNumber TEXT,
        expiryDate TEXT,
        fromWarehouseId TEXT,
        fromLocationCode TEXT,
        reason TEXT,
        notes TEXT,
        performedBy TEXT NOT NULL,
        movementDate TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== TRANSACTIONS TABLE (LEGACY) ====================
  static Future<void> _createTransactionsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        itemId TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        locationId TEXT,
        quantity REAL NOT NULL,
        unitPrice REAL NOT NULL,
        totalAmount REAL NOT NULL,
        referenceNumber TEXT,
        supplier TEXT,
        customer TEXT,
        notes TEXT,
        transactionDate TEXT NOT NULL,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== STOCK ADJUSTMENTS TABLE ====================
  // Used by AdjustmentProvider and AdjustmentService
  static Future<void> _createStockAdjustmentsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        itemSku TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        warehouseName TEXT NOT NULL,
        cellId TEXT,
        cellName TEXT,
        batchNumber TEXT,
        expiryDate TEXT,
        quantityBefore REAL NOT NULL,
        quantityAdjusted REAL NOT NULL,
        quantityAfter REAL NOT NULL,
        adjustmentType TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PND',
        reason TEXT NOT NULL,
        referenceDocument TEXT,
        notes TEXT,
        createdBy TEXT NOT NULL,
        approvedBy TEXT,
        createdAt TEXT NOT NULL,
        approvedAt TEXT,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== BATCH INFO TABLE ====================
  // Used by AdjustmentProvider (BatchService) for batch tracking
  static Future<void> _createBatchInfoTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS batch_info (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        batchNumber TEXT NOT NULL,
        manufacturingDate TEXT,
        expiryDate TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        costPrice REAL NOT NULL DEFAULT 0,
        warehouseId TEXT NOT NULL,
        cellId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE,
        UNIQUE(itemId, batchNumber, warehouseId, cellId)
      )
    ''');
  }

  // ==================== STOCK TRANSFERS TABLE ====================
  // Used by StockTransfer model
  static Future<void> _createStockTransfersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        fromWarehouseId TEXT NOT NULL,
        fromZoneId TEXT,
        fromRackId TEXT,
        fromShelfId TEXT,
        fromBinId TEXT,
        toWarehouseId TEXT NOT NULL,
        toZoneId TEXT,
        toRackId TEXT,
        toShelfId TEXT,
        toBinId TEXT,
        quantity REAL NOT NULL,
        batchNumber TEXT,
        referenceNumber TEXT,
        reason TEXT,
        notes TEXT,
        initiatedBy TEXT NOT NULL,
        approvedBy TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        transferDate TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        completedAt TEXT,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE
      )
    ''');
  }

  // ==================== CATEGORIES TABLE ====================
  static Future<void> _createCategoriesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        description TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(name, parentId)
      )
    ''');
  }

  // ==================== SEQUENCES TABLE ====================
  static Future<void> _createSequencesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sequences (
        name TEXT PRIMARY KEY,
        prefix TEXT NOT NULL,
        currentValue INTEGER NOT NULL DEFAULT 0,
        padding INTEGER NOT NULL DEFAULT 6,
        updatedAt TEXT NOT NULL
      )
    ''');
  }

  // ==================== AUDIT LOG TABLE ====================
  static Future<void> _createAuditLogTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        tableName TEXT NOT NULL,
        recordId TEXT NOT NULL,
        action TEXT NOT NULL,
        oldValues TEXT,
        newValues TEXT,
        userId TEXT,
        userName TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        createdAt TEXT NOT NULL
      )
    ''');
  }

  // ==================== SYNC QUEUE TABLE ====================
  static Future<void> _createSyncQueueTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        tableName TEXT NOT NULL,
        recordId TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        lastAttemptAt TEXT,
        errorMessage TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt TEXT NOT NULL
      )
    ''');
  }

  // ==================== INDICES ====================
  static Future<void> _createIndices(Database db) async {
    // Items (new schema)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_code ON items(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_active ON items(isActive, isDeleted)');

    // inventory_items (legacy)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(isActive)');

    // Cells
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_warehouse ON cells(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_code ON cells(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_zone ON cells(zoneId)');

    // Zones (legacy)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_zones_warehouse ON zones(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_zones_name ON zones(name)');

    // Transactions
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_warehouse ON transactions(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transactionDate)');

    // Stock (new WMS)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_item ON stock(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_expiry ON stock(expiryDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_batch ON stock(batchNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_quantity ON stock(quantity)');

    // Stocks (legacy, cellId-based)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_item ON stocks(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_cell ON stocks(cellId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_item_warehouse ON stocks(itemId, warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_expiry ON stocks(expiryDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_batch ON stocks(batchNumber)');

    // Location stock (legacy, bin-based)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_item ON location_stock(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_warehouse ON location_stock(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_bin ON location_stock(binId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_zone ON location_stock(zoneId)');

    // Locations (new WMS)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parentId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(locationType)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_locations_code ON locations(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(isActive, isDeleted)');

    // Stock movements (matches StockMovement model)
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON stock_movements(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(movementDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movementType)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_ref ON stock_movements(referenceNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(createdAt)');

    // Stock adjustments
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustments_item ON stock_adjustments(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustments_warehouse ON stock_adjustments(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustments_status ON stock_adjustments(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustments_type ON stock_adjustments(adjustmentType)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustments_date ON stock_adjustments(createdAt)');

    // Batch info
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_item ON batch_info(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_warehouse ON batch_info(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_number ON batch_info(batchNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_expiry ON batch_info(expiryDate)');

    // Stock transfers
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transfers_item ON stock_transfers(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transfers_from_wh ON stock_transfers(fromWarehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transfers_to_wh ON stock_transfers(toWarehouseId)');

    // Warehouses
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warehouses_active ON warehouses(isActive, isDeleted)');

    // Users
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_active ON users(isActive, isDeleted)');

    // Audit log
    await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(tableName)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(recordId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(createdAt)');

    // Sync queue
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sync_table ON sync_queue(tableName)');
  }

  // ==================== INITIALIZE SEQUENCES ====================
  static Future<void> _initializeSequences(Database db) async {
    final now = DateTime.now().toIso8601String();

    final sequences = [
      {'name': 'movement', 'prefix': 'MOV', 'padding': 8},
      {'name': 'item', 'prefix': 'ITM', 'padding': 6},
      {'name': 'warehouse', 'prefix': 'WH', 'padding': 4},
      {'name': 'location', 'prefix': 'LOC', 'padding': 6},
    ];

    for (final seq in sequences) {
      await db.execute('''
        INSERT OR IGNORE INTO sequences (name, prefix, currentValue, padding, updatedAt)
        VALUES (?, ?, 0, ?, ?)
      ''', [seq['name'], seq['prefix'], seq['padding'], now]);
    }
  }

  /// Insert default admin user
  static Future<void> insertDefaultUser(Database db) async {
    final now = DateTime.now().toIso8601String();

    await db.execute('''
      INSERT OR IGNORE INTO users (
        id, username, displayName, passwordHash, role, isActive,
        createdAt, updatedAt, syncStatus
      ) VALUES (
        'admin-default',
        'admin',
        'Administrator',
        'admin123',
        'admin',
        1,
        ?, ?, 'local'
      )
    ''', [now, now]);
  }

  /// Insert default categories
  static Future<void> insertDefaultCategories(Database db) async {
    final now = DateTime.now().toIso8601String();

    final categories = [
      'General',
      'Electronics',
      'Automotive',
      'Chemicals',
      'Food & Beverage',
      'Pharmaceuticals',
      'Raw Materials',
      'Finished Goods',
      'Spare Parts',
      'Packaging',
    ];

    for (var i = 0; i < categories.length; i++) {
      await db.execute('''
        INSERT OR IGNORE INTO categories (id, name, sortOrder, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      ''', ['cat-${i + 1}', categories[i], i, now, now]);
    }
  }
}

/// Database migration helper
class WmsMigrations {
  static Future<void> migrate(Database db, int oldVersion, int newVersion) async {
    // Future schema upgrades go here
  }
}
