/// ============================================================
/// MOVEMENT REPOSITORY - Data access for stock movements
/// ============================================================
/// 
/// Handles all database operations for stock movement audit trail.
/// Provides comprehensive querying for reports and analytics.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/stock_movement.dart';
import 'base_repository.dart';

/// Repository for StockMovement entities
class MovementRepository extends BaseRepository<StockMovement> {
  @override
  String get tableName => 'stock_movements';
  
  @override
  StockMovement fromMap(Map<String, dynamic> map) => StockMovement.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(StockMovement entity) => entity.toMap();
  
  // =====================================================
  // BASIC QUERIES
  // =====================================================
  
  /// Get movement by reference number
  Future<Result<StockMovement?>> getByReference(String referenceNumber) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'referenceNumber = ?',
        whereArgs: [referenceNumber],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch movement by reference: $e',
        error: e,
      ));
    }
  }
  
  /// Get movements for an item
  Future<Result<List<StockMovement>>> getForItem(
    String itemId, {
    DateTime? startDate,
    DateTime? endDate,
    MovementType? type,
    PageRequest? page,
  }) async {
    String where = 'itemId = ?';
    List<Object?> whereArgs = [itemId];
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    if (type != null) {
      where += ' AND movementType = ?';
      whereArgs.add(type.name);
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get movements at a location
  Future<Result<List<StockMovement>>> getForLocation(
    String locationId, {
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    String where = '(fromLocationId = ? OR toLocationId = ?)';
    List<Object?> whereArgs = [locationId, locationId];
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get movements in a warehouse
  Future<Result<List<StockMovement>>> getForWarehouse(
    String warehouseId, {
    DateTime? startDate,
    DateTime? endDate,
    MovementType? type,
    PageRequest? page,
  }) async {
    String where = '(fromWarehouseId = ? OR toWarehouseId = ?)';
    List<Object?> whereArgs = [warehouseId, warehouseId];
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    if (type != null) {
      where += ' AND movementType = ?';
      whereArgs.add(type.name);
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  // =====================================================
  // TYPE-SPECIFIC QUERIES
  // =====================================================
  
  /// Get stock-in movements
  Future<Result<List<StockMovement>>> getStockIns({
    DateTime? startDate,
    DateTime? endDate,
    String? warehouseId,
    PageRequest? page,
  }) async {
    String where = 'movementType = ?';
    List<Object?> whereArgs = [MovementType.stockIn.name];
    
    if (warehouseId != null) {
      where += ' AND toWarehouseId = ?';
      whereArgs.add(warehouseId);
    }
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get stock-out movements
  Future<Result<List<StockMovement>>> getStockOuts({
    DateTime? startDate,
    DateTime? endDate,
    String? warehouseId,
    PageRequest? page,
  }) async {
    String where = 'movementType = ?';
    List<Object?> whereArgs = [MovementType.stockOut.name];
    
    if (warehouseId != null) {
      where += ' AND fromWarehouseId = ?';
      whereArgs.add(warehouseId);
    }
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get transfers
  Future<Result<List<StockMovement>>> getTransfers({
    DateTime? startDate,
    DateTime? endDate,
    String? warehouseId,
    bool interWarehouseOnly = false,
    PageRequest? page,
  }) async {
    String where = 'movementType = ?';
    List<Object?> whereArgs = [MovementType.transfer.name];
    
    if (warehouseId != null) {
      where += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
      whereArgs.add(warehouseId);
      whereArgs.add(warehouseId);
    }
    
    if (interWarehouseOnly) {
      where += ' AND fromWarehouseId != toWarehouseId';
    }
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get adjustments
  Future<Result<List<StockMovement>>> getAdjustments({
    DateTime? startDate,
    DateTime? endDate,
    String? warehouseId,
    MovementReason? reason,
    PageRequest? page,
  }) async {
    String where = 'movementType = ?';
    List<Object?> whereArgs = [MovementType.adjustment.name];
    
    if (warehouseId != null) {
      where += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
      whereArgs.add(warehouseId);
      whereArgs.add(warehouseId);
    }
    
    if (reason != null) {
      where += ' AND reason = ?';
      whereArgs.add(reason.name);
    }
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get cycle count movements
  Future<Result<List<StockMovement>>> getCycleCounts({
    DateTime? startDate,
    DateTime? endDate,
    String? warehouseId,
    PageRequest? page,
  }) async {
    String where = 'movementType = ?';
    List<Object?> whereArgs = [MovementType.cycleCount.name];
    
    if (warehouseId != null) {
      where += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
      whereArgs.add(warehouseId);
      whereArgs.add(warehouseId);
    }
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  // =====================================================
  // STATUS QUERIES
  // =====================================================
  
  /// Get pending movements
  Future<Result<List<StockMovement>>> getPending({
    String? warehouseId,
    MovementType? type,
  }) async {
    String where = 'status = ?';
    List<Object?> whereArgs = [MovementStatus.pending.name];
    
    if (warehouseId != null) {
      where += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
      whereArgs.add(warehouseId);
      whereArgs.add(warehouseId);
    }
    
    if (type != null) {
      where += ' AND movementType = ?';
      whereArgs.add(type.name);
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt ASC',
    );
  }
  
  /// Get draft movements (pending status)
  Future<Result<List<StockMovement>>> getDrafts({String? userId}) async {
    String where = 'status = ?';
    List<Object?> whereArgs = [MovementStatus.pending.name];
    
    if (userId != null) {
      where += ' AND performedBy = ?';
      whereArgs.add(userId);
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
    );
  }
  
  /// Update movement status
  Future<Result<void>> updateStatus(
    String movementId,
    MovementStatus newStatus, {
    String? reason,
    String? verifiedBy,
  }) async {
    try {
      final database = await db.database;
      
      final Map<String, Object?> updates = {
        'status': newStatus.name,
        'updatedAt': DateTime.now().toIso8601String(),
      };
      
      if (verifiedBy != null) {
        updates['verifiedBy'] = verifiedBy;
      }
      
      if (reason != null && newStatus == MovementStatus.cancelled) {
        updates['notes'] = reason;
      }
      
      await database.update(
        tableName,
        updates,
        where: 'id = ?',
        whereArgs: [movementId],
      );
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update movement status: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // USER QUERIES
  // =====================================================
  
  /// Get movements by user
  Future<Result<List<StockMovement>>> getByUser(
    String userId, {
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    String where = 'performedBy = ?';
    List<Object?> whereArgs = [userId];
    
    if (startDate != null) {
      where += ' AND createdAt >= ?';
      whereArgs.add(startDate.toIso8601String());
    }
    
    if (endDate != null) {
      where += ' AND createdAt <= ?';
      whereArgs.add(endDate.toIso8601String());
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  // =====================================================
  // BATCH QUERIES
  // =====================================================
  
  /// Get movements for a batch
  Future<Result<List<StockMovement>>> getForBatch(
    String itemId,
    String batchNumber, {
    PageRequest? page,
  }) async {
    return getAll(
      where: 'itemId = ? AND batchNumber = ?',
      whereArgs: [itemId, batchNumber],
      orderBy: 'createdAt DESC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  // =====================================================
  // WITH DETAILS (JOINED QUERIES)
  // =====================================================
  
  /// Get movement with full details
  Future<Result<MovementDetails?>> getWithDetails(String movementId) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          m.*,
          i.name as itemName,
          i.code as itemCode,
          i.unit as itemUnit,
          fl.name as fromLocationName,
          fl.fullPath as fromLocationPath,
          tl.name as toLocationName,
          tl.fullPath as toLocationPath,
          fw.name as fromWarehouseName,
          tw.name as toWarehouseName,
          u.username as performedByName
        FROM $tableName m
        JOIN items i ON m.itemId = i.id
        LEFT JOIN locations fl ON m.fromLocationId = fl.id
        LEFT JOIN locations tl ON m.toLocationId = tl.id
        LEFT JOIN warehouses fw ON m.fromWarehouseId = fw.id
        LEFT JOIN warehouses tw ON m.toWarehouseId = tw.id
        LEFT JOIN users u ON m.performedBy = u.id
        WHERE m.id = ?
      ''', [movementId]);
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(MovementDetails.fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get movement details: $e',
        error: e,
      ));
    }
  }
  
  /// Get recent movements with details
  Future<Result<List<MovementDetails>>> getRecentWithDetails({
    String? warehouseId,
    int limit = 20,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT 
          m.*,
          i.name as itemName,
          i.code as itemCode,
          i.unit as itemUnit,
          fl.name as fromLocationName,
          fl.fullPath as fromLocationPath,
          tl.name as toLocationName,
          tl.fullPath as toLocationPath,
          fw.name as fromWarehouseName,
          tw.name as toWarehouseName,
          u.username as performedByName
        FROM $tableName m
        JOIN items i ON m.itemId = i.id
        LEFT JOIN locations fl ON m.fromLocationId = fl.id
        LEFT JOIN locations tl ON m.toLocationId = tl.id
        LEFT JOIN warehouses fw ON m.fromWarehouseId = fw.id
        LEFT JOIN warehouses tw ON m.toWarehouseId = tw.id
        LEFT JOIN users u ON m.performedBy = u.id
      ''';
      
      List<Object?> args = [];
      
      if (warehouseId != null) {
        sql += ' WHERE m.fromWarehouseId = ? OR m.toWarehouseId = ?';
        args.add(warehouseId);
        args.add(warehouseId);
      }
      
      sql += ' ORDER BY m.createdAt DESC LIMIT ?';
      args.add(limit);
      
      final results = await database.rawQuery(sql, args);
      
      return Result.success(
        results.map((row) => MovementDetails.fromMap(row)).toList(),
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get recent movements: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // AGGREGATIONS & ANALYTICS
  // =====================================================
  
  /// Get movement summary by type for date range
  Future<Result<Map<MovementType, int>>> getSummaryByType({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT movementType, COUNT(*) as count
        FROM $tableName
        WHERE createdAt >= ? AND createdAt <= ?
      ''';
      List<Object?> args = [
        startDate.toIso8601String(),
        endDate.toIso8601String(),
      ];
      
      if (warehouseId != null) {
        sql += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
        args.add(warehouseId);
        args.add(warehouseId);
      }
      
      sql += ' GROUP BY movementType';
      
      final results = await database.rawQuery(sql, args);
      
      final map = <MovementType, int>{};
      for (final row in results) {
        final type = MovementType.values.firstWhere(
          (t) => t.name == row['movementType'],
          orElse: () => MovementType.adjustment,
        );
        map[type] = row['count'] as int;
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get summary by type: $e',
        error: e,
      ));
    }
  }
  
  /// Get total quantities moved by type
  Future<Result<Map<MovementType, double>>> getQuantitiesByType({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT movementType, COALESCE(SUM(quantity), 0) as total
        FROM $tableName
        WHERE createdAt >= ? AND createdAt <= ? AND status = ?
      ''';
      List<Object?> args = [
        startDate.toIso8601String(),
        endDate.toIso8601String(),
        MovementStatus.completed.name,
      ];
      
      if (warehouseId != null) {
        sql += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
        args.add(warehouseId);
        args.add(warehouseId);
      }
      
      sql += ' GROUP BY movementType';
      
      final results = await database.rawQuery(sql, args);
      
      final map = <MovementType, double>{};
      for (final row in results) {
        final type = MovementType.values.firstWhere(
          (t) => t.name == row['movementType'],
          orElse: () => MovementType.adjustment,
        );
        map[type] = (row['total'] as num).toDouble();
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get quantities by type: $e',
        error: e,
      ));
    }
  }
  
  /// Get daily movement counts
  Future<Result<List<Map<String, dynamic>>>> getDailyMovements({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
    MovementType? type,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT 
          DATE(createdAt) as date,
          COUNT(*) as count,
          SUM(quantity) as totalQuantity
        FROM $tableName
        WHERE createdAt >= ? AND createdAt <= ?
      ''';
      List<Object?> args = [
        startDate.toIso8601String(),
        endDate.toIso8601String(),
      ];
      
      if (warehouseId != null) {
        sql += ' AND (fromWarehouseId = ? OR toWarehouseId = ?)';
        args.add(warehouseId);
        args.add(warehouseId);
      }
      
      if (type != null) {
        sql += ' AND movementType = ?';
        args.add(type.name);
      }
      
      sql += ' GROUP BY DATE(createdAt) ORDER BY date ASC';
      
      final results = await database.rawQuery(sql, args);
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get daily movements: $e',
        error: e,
      ));
    }
  }
  
  /// Get top items by movement count
  Future<Result<List<Map<String, dynamic>>>> getTopMovedItems({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
    int limit = 10,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT 
          m.itemId,
          i.name as itemName,
          i.code as itemCode,
          COUNT(*) as movementCount,
          SUM(m.quantity) as totalQuantity
        FROM $tableName m
        JOIN items i ON m.itemId = i.id
        WHERE m.createdAt >= ? AND m.createdAt <= ?
      ''';
      List<Object?> args = [
        startDate.toIso8601String(),
        endDate.toIso8601String(),
      ];
      
      if (warehouseId != null) {
        sql += ' AND (m.fromWarehouseId = ? OR m.toWarehouseId = ?)';
        args.add(warehouseId);
        args.add(warehouseId);
      }
      
      sql += '''
        GROUP BY m.itemId
        ORDER BY movementCount DESC
        LIMIT ?
      ''';
      args.add(limit);
      
      final results = await database.rawQuery(sql, args);
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get top moved items: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // REFERENCE NUMBER GENERATION
  // =====================================================
  
  /// Generate next reference number for movement type
  Future<Result<String>> generateReferenceNumber(MovementType type) async {
    try {
      final prefix = switch (type) {
        MovementType.stockIn => 'SI',
        MovementType.stockOut => 'SO',
        MovementType.transfer => 'TR',
        MovementType.adjustment => 'ADJ',
        MovementType.cycleCount => 'CC',
        MovementType.returnIn => 'RI',
        MovementType.returnOut => 'RO',
        MovementType.disposal => 'DSP',
        MovementType.opening => 'OPN',
        MovementType.reserve => 'RSV',
        MovementType.release => 'RLS',
      };
      
      final sequenceName = 'movement_${type.name}';
      final sequence = await db.getNextSequence(sequenceName);
      final date = DateTime.now();
      final datePart = '${date.year}${date.month.toString().padLeft(2, '0')}${date.day.toString().padLeft(2, '0')}';
      
      return Result.success('$prefix-$datePart-${sequence.toString().padLeft(5, '0')}');
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to generate reference number: $e',
        error: e,
      ));
    }
  }
}
