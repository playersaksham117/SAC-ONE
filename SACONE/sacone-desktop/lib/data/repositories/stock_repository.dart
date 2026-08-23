/// ============================================================
/// STOCK REPOSITORY - Data access for stock levels
/// ============================================================
/// 
/// Handles all database operations for stock at locations.
/// Implements FEFO (First Expiry First Out) queries.
/// Provides aggregation and summary methods.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/stock.dart';
import 'base_repository.dart';

/// Repository for Stock entities
class StockRepository extends BaseRepository<Stock> {
  @override
  String get tableName => 'stock';
  
  @override
  Stock fromMap(Map<String, dynamic> map) => Stock.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(Stock entity) => entity.toMap();
  
  // =====================================================
  // STOCK QUERIES
  // =====================================================
  
  /// Get stock at specific location for an item
  Future<Result<Stock?>> getStockAtLocation(
    String itemId,
    String locationId, {
    String? batchNumber,
  }) async {
    try {
      final database = await db.database;
      
      String where = 'itemId = ? AND locationId = ?';
      List<Object?> whereArgs = [itemId, locationId];
      
      if (batchNumber != null) {
        where += ' AND batchNumber = ?';
        whereArgs.add(batchNumber);
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get stock at location: $e',
        error: e,
      ));
    }
  }
  
  /// Get all stock entries for an item
  Future<Result<List<Stock>>> getStockForItem(
    String itemId, {
    String? warehouseId,
    bool includeZeroStock = false,
  }) async {
    try {
      String where = 'itemId = ?';
      List<Object?> whereArgs = [itemId];
      
      if (warehouseId != null) {
        where += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }
      
      if (!includeZeroStock) {
        where += ' AND quantity > 0';
      }
      
      return getAll(
        where: where,
        whereArgs: whereArgs,
        orderBy: 'expiryDate ASC, createdAt ASC', // FEFO
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get stock for item: $e',
        error: e,
      ));
    }
  }
  
  /// Get all stock at a location
  Future<Result<List<Stock>>> getStockAtLocation_All(String locationId) async {
    return getAll(
      where: 'locationId = ? AND quantity > 0',
      whereArgs: [locationId],
      orderBy: 'updatedAt DESC',
    );
  }
  
  /// Get all stock in a warehouse
  Future<Result<List<Stock>>> getStockInWarehouse(
    String warehouseId, {
    bool includeZeroStock = false,
  }) async {
    String where = 'warehouseId = ?';
    if (!includeZeroStock) {
      where += ' AND quantity > 0';
    }
    
    return getAll(
      where: where,
      whereArgs: [warehouseId],
      orderBy: 'updatedAt DESC',
    );
  }
  
  // =====================================================
  // FEFO (First Expiry First Out) QUERIES
  // =====================================================
  
  /// Get stock in FEFO order for deduction
  /// Returns stock entries ordered by expiry date (nulls last), then by creation date
  Future<Result<List<Stock>>> getStockFEFO(
    String itemId, {
    String? warehouseId,
    String? excludeLocationId,
  }) async {
    try {
      final database = await db.database;
      
      String where = 'itemId = ? AND quantity > 0';
      List<Object?> whereArgs = [itemId];
      
      if (warehouseId != null) {
        where += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }
      
      if (excludeLocationId != null) {
        where += ' AND locationId != ?';
        whereArgs.add(excludeLocationId);
      }
      
      // FEFO ordering: items with expiry date first (earliest), then items without expiry
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: '''
          CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END,
          expiryDate ASC,
          createdAt ASC
        ''',
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get FEFO stock: $e',
        error: e,
      ));
    }
  }
  
  /// Get expiring stock (within days threshold)
  Future<Result<List<Stock>>> getExpiringStock(
    int daysThreshold, {
    String? warehouseId,
  }) async {
    try {
      final database = await db.database;
      final thresholdDate = DateTime.now().add(Duration(days: daysThreshold));
      
      String where = 'expiryDate IS NOT NULL AND expiryDate <= ? AND quantity > 0';
      List<Object?> whereArgs = [thresholdDate.toIso8601String()];
      
      if (warehouseId != null) {
        where += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: 'expiryDate ASC',
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get expiring stock: $e',
        error: e,
      ));
    }
  }
  
  /// Get expired stock
  Future<Result<List<Stock>>> getExpiredStock({String? warehouseId}) async {
    try {
      final database = await db.database;
      final now = DateTime.now();
      
      String where = 'expiryDate IS NOT NULL AND expiryDate < ? AND quantity > 0';
      List<Object?> whereArgs = [now.toIso8601String()];
      
      if (warehouseId != null) {
        where += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: 'expiryDate ASC',
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get expired stock: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // AGGREGATIONS & SUMMARIES
  // =====================================================
  
  /// Get total quantity of an item across all locations
  Future<Result<double>> getTotalQuantity(
    String itemId, {
    String? warehouseId,
  }) async {
    try {
      final database = await db.database;
      
      String sql = 'SELECT COALESCE(SUM(quantity), 0) as total FROM $tableName WHERE itemId = ?';
      List<Object?> args = [itemId];
      
      if (warehouseId != null) {
        sql += ' AND warehouseId = ?';
        args.add(warehouseId);
      }
      
      final result = await database.rawQuery(sql, args);
      final total = (result.first['total'] as num?)?.toDouble() ?? 0.0;
      
      return Result.success(total);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get total quantity: $e',
        error: e,
      ));
    }
  }
  
  /// Get item stock summary
  Future<Result<ItemStockSummary>> getItemSummary(String itemId) async {
    try {
      final database = await db.database;
      
      final result = await database.rawQuery('''
        SELECT 
          s.itemId,
          COALESCE(i.name, '') as itemName,
          COALESCE(i.sku, '') as itemSku,
          COALESCE(SUM(s.quantity), 0) as totalQuantity,
          COALESCE(SUM(s.reservedQuantity), 0) as totalReserved,
          COALESCE(i.reorderLevel, 10) as reorderLevel,
          COALESCE(i.minStockLevel, 5) as minimumLevel,
          COUNT(DISTINCT s.locationId) as locationCount,
          COUNT(DISTINCT s.warehouseId) as warehouseCount,
          MIN(CASE WHEN s.expiryDate IS NOT NULL AND s.quantity > 0 THEN s.expiryDate END) as nearestExpiry
        FROM $tableName s
        LEFT JOIN items i ON s.itemId = i.id
        WHERE s.itemId = ?
        GROUP BY s.itemId
      ''', [itemId]);
      
      if (result.isEmpty) {
        return Result.success(ItemStockSummary(
          itemId: itemId,
          itemName: '',
          itemSku: '',
          totalQuantity: 0,
          totalReserved: 0,
          reorderLevel: 10,
          minimumLevel: 5,
          locationCount: 0,
          warehouseCount: 0,
          nearestExpiry: null,
          status: StockStatus.outOfStock,
        ));
      }
      
      final row = result.first;
      return Result.success(ItemStockSummary.fromMap(row));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get item summary: $e',
        error: e,
      ));
    }
  }
  
  /// Get stock summary by warehouse
  Future<Result<Map<String, double>>> getStockByWarehouse(String itemId) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT warehouseId, COALESCE(SUM(quantity), 0) as total
        FROM $tableName
        WHERE itemId = ?
        GROUP BY warehouseId
      ''', [itemId]);
      
      final map = <String, double>{};
      for (final row in results) {
        map[row['warehouseId'] as String] = (row['total'] as num).toDouble();
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get stock by warehouse: $e',
        error: e,
      ));
    }
  }
  
  /// Get location stock with item details
  Future<Result<List<LocationStock>>> getLocationStockWithDetails(
    String locationId,
  ) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          s.*,
          i.name as itemName,
          i.code as itemCode,
          i.unit as itemUnit,
          l.name as locationName,
          l.fullPath as locationPath
        FROM $tableName s
        JOIN items i ON s.itemId = i.id
        JOIN locations l ON s.locationId = l.id
        WHERE s.locationId = ? AND s.quantity > 0
        ORDER BY i.name ASC
      ''', [locationId]);
      
      return Result.success(
        results.map((row) => LocationStock.fromMap(row)).toList(),
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get location stock with details: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // STOCK ALERTS
  // =====================================================
  
  /// Get items with low stock (need to join with items table)
  Future<Result<List<Map<String, dynamic>>>> getLowStockItems({
    String? warehouseId,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT 
          i.id,
          i.name,
          i.code,
          i.unit,
          i.minStockLevel,
          COALESCE(SUM(s.quantity), 0) as totalStock
        FROM items i
        LEFT JOIN $tableName s ON i.id = s.itemId
      ''';
      
      List<Object?> args = [];
      
      if (warehouseId != null) {
        sql += ' AND s.warehouseId = ?';
        args.add(warehouseId);
      }
      
      sql += '''
        WHERE i.isDeleted = 0 AND i.isActive = 1
        GROUP BY i.id
        HAVING totalStock < i.minStockLevel
        ORDER BY (totalStock / NULLIF(i.minStockLevel, 0)) ASC
      ''';
      
      final results = await database.rawQuery(sql, args);
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get low stock items: $e',
        error: e,
      ));
    }
  }
  
  /// Get items out of stock
  Future<Result<List<Map<String, dynamic>>>> getOutOfStockItems() async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          i.id,
          i.name,
          i.code,
          i.unit,
          i.category
        FROM items i
        LEFT JOIN $tableName s ON i.id = s.itemId AND s.quantity > 0
        WHERE i.isDeleted = 0 AND i.isActive = 1
        GROUP BY i.id
        HAVING COALESCE(SUM(s.quantity), 0) = 0
        ORDER BY i.name ASC
      ''');
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get out of stock items: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // STOCK OPERATIONS
  // =====================================================
  
  /// Update stock quantity (atomic)
  Future<Result<void>> updateQuantity(
    String stockId,
    double newQuantity, {
    double? newReservedQuantity,
  }) async {
    try {
      final database = await db.database;
      
      final Map<String, Object?> updates = {
        'quantity': newQuantity,
        'updatedAt': DateTime.now().toIso8601String(),
      };
      
      if (newReservedQuantity != null) {
        updates['reservedQuantity'] = newReservedQuantity;
      }
      
      await database.update(
        tableName,
        updates,
        where: 'id = ?',
        whereArgs: [stockId],
      );
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update stock quantity: $e',
        error: e,
      ));
    }
  }
  
  /// Increment stock quantity
  Future<Result<void>> incrementQuantity(
    String stockId,
    double amount,
  ) async {
    try {
      final database = await db.database;
      
      await database.rawUpdate('''
        UPDATE $tableName 
        SET quantity = quantity + ?,
            updatedAt = ?
        WHERE id = ?
      ''', [amount, DateTime.now().toIso8601String(), stockId]);
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to increment stock: $e',
        error: e,
      ));
    }
  }
  
  /// Decrement stock quantity
  Future<Result<void>> decrementQuantity(
    String stockId,
    double amount,
  ) async {
    try {
      final database = await db.database;
      
      // First check if we have enough
      final current = await database.query(
        tableName,
        columns: ['quantity', 'reservedQuantity'],
        where: 'id = ?',
        whereArgs: [stockId],
      );
      
      if (current.isEmpty) {
        return Result.failure(Failure.notFound('Stock entry', stockId));
      }
      
      final currentQty = (current.first['quantity'] as num).toDouble();
      final reservedQty = (current.first['reservedQuantity'] as num?)?.toDouble() ?? 0;
      final availableQty = currentQty - reservedQty;
      
      if (amount > availableQty) {
        return Result.failure(Failure.business(
          'Insufficient stock. Available: $availableQty, Requested: $amount',
        ));
      }
      
      await database.rawUpdate('''
        UPDATE $tableName 
        SET quantity = quantity - ?,
            updatedAt = ?
        WHERE id = ?
      ''', [amount, DateTime.now().toIso8601String(), stockId]);
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to decrement stock: $e',
        error: e,
      ));
    }
  }
  
  /// Reserve stock quantity
  Future<Result<void>> reserveQuantity(
    String stockId,
    double amount,
  ) async {
    try {
      final database = await db.database;
      
      // Check available
      final current = await database.query(
        tableName,
        columns: ['quantity', 'reservedQuantity'],
        where: 'id = ?',
        whereArgs: [stockId],
      );
      
      if (current.isEmpty) {
        return Result.failure(Failure.notFound('Stock entry', stockId));
      }
      
      final currentQty = (current.first['quantity'] as num).toDouble();
      final reservedQty = (current.first['reservedQuantity'] as num?)?.toDouble() ?? 0;
      final availableQty = currentQty - reservedQty;
      
      if (amount > availableQty) {
        return Result.failure(Failure.business(
          'Cannot reserve. Available: $availableQty, Requested: $amount',
        ));
      }
      
      await database.rawUpdate('''
        UPDATE $tableName 
        SET reservedQuantity = reservedQuantity + ?,
            updatedAt = ?
        WHERE id = ?
      ''', [amount, DateTime.now().toIso8601String(), stockId]);
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to reserve stock: $e',
        error: e,
      ));
    }
  }
  
  /// Release reserved stock
  Future<Result<void>> releaseReservation(
    String stockId,
    double amount,
  ) async {
    try {
      final database = await db.database;
      
      await database.rawUpdate('''
        UPDATE $tableName 
        SET reservedQuantity = MAX(0, reservedQuantity - ?),
            updatedAt = ?
        WHERE id = ?
      ''', [amount, DateTime.now().toIso8601String(), stockId]);
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to release reservation: $e',
        error: e,
      ));
    }
  }
  
  /// Delete zero-quantity stock entries (cleanup)
  Future<Result<int>> cleanupZeroStock() async {
    try {
      final database = await db.database;
      
      final deleted = await database.delete(
        tableName,
        where: 'quantity = 0 AND reservedQuantity = 0',
      );
      
      return Result.success(deleted);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to cleanup zero stock: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // BATCH QUERIES
  // =====================================================
  
  /// Get all batches for an item
  Future<Result<List<String>>> getBatchesForItem(String itemId) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT DISTINCT batchNumber 
        FROM $tableName 
        WHERE itemId = ? AND batchNumber IS NOT NULL AND quantity > 0
        ORDER BY batchNumber
      ''', [itemId]);
      
      return Result.success(
        results.map((row) => row['batchNumber'] as String).toList(),
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get batches: $e',
        error: e,
      ));
    }
  }
  
  /// Get stock by batch
  Future<Result<List<Stock>>> getStockByBatch(
    String itemId,
    String batchNumber,
  ) async {
    return getAll(
      where: 'itemId = ? AND batchNumber = ? AND quantity > 0',
      whereArgs: [itemId, batchNumber],
      orderBy: 'expiryDate ASC',
    );
  }
}
