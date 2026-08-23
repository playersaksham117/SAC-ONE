import 'dart:io';
import 'unified_database_manager.dart';

/// Database maintenance and cleanup utility
class DatabaseCleanupService {
  /// Delete the entire database file and reinitialize
  static Future<void> cleanDatabase() async {
    try {
      // Close any existing database connection
      final db = await DatabaseManager.instance.database;
      await db.close();

      // Get database path
      final dbPath = await DatabaseManager.instance.getDatabasePath();

      // Delete the database file
      final file = File(dbPath);
      if (await file.exists()) {
        await file.delete();
        print('Database file deleted: $dbPath');
      }

      // Reinitialize database (will create fresh tables)
      await DatabaseManager.instance.database;
      print('Database reinitialized successfully');
    } catch (e) {
      print('Error cleaning database: $e');
      rethrow;
    }
  }

  /// Clear specific tables without deleting the database
  static Future<void> clearTables({
    bool clearInventory = false,
    bool clearStock = false,
    bool clearWarehouses = false,
    bool clearTransactions = false,
    bool clearMovements = false,
  }) async {
    try {
      final db = await DatabaseManager.instance.database;

      if (clearMovements) {
        try {
          await db.delete('stock_movements');
        } catch (e) {
          print('Note: stock_movements table may not exist: $e');
        }
        try {
          await db.delete('stock_transfers');
        } catch (e) {
          print('Note: stock_transfers table may not exist: $e');
        }
        print('Cleared stock movements and transfers');
      }

      if (clearStock) {
        try {
          await db.delete('stock');
        } catch (e) {
          print('Note: stock table may not exist: $e');
        }
        try {
          await db.delete('stocks');
        } catch (e) {
          print('Note: stocks table may not exist: $e');
        }
        try {
          await db.delete('location_stock');
        } catch (e) {
          print('Note: location_stock table may not exist: $e');
        }
        print('Cleared stock data');
      }

      if (clearTransactions) {
        await db.delete('transactions');
        print('Cleared transactions');
      }

      if (clearInventory) {
        await db.delete('inventory_items');
        print('Cleared inventory items');
      }

      if (clearWarehouses) {
        // Clear cells (new simplified structure)
        try {
          await db.delete('cells');
        } catch (e) {
          print('Note: cells table may not exist: $e');
        }
        // Clear zones
        try {
          await db.delete('zones');
        } catch (e) {
          print('Note: zones table may not exist: $e');
        }
        // Legacy tables - may not exist in newer databases
        try {
          await db.delete('bins');
        } catch (e) {
          // Table may not exist
        }
        try {
          await db.delete('shelves');
        } catch (e) {
          // Table may not exist
        }
        try {
          await db.delete('racks');
        } catch (e) {
          // Table may not exist
        }
        try {
          await db.delete('storage_locations');
        } catch (e) {
          print('Note: storage_locations table may not exist: $e');
        }
        // Clear warehouses last (due to foreign key constraints)
        await db.delete('warehouses');
        print('Cleared warehouses and locations');
      }

      print('Database cleanup completed');
    } catch (e) {
      print('Error clearing tables: $e');
      rethrow;
    }
  }

  /// Vacuum database to reclaim space and optimize
  static Future<void> optimizeDatabase() async {
    try {
      final db = await DatabaseManager.instance.database;
      await db.execute('VACUUM');
      await db.execute('ANALYZE');
      print('Database optimized');
    } catch (e) {
      print('Error optimizing database: $e');
      rethrow;
    }
  }

  /// Get database file size
  static Future<int> getDatabaseSize() async {
    try {
      final dbPath = await DatabaseManager.instance.getDatabasePath();
      final file = File(dbPath);
      
      if (await file.exists()) {
        return await file.length();
      }
      return 0;
    } catch (e) {
      print('Error getting database size: $e');
      return 0;
    }
  }

  /// Format bytes to human-readable string
  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(2)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }
}
