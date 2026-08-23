import 'dart:io';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/foundation.dart';
import 'database_initializer.dart';

class DatabaseService {
  static Database? _database;
  static String? _databasePath;
  
  /// Get the database path - uses portable path (same folder as exe) in release mode
  static Future<String> getDatabasePath() async {
    if (_databasePath != null) return _databasePath!;
    
    // In release mode on desktop, use the executable's directory for portable database
    if (!kDebugMode && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      final exePath = Platform.resolvedExecutable;
      final exeDir = File(exePath).parent.path;
      _databasePath = join(exeDir, 'data', 'tracinvent.db');
      
      // Ensure data directory exists
      final dataDir = Directory(join(exeDir, 'data'));
      if (!await dataDir.exists()) {
        await dataDir.create(recursive: true);
      }
      
      debugPrint('Using portable database path: $_databasePath');
    } else {
      // In debug mode or non-desktop, use documents directory
      final directory = await getApplicationDocumentsDirectory();
      _databasePath = join(directory.path, 'tracinvent.db');
      debugPrint('Using documents database path: $_databasePath');
    }
    
    return _databasePath!;
  }
  
  static Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  static Future<Database> _initDatabase() async {
    final path = await getDatabasePath();
    
    // Check if database already exists
    final dbFile = File(path);
    final dbExists = await dbFile.exists();
    debugPrint('Database exists: $dbExists at $path');
    
    return await openDatabase(
      path,
      version: 11, // Added hsn and brand columns to inventory_items
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  static Future<void> _onCreate(Database db, int version) async {
    print('Creating database tables...');
    // Use the comprehensive database initializer - pass the db instance
    await DatabaseInitializer.initializeAllTables(db);
    print('Database tables created');
    
    // Insert sample data for first-time setup
    await DatabaseInitializer.insertSampleData(db);
    print('Sample data inserted');
  }

  static Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      // Add hierarchical location tables
      await _createLocationTables(db);
      
      // Update stock table to include hierarchical location fields
      await db.execute('''
        ALTER TABLE stock ADD COLUMN zoneId TEXT
      ''');
      await db.execute('''
        ALTER TABLE stock ADD COLUMN rackId TEXT
      ''');
      await db.execute('''
        ALTER TABLE stock ADD COLUMN shelfId TEXT
      ''');
      await db.execute('''
        ALTER TABLE stock ADD COLUMN binId TEXT
      ''');
      await db.execute('''
        ALTER TABLE stock ADD COLUMN batchNumber TEXT
      ''');
      await db.execute('''
        ALTER TABLE stock ADD COLUMN expiryDate TEXT
      ''');
      
      // Create indexes for stock table with new columns
      await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_bin ON stock(binId)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_expiry ON stock(expiryDate)');
    }

    if (oldVersion < 3) {
      // Add Stock Monitoring System tables
      await _createStockMonitoringTables(db);
    }

    if (oldVersion < 7) {
      // Simplify location structure - remove zones, racks, shelves, bins
      // Replace with single 'cells' table
      print('Upgrading database from version $oldVersion to 7...');
      
      // Drop old hierarchical tables
      await db.execute('DROP TABLE IF EXISTS bins');
      await db.execute('DROP TABLE IF EXISTS shelves');
      await db.execute('DROP TABLE IF EXISTS racks');
      await db.execute('DROP TABLE IF EXISTS zones');
      
      // Create simplified cells table
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
      
      // Create indexes
      await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_warehouse ON cells(warehouseId)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_code ON cells(code)');
      
      // Recreate stocks table with cellId instead of old location columns
      await db.execute('''
        CREATE TABLE IF NOT EXISTS stocks_new (
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
      
      // Copy existing stock data (excluding old location columns)
      await db.execute('''
        INSERT INTO stocks_new (id, itemId, warehouseId, quantity, batchNumber, serialNumber, expiryDate, lastUpdated, updatedBy)
        SELECT id, itemId, warehouseId, quantity, batchNumber, serialNumber, expiryDate, lastUpdated, updatedBy
        FROM stocks
      ''');
      
      // Drop old stocks table and rename new one
      await db.execute('DROP TABLE stocks');
      await db.execute('ALTER TABLE stocks_new RENAME TO stocks');
      
      // Create indexes on stocks table
      await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_item ON stocks(itemId)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouseId)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_cell ON stocks(cellId)');
      
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
      
      print('Database upgrade to version 7 completed');
    }

    if (oldVersion < 8) {
      print('Upgrading database from version $oldVersion to 8...');
      print('Ensuring cellId column exists in stocks table');
      
      // Check if cellId column exists, if not recreate the table
      try {
        // Try to query with cellId
        await db.rawQuery('SELECT cellId FROM stocks LIMIT 1');
        print('cellId column already exists');
      } catch (e) {
        print('cellId column not found, recreating stocks table');
        
        // Recreate stocks table with cellId
        await db.execute('''
          CREATE TABLE IF NOT EXISTS stocks_new (
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
        
        // Copy existing stock data
        await db.execute('''
          INSERT INTO stocks_new (id, itemId, warehouseId, quantity, batchNumber, serialNumber, expiryDate, lastUpdated, updatedBy)
          SELECT id, itemId, warehouseId, quantity, batchNumber, serialNumber, expiryDate, lastUpdated, updatedBy
          FROM stocks
        ''');
        
        // Drop old stocks table and rename new one
        await db.execute('DROP TABLE stocks');
        await db.execute('ALTER TABLE stocks_new RENAME TO stocks');
        
        // Create indexes on stocks table
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_item ON stocks(itemId)');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouseId)');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stocks_cell ON stocks(cellId)');
        
        print('Stocks table recreated with cellId column');
      }
      
      print('Database upgrade to version 8 completed');
    }

    if (oldVersion < 10) {
      print('Upgrading database from version $oldVersion to 10...');
      print('Ensuring zones table, zoneId column, and stock tables exist');
      
      // Create zones table for Warehouse -> Zone -> Cell hierarchy
      await db.execute('''
        CREATE TABLE IF NOT EXISTS zones (
          id TEXT PRIMARY KEY,
          warehouseId TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE
        )
      ''');
      
      // Create index for zones
      await db.execute('CREATE INDEX IF NOT EXISTS idx_zones_warehouse ON zones(warehouseId)');
      
      // Add zoneId column to cells table
      try {
        await db.execute('ALTER TABLE cells ADD COLUMN zoneId TEXT');
        print('Added zoneId column to cells table');
      } catch (e) {
        print('zoneId column may already exist: $e');
      }
      
      // Create index for cells by zone
      await db.execute('CREATE INDEX IF NOT EXISTS idx_cells_zone ON cells(zoneId)');
      
      // Ensure stock_transfers table exists (may be missing from older upgrades)
      await db.execute('''
        CREATE TABLE IF NOT EXISTS stock_transfers (
          id TEXT PRIMARY KEY,
          itemId TEXT NOT NULL,
          fromWarehouseId TEXT NOT NULL,
          fromZoneId TEXT,
          fromCellId TEXT,
          toWarehouseId TEXT NOT NULL,
          toZoneId TEXT,
          toCellId TEXT,
          quantity REAL NOT NULL,
          batchNumber TEXT,
          referenceNumber TEXT,
          reason TEXT,
          notes TEXT,
          initiatedBy TEXT NOT NULL,
          approvedBy TEXT,
          status TEXT NOT NULL,
          transferDate TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          completedAt TEXT,
          FOREIGN KEY (itemId) REFERENCES inventory_items (id)
        )
      ''');
      
      // Create indexes for stock_transfers
      try {
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_transfers_item ON stock_transfers(itemId)');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status)');
      } catch (e) {
        print('Stock transfers indexes may already exist or columns differ: $e');
      }
      
      // Ensure stock_movements table exists
      await db.execute('''
        CREATE TABLE IF NOT EXISTS stock_movements (
          id TEXT PRIMARY KEY,
          itemId TEXT NOT NULL,
          warehouseId TEXT NOT NULL,
          cellId TEXT,
          movementType TEXT NOT NULL,
          quantity REAL NOT NULL,
          previousQuantity REAL NOT NULL,
          newQuantity REAL NOT NULL,
          referenceType TEXT,
          referenceId TEXT,
          notes TEXT,
          performedBy TEXT NOT NULL,
          movementDate TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          FOREIGN KEY (itemId) REFERENCES inventory_items (id),
          FOREIGN KEY (warehouseId) REFERENCES warehouses (id)
        )
      ''');
      
      // Create indexes for stock_movements - wrapped in try-catch as columns may differ
      try {
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(itemId)');
      } catch (e) {
        print('stock_movements itemId index error: $e');
      }
      try {
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movementDate)');
      } catch (e) {
        print('stock_movements movementDate index error (column may not exist): $e');
      }
      try {
        await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movementType)');
      } catch (e) {
        print('stock_movements movementType index error: $e');
      }
      
      print('Database upgrade to version 10 completed');
    }

    if (oldVersion < 11) {
      print('Upgrading database from version $oldVersion to 11...');
      print('Adding hsn and brand columns to inventory_items');
      
      // Add hsn column
      try {
        await db.execute('ALTER TABLE inventory_items ADD COLUMN hsn TEXT');
        print('Added hsn column to inventory_items table');
      } catch (e) {
        print('hsn column may already exist: $e');
      }
      
      // Add brand column (may already exist from initial schema)
      try {
        await db.execute('ALTER TABLE inventory_items ADD COLUMN brand TEXT');
        print('Added brand column to inventory_items table');
      } catch (e) {
        print('brand column may already exist: $e');
      }
      
      print('Database upgrade to version 11 completed');
    }
  }

  static Future<void> _createLocationTables(Database db) async {
    // Zones Table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        warehouseId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id) ON DELETE CASCADE
      )
    ''');

    // Racks Table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS racks (
        id TEXT PRIMARY KEY,
        zoneId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (zoneId) REFERENCES zones (id) ON DELETE CASCADE
      )
    ''');

    // Shelves Table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS shelves (
        id TEXT PRIMARY KEY,
        rackId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (rackId) REFERENCES racks (id) ON DELETE CASCADE
      )
    ''');

    // Bins Table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS bins (
        id TEXT PRIMARY KEY,
        shelfId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        maxCapacity REAL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (shelfId) REFERENCES shelves (id) ON DELETE CASCADE
      )
    ''');

    // Create indexes for location hierarchy
    await db.execute('CREATE INDEX IF NOT EXISTS idx_zones_warehouse ON zones(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_racks_zone ON racks(zoneId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_shelves_rack ON shelves(rackId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_bins_shelf ON bins(shelfId)');
  }

  static Future<void> _createStockMonitoringTables(Database db) async {
    // Location Stock Table - Real-time stock per location
    await db.execute('''
      CREATE TABLE IF NOT EXISTS location_stock (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        zoneId TEXT NOT NULL,
        rackId TEXT NOT NULL,
        shelfId TEXT NOT NULL,
        binId TEXT NOT NULL,
        quantity REAL NOT NULL,
        batchNumber TEXT,
        expiryDate TEXT,
        lastMovementDate TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES inventory_items (id),
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id),
        FOREIGN KEY (zoneId) REFERENCES zones (id),
        FOREIGN KEY (rackId) REFERENCES racks (id),
        FOREIGN KEY (shelfId) REFERENCES shelves (id),
        FOREIGN KEY (binId) REFERENCES bins (id)
      )
    ''');

    // Stock Movements Table - Audit trail
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        itemSku TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        warehouseName TEXT NOT NULL,
        zoneId TEXT NOT NULL,
        zoneName TEXT NOT NULL,
        rackId TEXT NOT NULL,
        rackName TEXT NOT NULL,
        shelfId TEXT NOT NULL,
        shelfName TEXT NOT NULL,
        binId TEXT NOT NULL,
        binName TEXT NOT NULL,
        locationCode TEXT NOT NULL,
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
        FOREIGN KEY (itemId) REFERENCES inventory_items (id),
        FOREIGN KEY (warehouseId) REFERENCES warehouses (id)
      )
    ''');

    // Stock Transfers Table
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        fromWarehouseId TEXT NOT NULL,
        fromZoneId TEXT NOT NULL,
        fromRackId TEXT NOT NULL,
        fromShelfId TEXT NOT NULL,
        fromBinId TEXT NOT NULL,
        toWarehouseId TEXT NOT NULL,
        toZoneId TEXT NOT NULL,
        toRackId TEXT NOT NULL,
        toShelfId TEXT NOT NULL,
        toBinId TEXT NOT NULL,
        quantity REAL NOT NULL,
        batchNumber TEXT,
        referenceNumber TEXT,
        reason TEXT,
        notes TEXT,
        initiatedBy TEXT NOT NULL,
        approvedBy TEXT,
        status TEXT NOT NULL,
        transferDate TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        completedAt TEXT,
        FOREIGN KEY (itemId) REFERENCES inventory_items (id)
      )
    ''');

    // Create indexes for stock monitoring
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_item ON location_stock(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_bin ON location_stock(binId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_location_stock_warehouse ON location_stock(warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movementDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movementType)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_transfers_item ON stock_transfers(itemId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status)');
  }

  static Future<void> close() async {
    final db = await database;
    await db.close();
  }
}
