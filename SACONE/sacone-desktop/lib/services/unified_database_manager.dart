/// ============================================================
/// UNIFIED DATABASE MANAGER - Single source of truth for DB access
/// ============================================================
/// 
/// Consolidates DatabaseService and DatabaseConnection into one system.
/// Provides unified schema initialization and data management.
/// 
/// Architecture: Data Layer
/// ============================================================
library;

import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';

import '../data/database/wms_schema.dart';
import '../data/database/retail_schema.dart';
import '../data/database/advanced_retail_schema.dart';
import '../data/database/licensing_schema.dart';

/// Unified database manager singleton
class DatabaseManager {
  static DatabaseManager? _instance;
  static Database? _database;
  
  DatabaseManager._();
  
  /// Get singleton instance
  static DatabaseManager get instance {
    _instance ??= DatabaseManager._();
    return _instance!;
  }
  
  /// Get database instance
  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }
  
  /// Get database path
  Future<String> getDatabasePath() async {
    // In release mode on desktop, use portable path
    if (!kDebugMode && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      final exePath = Platform.resolvedExecutable;
      final exeDir = File(exePath).parent.path;
      final dbPath = join(exeDir, 'data', 'tracinvent.db');
      
      // Ensure data directory exists
      final dataDir = Directory(join(exeDir, 'data'));
      if (!await dataDir.exists()) {
        await dataDir.create(recursive: true);
      }
      
      debugPrint('Using portable database: $dbPath');
      return dbPath;
    }
    
    // Debug mode or mobile - use documents directory
    final directory = await getApplicationDocumentsDirectory();
    final dbPath = join(directory.path, 'TracInvent', 'tracinvent.db');
    
    // Ensure directory exists
    final dbDir = Directory(join(directory.path, 'TracInvent'));
    if (!await dbDir.exists()) {
      await dbDir.create(recursive: true);
    }
    
    debugPrint('Using documents database: $dbPath');
    return dbPath;
  }
  
  /// Initialize database
  Future<Database> _initDatabase() async {
    // Initialize FFI for desktop platforms
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }
    
    final path = await getDatabasePath();
    
    return await openDatabase(
      path,
      version: WmsSchema.version,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
      onConfigure: _onConfigure,
    );
  }
  
  /// Configure database settings
  Future<void> _onConfigure(Database db) async {
    // Enable foreign keys
    await db.execute('PRAGMA foreign_keys = ON');
    
    // Performance optimizations
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA synchronous = NORMAL');
    await db.execute('PRAGMA cache_size = 10000');
    await db.execute('PRAGMA temp_store = MEMORY');
  }
  
  /// Create database schema
  Future<void> _onCreate(Database db, int version) async {
    debugPrint('Creating unified database schema v$version...');
    await WmsSchema.createTables(db);
    await _insertInitialData(db);
    debugPrint('Unified database schema created successfully');
  }
  
  /// Upgrade database schema
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    debugPrint('Upgrading database from v$oldVersion to v$newVersion...');
    await _backupBeforeUpgrade(db, oldVersion);

    if (oldVersion < 2) {
      await _migrateV1ToV2(db);
    }
    if (oldVersion < 3) {
      await _migrateV2ToV3(db);
    }
    if (oldVersion < 4) {
      await _migrateV3ToV4(db);
    }
    if (oldVersion < 5) {
      await _migrateV4ToV5(db);
    }

    debugPrint('Database upgraded successfully');
  }

  /// Copy database before schema migration so updates never destroy user data.
  Future<void> _backupBeforeUpgrade(Database db, int oldVersion) async {
    try {
      await db.execute('PRAGMA wal_checkpoint(FULL)');
      final path = db.path;
      if (path.isEmpty || !await File(path).exists()) return;

      final backupPath =
          '$path.pre_upgrade_v${oldVersion}_${DateTime.now().millisecondsSinceEpoch}.bak';
      await File(path).copy(backupPath);
      debugPrint('Pre-upgrade database backup created: $backupPath');
    } catch (e) {
      debugPrint('Pre-upgrade backup skipped (migration continues): $e');
    }
  }

  Future<void> _migrateV4ToV5(Database db) async {
    debugPrint('Running v4 to v5 licensing migration...');
    await LicensingSchema.createTables(db);
    debugPrint('v4 to v5 migration completed');
  }
  
  /// Migrate database from v2 to v3 (Phase 1 retail)
  Future<void> _migrateV3ToV4(Database db) async {
    debugPrint('Running v3 to v4 advanced retail migration...');
    await AdvancedRetailSchema.createTables(db);
    debugPrint('v3 to v4 migration completed');
  }

  Future<void> _migrateV2ToV3(Database db) async {
    debugPrint('Running v2 to v3 retail migration...');
    await RetailSchema.createTables(db);
    debugPrint('v2 to v3 retail migration completed');
  }

  /// Migrate database from v1 to v2
  Future<void> _migrateV1ToV2(Database db) async {
    try {
      debugPrint('Running v1 to v2 migration...');
      
      // For stock_movements table, we need to completely recreate it with new schema
      // First, check if the table exists and if it has the warehouseId column
      try {
        // Try to get info about the table
        final result = await db.rawQuery('PRAGMA table_info(stock_movements)');
        final columnNames = result.map((col) => col['name'] as String).toList();
        
        debugPrint('Existing stock_movements columns: $columnNames');
        
        // If warehouseId column doesn't exist, we need to migrate
        if (!columnNames.contains('warehouseId')) {
          debugPrint('warehouseId column missing, backing up and recreating stock_movements table...');
          
          // Backup existing data
          await db.execute('''
            CREATE TABLE stock_movements_backup AS 
            SELECT * FROM stock_movements
          ''');
          debugPrint('Backed up stock_movements to stock_movements_backup');
          
          // Drop the old table
          await db.execute('DROP TABLE IF EXISTS stock_movements');
          debugPrint('Dropped old stock_movements table');
        }
      } catch (e) {
        debugPrint('Error checking table structure: $e');
      }
      
      // Now recreate all tables (stock_movements will be recreated with proper schema)
      await WmsSchema.createTables(db);
      
      // Clean up backup table if it exists
      try {
        await db.execute('DROP TABLE IF EXISTS stock_movements_backup');
      } catch (e) {
        debugPrint('Could not clean up backup table: $e');
      }
      
      debugPrint('v1 to v2 migration completed successfully');
    } catch (e) {
      debugPrint('Error during v1 to v2 migration: $e');
      rethrow;
    }
  }
  
  /// Insert initial data
  Future<void> _insertInitialData(Database db) async {
    try {
      // Insert default user
      await db.insert('users', {
        'id': 'admin-default',
        'username': 'admin@123',
        'email': 'admin@123',
        'displayName': 'Administrator',
        'passwordHash': sha256.convert(utf8.encode('admin123')).toString(),
        'role': 'admin',
        'isActive': 1,
        'createdAt': DateTime.now().toIso8601String(),
        'updatedAt': DateTime.now().toIso8601String(),
        'syncStatus': 'local',
      }, conflictAlgorithm: ConflictAlgorithm.ignore);

      // Insert default categories
      final categories = [
        'Electronics', 'Clothing', 'Food', 'Books', 'Furniture',
        'Office Supplies', 'Tools', 'Hardware', 'Raw Materials', 'Other'
      ];
      
      for (int i = 0; i < categories.length; i++) {
        await db.insert('categories', {
          'id': '${i + 1}',
          'name': categories[i],
          'sortOrder': i,
          'isActive': 1,
          'createdAt': DateTime.now().toIso8601String(),
          'updatedAt': DateTime.now().toIso8601String(),
        }, conflictAlgorithm: ConflictAlgorithm.ignore);
      }

      // Initialize sequences
      await db.insert('sequences', {
        'name': 'ITEM_CODE',
        'prefix': 'ITEM',
        'currentValue': 1000,
        'padding': 6,
        'updatedAt': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.ignore);

      await db.insert('sequences', {
        'name': 'LOCATION_CODE',
        'prefix': 'LOC',
        'currentValue': 100,
        'padding': 4,
        'updatedAt': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.ignore);

      await db.insert('sequences', {
        'name': 'MOVEMENT_NO',
        'prefix': 'MOV',
        'currentValue': 1000,
        'padding': 6,
        'updatedAt': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.ignore);

      debugPrint('Initial data inserted successfully');
    } catch (e) {
      debugPrint('Error inserting initial data: $e');
    }
  }
  
  /// Execute in transaction
  Future<T> transaction<T>(Future<T> Function(Transaction txn) action) async {
    final db = await database;
    return await db.transaction(action);
  }
  
  /// Execute raw query
  Future<List<Map<String, dynamic>>> rawQuery(
    String sql, [
    List<Object?>? arguments,
  ]) async {
    final db = await database;
    return await db.rawQuery(sql, arguments);
  }
  
  /// Execute raw insert
  Future<int> rawInsert(String sql, [List<Object?>? arguments]) async {
    final db = await database;
    return await db.rawInsert(sql, arguments);
  }
  
  /// Execute raw update
  Future<int> rawUpdate(String sql, [List<Object?>? arguments]) async {
    final db = await database;
    return await db.rawUpdate(sql, arguments);
  }
  
  /// Execute raw delete
  Future<int> rawDelete(String sql, [List<Object?>? arguments]) async {
    final db = await database;
    return await db.rawDelete(sql, arguments);
  }
  
  /// Close database connection
  Future<void> close() async {
    if (_database != null) {
      await _database!.close();
      _database = null;
    }
  }
  
  /// Reset database for development
  Future<void> resetDatabase() async {
    await close();
    final path = await getDatabasePath();
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
    _database = await _initDatabase();
  }

  /// Get database statistics
  Future<Map<String, dynamic>> getStats() async {
    final db = await database;
    final stats = <String, dynamic>{};
    
    final tables = [
      'users', 'items', 'warehouses', 'locations', 'stock', 
      'stock_movements', 'categories', 'audit_log'
    ];
    
    for (final table in tables) {
      final result = await db.rawQuery('SELECT COUNT(*) as count FROM $table');
      stats[table] = result.first['count'] ?? 0;
    }
    
    return stats;
  }
}
