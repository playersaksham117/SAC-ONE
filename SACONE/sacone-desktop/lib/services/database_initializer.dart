import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Comprehensive database initializer for TracInvent
/// Initializes all tables with proper schema and relationships
class DatabaseInitializer {
  
  /// Initialize all database tables
  static Future<void> initializeAllTables(Database db) async {
    
    // Users table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        pin TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      )
    ''');

    // Warehouses table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT,
        state TEXT,
        pincode TEXT,
        contactPerson TEXT,
        contactPhone TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL
      )
    ''');

    // Cells table (simplified location - directly under warehouse)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cells (
        id TEXT PRIMARY KEY,
        warehouseId TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        capacity REAL,
        description TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE,
        UNIQUE(warehouseId, code)
      )
    ''');

    // Inventory items table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        barcode TEXT UNIQUE,
        description TEXT,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        costPrice REAL NOT NULL DEFAULT 0,
        sellingPrice REAL NOT NULL DEFAULT 0,
        reorderLevel REAL DEFAULT 0,
        minStockLevel REAL DEFAULT 0,
        reorderQuantity REAL DEFAULT 0,
        taxRate REAL DEFAULT 0,
        hsn TEXT,
        supplier TEXT,
        brand TEXT,
        imageUrl TEXT,
        isActive INTEGER DEFAULT 1,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        FOREIGN KEY (createdBy) REFERENCES users (id)
      )
    ''');

    // Stock table (inventory at specific locations)
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
        FOREIGN KEY (itemId) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE,
        FOREIGN KEY (cellId) REFERENCES cells (id) ON DELETE SET NULL,
        FOREIGN KEY (updatedBy) REFERENCES users (id)
      )
    ''');

    // Transactions table
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
        FOREIGN KEY (itemId) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users (id)
      )
    ''');

    // Stock movements table (audit trail)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        fromWarehouseId TEXT,
        toWarehouseId TEXT,
        fromLocationId TEXT,
        toLocationId TEXT,
        quantity REAL NOT NULL,
        movementType TEXT NOT NULL,
        referenceNumber TEXT,
        notes TEXT,
        movedBy TEXT,
        movedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY (fromWarehouseId) REFERENCES warehouses (id),
        FOREIGN KEY (toWarehouseId) REFERENCES warehouses (id),
        FOREIGN KEY (movedBy) REFERENCES users (id)
      )
    ''');

    // Batch tracking table
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
        FOREIGN KEY (itemId) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE,
        FOREIGN KEY (cellId) REFERENCES cells (id) ON DELETE SET NULL,
        UNIQUE(itemId, batchNumber, warehouseId, cellId)
      )
    ''');

    // Stock adjustments table
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
        FOREIGN KEY (itemId) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE,
        FOREIGN KEY (cellId) REFERENCES cells (id) ON DELETE SET NULL,
        FOREIGN KEY (createdBy) REFERENCES users (id),
        FOREIGN KEY (approvedBy) REFERENCES users (id)
      )
    ''');

    // Create indexes for better performance
    await _createIndexes(db);

    print('✅ All database tables initialized successfully');
  }

  /// Create indexes for frequently queried columns
  static Future<void> _createIndexes(dynamic db) async {
    // User indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');

    // Warehouse indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warehouses_type ON warehouses(type)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_warehouses_active ON warehouses(isActive)');

    // Cell indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_warehouse ON cells(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_code ON cells(code)');

    // Inventory indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_sku ON inventory_items(sku)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_barcode ON inventory_items(barcode)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_category ON inventory_items(category)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_active ON inventory_items(isActive)');

    // Stock indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_item ON stocks(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_cell ON stocks(cellId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_location ON stocks(warehouseId, cellId)');

    // Transaction indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_warehouse ON transactions(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transactionDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');

    // Movement indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_from_warehouse ON stock_movements(fromWarehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_to_warehouse ON stock_movements(toWarehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(movedAt)');

    // Batch tracking indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_item ON batch_info(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_warehouse ON batch_info(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_number ON batch_info(batchNumber)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_expiry ON batch_info(expiryDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_batch_location ON batch_info(warehouseId, cellId)');

    // Stock adjustment indexes
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_item ON stock_adjustments(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_warehouse ON stock_adjustments(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_status ON stock_adjustments(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_type ON stock_adjustments(adjustmentType)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_date ON stock_adjustments(createdAt)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adjustment_creator ON stock_adjustments(createdBy)');
  }

  /// Insert sample data for testing
  static Future<void> insertSampleData(Database db) async {

    // Check if data already exists
    final userCount = await db.rawQuery('SELECT COUNT(*) as count FROM users');
    if ((userCount.first['count'] as int) > 0) {
      print('Sample data already exists, skipping...');
      return;
    }

    // Insert admin user
    await db.insert('users', {
      'id': 'user_admin_001',
      'name': 'Admin User',
      'email': 'admin@tracinvent.com',
      'password': 'admin123', // In production, hash this!
      'role': 'admin',
      'pin': null,
      'createdAt': DateTime.now().toIso8601String(),
    });

    // Insert sample warehouse
    await db.insert('warehouses', {
      'id': 'wh_001',
      'name': 'Main Warehouse',
      'type': 'warehouse',
      'address': '123 Storage Street',
      'city': 'New York',
      'state': 'NY',
      'pincode': '10001',
      'contactPerson': 'John Doe',
      'contactPhone': '+1-555-0123',
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });

    // Insert sample cells
    await db.insert('cells', {
      'id': 'cell_001',
      'warehouseId': 'wh_001',
      'name': 'Cell A-1',
      'code': 'A1',
      'capacity': 100.0,
      'description': 'Electronics storage cell',
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });

    await db.insert('cells', {
      'id': 'cell_002',
      'warehouseId': 'wh_001',
      'name': 'Cell A-2',
      'code': 'A2',
      'capacity': 100.0,
      'description': 'Furniture storage cell',
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });

    await db.insert('cells', {
      'id': 'cell_003',
      'warehouseId': 'wh_001',
      'name': 'Cell B-1',
      'code': 'B1',
      'capacity': 150.0,
      'description': 'General storage cell',
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });

    print('✅ Sample data inserted successfully');
  }

  /// Reset database (use with caution!)
  static Future<void> resetDatabase(Database db) async {

    // Drop all tables
    await db.execute('DROP TABLE IF EXISTS stock_movements');
    await db.execute('DROP TABLE IF EXISTS transactions');
    await db.execute('DROP TABLE IF EXISTS stocks');
    await db.execute('DROP TABLE IF EXISTS inventory_items');
    await db.execute('DROP TABLE IF EXISTS cells');
    await db.execute('DROP TABLE IF EXISTS warehouses');
    await db.execute('DROP TABLE IF EXISTS users');

    // Reinitialize
    await initializeAllTables(db);
    await insertSampleData(db);

    print('✅ Database reset completed');
  }

  /// Verify database integrity
  static Future<Map<String, dynamic>> verifyDatabase(Database db) async {
    
    final tables = [
      'users',
      'warehouses',
      'cells',
      'inventory_items',
      'stocks',
      'transactions',
      'stock_movements'
    ];

    Map<String, dynamic> status = {};

    for (var table in tables) {
      try {
        final count = await db.rawQuery('SELECT COUNT(*) as count FROM $table');
        status[table] = {
          'exists': true,
          'count': count.first['count'],
        };
      } catch (e) {
        status[table] = {
          'exists': false,
          'error': e.toString(),
        };
      }
    }

    return status;
  }
}
