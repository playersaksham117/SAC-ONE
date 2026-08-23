/// ============================================================
/// DATABASE CONNECTION - SQLite database manager
/// ============================================================
/// 
/// Manages database connection, initialization, and lifecycle.
/// Provides transaction support for atomic operations.
/// 
/// Architecture: Data Layer
/// ============================================================

import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';

import 'wms_schema.dart';

/// Database connection manager singleton
class DatabaseConnection {
  static DatabaseConnection? _instance;
  static Database? _database;
  
  DatabaseConnection._();
  
  /// Get singleton instance
  static DatabaseConnection get instance {
    _instance ??= DatabaseConnection._();
    return _instance!;
  }
  
  /// Get database instance
  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }
  
  /// Get database path
  Future<String> _getDatabasePath() async {
    // In release mode on desktop, use portable path
    if (!kDebugMode && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      final exePath = Platform.resolvedExecutable;
      final exeDir = File(exePath).parent.path;
      final dbPath = join(exeDir, 'data', 'wms.db');
      
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
    final dbPath = join(directory.path, 'TracInvent', 'wms.db');
    
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
    
    final path = await _getDatabasePath();
    
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
    debugPrint('Creating WMS database schema v$version...');
    await WmsSchema.createTables(db);
    await WmsSchema.insertDefaultUser(db);
    await WmsSchema.insertDefaultCategories(db);
    debugPrint('Database schema created successfully');
  }
  
  /// Upgrade database schema
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    debugPrint('Upgrading database from v$oldVersion to v$newVersion...');
    await WmsMigrations.migrate(db, oldVersion, newVersion);
    debugPrint('Database upgraded successfully');
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
  
  /// Get next sequence value
  Future<String> getNextSequence(String name) async {
    final db = await database;
    
    return await db.transaction((txn) async {
      // Get current sequence
      final result = await txn.query(
        'sequences',
        where: 'name = ?',
        whereArgs: [name],
      );
      
      if (result.isEmpty) {
        throw Exception('Sequence not found: $name');
      }
      
      final row = result.first;
      final prefix = row['prefix'] as String;
      final currentValue = (row['currentValue'] as int) + 1;
      final padding = row['padding'] as int;
      
      // Update sequence
      await txn.update(
        'sequences',
        {
          'currentValue': currentValue,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'name = ?',
        whereArgs: [name],
      );
      
      // Return formatted sequence
      return '$prefix-${currentValue.toString().padLeft(padding, '0')}';
    });
  }
  
  /// Check if database exists
  Future<bool> databaseExists() async {
    final path = await _getDatabasePath();
    return File(path).exists();
  }
  
  /// Get database size in bytes
  Future<int> getDatabaseSize() async {
    final path = await _getDatabasePath();
    final file = File(path);
    if (await file.exists()) {
      return await file.length();
    }
    return 0;
  }
  
  /// Vacuum database (compact)
  Future<void> vacuum() async {
    final db = await database;
    await db.execute('VACUUM');
  }
  
  /// Analyze database for query optimization
  Future<void> analyze() async {
    final db = await database;
    await db.execute('ANALYZE');
  }
  
  /// Get database statistics
  Future<Map<String, int>> getStatistics() async {
    final db = await database;
    final stats = <String, int>{};
    
    final tables = ['items', 'warehouses', 'locations', 'stock', 'stock_movements', 'users'];
    
    for (final table in tables) {
      final result = await db.rawQuery('SELECT COUNT(*) as count FROM $table');
      stats[table] = (result.isNotEmpty && result.first.containsKey('count')) 
          ? (result.first['count'] as int?) ?? 0 
          : 0;
    }
    
    return stats;
  }
}

/// Extension for Batch operations
extension DatabaseBatchExtension on Database {
  /// Execute batch operation
  Future<List<Object?>> executeBatch(
    void Function(Batch batch) operations, {
    bool? exclusive,
    bool? noResult,
    bool? continueOnError,
  }) async {
    final batch = this.batch();
    operations(batch);
    return await batch.commit(
      exclusive: exclusive,
      noResult: noResult,
      continueOnError: continueOnError,
    );
  }
}
