import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

import '../models/stock_adjustment.dart';
import '../models/batch_info.dart';
import 'stock_control_service.dart';

/// Service for managing stock adjustments
class AdjustmentService {
  final Database _db;
  static const _uuid = Uuid();

  AdjustmentService(this._db);

  /// Current on-hand quantity for item at warehouse/cell.
  Future<double> getStockQuantity(
    String itemId,
    String warehouseId, {
    String? cellId,
  }) async {
    String where = 'itemId = ? AND warehouseId = ?';
    final args = <Object?>[itemId, warehouseId];
    if (cellId != null) {
      where += ' AND cellId = ?';
      args.add(cellId);
    } else {
      where += ' AND (cellId IS NULL OR cellId = \'\')';
    }

    final rows = await _db.query('stocks', where: where, whereArgs: args);
    if (rows.isEmpty) return 0;
    return rows.fold<double>(0, (sum, r) => sum + ((r['quantity'] as num?)?.toDouble() ?? 0));
  }

  /// Total stock across all cells in a warehouse.
  Future<double> getWarehouseStockQuantity(String itemId, String warehouseId) async {
    final rows = await _db.query(
      'stocks',
      where: 'itemId = ? AND warehouseId = ?',
      whereArgs: [itemId, warehouseId],
    );
    return rows.fold<double>(0, (sum, r) => sum + ((r['quantity'] as num?)?.toDouble() ?? 0));
  }

  /// List stock rows at a cell for correction UI.
  Future<List<Map<String, dynamic>>> getCellStockRows(String warehouseId, {String? cellId}) async {
    String where = 'warehouseId = ? AND quantity > 0';
    final args = <Object?>[warehouseId];
    if (cellId != null) {
      where += ' AND cellId = ?';
      args.add(cellId);
    }
    final rows = await _db.rawQuery('''
      SELECT s.*, i.name as itemName, i.sku as itemSku, c.name as cellName, c.code as cellCode
      FROM stocks s
      JOIN inventory_items i ON i.id = s.itemId
      LEFT JOIN cells c ON c.id = s.cellId
      WHERE $where
      ORDER BY i.name ASC
    ''', args);
    return rows;
  }

  Future<List<Map<String, dynamic>>> getCellsForWarehouse(String warehouseId) async {
    return _db.query('cells', where: 'warehouseId = ?', whereArgs: [warehouseId], orderBy: 'code ASC');
  }

  /// Create a new adjustment
  Future<String> createAdjustment(StockAdjustment adjustment) async {
    try {
      await _db.insert(
        'stock_adjustments',
        adjustment.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      return adjustment.id;
    } catch (e) {
      throw Exception('Failed to create adjustment: $e');
    }
  }

  /// Get adjustment by ID
  Future<StockAdjustment?> getAdjustmentById(String id) async {
    try {
      final result = await _db.query(
        'stock_adjustments',
        where: 'id = ?',
        whereArgs: [id],
      );

      if (result.isEmpty) return null;
      return StockAdjustment.fromMap(result.first);
    } catch (e) {
      throw Exception('Failed to get adjustment: $e');
    }
  }

  /// Get all adjustments
  Future<List<StockAdjustment>> getAllAdjustments({
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final result = await _db.query(
        'stock_adjustments',
        orderBy: 'createdAt DESC',
        limit: limit,
        offset: offset,
      );

      return result.map((map) => StockAdjustment.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get adjustments: $e');
    }
  }

  /// Get adjustments by status
  Future<List<StockAdjustment>> getAdjustmentsByStatus(
    AdjustmentStatus status, {
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final result = await _db.query(
        'stock_adjustments',
        where: 'status = ?',
        whereArgs: [status.code],
        orderBy: 'createdAt DESC',
        limit: limit,
        offset: offset,
      );

      return result.map((map) => StockAdjustment.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get adjustments by status: $e');
    }
  }

  /// Get adjustments by item ID
  Future<List<StockAdjustment>> getAdjustmentsByItem(String itemId) async {
    try {
      final result = await _db.query(
        'stock_adjustments',
        where: 'itemId = ?',
        whereArgs: [itemId],
        orderBy: 'createdAt DESC',
      );

      return result.map((map) => StockAdjustment.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get adjustments by item: $e');
    }
  }

  /// Get adjustments by warehouse ID
  Future<List<StockAdjustment>> getAdjustmentsByWarehouse(
    String warehouseId, {
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final result = await _db.query(
        'stock_adjustments',
        where: 'warehouseId = ?',
        whereArgs: [warehouseId],
        orderBy: 'createdAt DESC',
        limit: limit,
        offset: offset,
      );

      return result.map((map) => StockAdjustment.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get adjustments by warehouse: $e');
    }
  }

  /// Update adjustment
  Future<void> updateAdjustment(StockAdjustment adjustment) async {
    try {
      await _db.update(
        'stock_adjustments',
        adjustment.copyWith(updatedAt: DateTime.now()).toMap(),
        where: 'id = ?',
        whereArgs: [adjustment.id],
      );
    } catch (e) {
      throw Exception('Failed to update adjustment: $e');
    }
  }

  /// Approve an adjustment and apply stock changes.
  Future<void> approveAdjustment(String adjustmentId, String approvedBy) async {
    final adj = await getAdjustmentById(adjustmentId);
    if (adj == null) throw Exception('Adjustment not found');
    if (adj.status != AdjustmentStatus.pending) {
      throw Exception('Adjustment is not pending');
    }

    await _db.transaction((txn) async {
      await _applyStockChange(txn, adj, approvedBy);
      await txn.update(
        'stock_adjustments',
        {
          'status': AdjustmentStatus.approved.code,
          'approvedBy': approvedBy,
          'approvedAt': DateTime.now().toIso8601String(),
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [adjustmentId],
      );
    });
  }

  /// Create and immediately apply a cell quantity correction.
  Future<String> correctCellStock({
    required String itemId,
    required String itemName,
    required String itemSku,
    required String warehouseId,
    required String warehouseName,
    required String cellId,
    required String cellName,
    required double targetQuantity,
    required String reason,
    required String createdBy,
    String? notes,
  }) async {
    final currentQty = await getStockQuantity(itemId, warehouseId, cellId: cellId);
    final delta = targetQuantity - currentQty;
    if (delta.abs() < 0.0001) {
      throw Exception('No change needed — cell already at $targetQuantity');
    }

    final adjustment = StockAdjustment(
      id: _uuid.v4(),
      itemId: itemId,
      itemName: itemName,
      itemSku: itemSku,
      warehouseId: warehouseId,
      warehouseName: warehouseName,
      cellId: cellId,
      cellName: cellName,
      quantityBefore: currentQty,
      quantityAdjusted: delta,
      quantityAfter: targetQuantity,
      adjustmentType: AdjustmentType.correction,
      status: AdjustmentStatus.approved,
      reason: reason,
      notes: notes,
      createdBy: createdBy,
      approvedBy: createdBy,
      createdAt: DateTime.now(),
      approvedAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await _db.transaction((txn) async {
      await txn.insert('stock_adjustments', adjustment.toMap());
      await _applyStockChange(txn, adjustment, createdBy);
    });

    return adjustment.id;
  }

  Future<void> _applyStockChange(Transaction txn, StockAdjustment adj, String performedBy) async {
    final delta = adj.quantityAdjusted;
    final now = DateTime.now().toIso8601String();

    if (delta > 0) {
      await StockControlService.stockIn(
        txn: txn,
        itemId: adj.itemId,
        warehouseId: adj.warehouseId,
        quantity: delta,
        cellId: adj.cellId,
        updatedBy: performedBy,
      );
    } else if (delta < 0) {
      final qty = delta.abs();
      if (adj.cellId != null && adj.cellId!.isNotEmpty) {
        final rows = await txn.query(
          'stocks',
          where: 'itemId = ? AND warehouseId = ? AND cellId = ?',
          whereArgs: [adj.itemId, adj.warehouseId, adj.cellId],
          limit: 1,
        );
        if (rows.isEmpty) throw Exception('No stock found in selected cell');
        final current = (rows.first['quantity'] as num).toDouble();
        if (current < qty) throw Exception('Insufficient stock in cell (have $current, need $qty)');
        await txn.update(
          'stocks',
          {'quantity': current - qty, 'lastUpdated': now, 'updatedBy': performedBy},
          where: 'id = ?',
          whereArgs: [rows.first['id']],
        );
      } else {
        await StockControlService.stockOut(
          txn: txn,
          itemId: adj.itemId,
          warehouseId: adj.warehouseId,
          quantity: qty,
          cellId: adj.cellId,
          updatedBy: performedBy,
        );
      }
    }

    await txn.insert('transactions', {
      'id': _uuid.v4(),
      'itemId': adj.itemId,
      'warehouseId': adj.warehouseId,
      'type': 'adjustment',
      'quantity': delta.abs(),
      'unitPrice': 0,
      'totalAmount': 0,
      'referenceNumber': adj.id,
      'notes': '${adj.adjustmentType.label}: ${adj.reason}${adj.cellName != null ? ' @ ${adj.cellName}' : ''}',
      'transactionDate': DateTime.now().toIso8601String(),
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  /// Reject an adjustment
  Future<void> rejectAdjustment(String adjustmentId) async {
    try {
      await _db.update(
        'stock_adjustments',
        {
          'status': AdjustmentStatus.rejected.code,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [adjustmentId],
      );
    } catch (e) {
      throw Exception('Failed to reject adjustment: $e');
    }
  }

  /// Delete adjustment
  Future<void> deleteAdjustment(String id) async {
    try {
      await _db.delete(
        'stock_adjustments',
        where: 'id = ?',
        whereArgs: [id],
      );
    } catch (e) {
      throw Exception('Failed to delete adjustment: $e');
    }
  }

  /// Get adjustment summary for a period
  Future<Map<String, dynamic>> getAdjustmentSummary({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      String whereClause = '';
      List<dynamic> whereArgs = [];

      if (startDate != null) {
        whereClause += 'createdAt >= ?';
        whereArgs.add(startDate.toIso8601String());
      }

      if (endDate != null) {
        if (whereClause.isNotEmpty) whereClause += ' AND ';
        whereClause += 'createdAt <= ?';
        whereArgs.add(endDate.toIso8601String());
      }

      final totalCount = await _db.rawQuery(
        'SELECT COUNT(*) as count FROM stock_adjustments${whereClause.isNotEmpty ? ' WHERE $whereClause' : ''}',
        whereArgs,
      );

      final byType = await _db.rawQuery('''
        SELECT adjustmentType, COUNT(*) as count, SUM(ABS(quantityAdjusted)) as totalQty
        FROM stock_adjustments
        ${whereClause.isNotEmpty ? 'WHERE $whereClause' : ''}
        GROUP BY adjustmentType
      ''', whereArgs);

      final byStatus = await _db.rawQuery('''
        SELECT status, COUNT(*) as count
        FROM stock_adjustments
        ${whereClause.isNotEmpty ? 'WHERE $whereClause' : ''}
        GROUP BY status
      ''', whereArgs);

      return {
        'totalCount': totalCount.first['count'],
        'byType': byType,
        'byStatus': byStatus,
      };
    } catch (e) {
      throw Exception('Failed to get adjustment summary: $e');
    }
  }
}

/// Service for managing batch information
class BatchService {
  final Database _db;

  BatchService(this._db);

  /// Create a new batch
  Future<String> createBatch(BatchInfo batch) async {
    try {
      await _db.insert(
        'batch_info',
        batch.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      return batch.id;
    } catch (e) {
      throw Exception('Failed to create batch: $e');
    }
  }

  /// Get all batches (for batch tracking tab)
  Future<List<BatchInfo>> getAllBatches({int limit = 200}) async {
    try {
      final result = await _db.query(
        'batch_info',
        orderBy: 'expiryDate ASC',
        limit: limit,
      );
      return result.map((map) => BatchInfo.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get batches: $e');
    }
  }

  /// Get batch by ID
  Future<BatchInfo?> getBatchById(String id) async {
    try {
      final result = await _db.query(
        'batch_info',
        where: 'id = ?',
        whereArgs: [id],
      );

      if (result.isEmpty) return null;
      return BatchInfo.fromMap(result.first);
    } catch (e) {
      throw Exception('Failed to get batch: $e');
    }
  }

  /// Get all batches for an item
  Future<List<BatchInfo>> getBatchesByItem(String itemId) async {
    try {
      final result = await _db.query(
        'batch_info',
        where: 'itemId = ?',
        whereArgs: [itemId],
        orderBy: 'expiryDate ASC',
      );

      return result.map((map) => BatchInfo.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get batches: $e');
    }
  }

  /// Get all batches for a warehouse
  Future<List<BatchInfo>> getBatchesByWarehouse(String warehouseId) async {
    try {
      final result = await _db.query(
        'batch_info',
        where: 'warehouseId = ?',
        whereArgs: [warehouseId],
        orderBy: 'expiryDate ASC',
      );

      return result.map((map) => BatchInfo.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get warehouse batches: $e');
    }
  }

  /// Get expired batches
  Future<List<BatchInfo>> getExpiredBatches({
    String? warehouseId,
  }) async {
    try {
      String whereClause = 'expiryDate IS NOT NULL AND expiryDate < ?';
      List<dynamic> whereArgs = [DateTime.now().toIso8601String()];

      if (warehouseId != null) {
        whereClause += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }

      final result = await _db.query(
        'batch_info',
        where: whereClause,
        whereArgs: whereArgs,
        orderBy: 'expiryDate ASC',
      );

      return result.map((map) => BatchInfo.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get expired batches: $e');
    }
  }

  /// Get batches nearing expiry (within 30 days)
  Future<List<BatchInfo>> getBatchesNearingExpiry({
    String? warehouseId,
  }) async {
    try {
      final now = DateTime.now();
      final thirtyDaysLater = now.add(const Duration(days: 30));

      String whereClause = 'expiryDate IS NOT NULL AND expiryDate > ? AND expiryDate <= ?';
      List<dynamic> whereArgs = [
        now.toIso8601String(),
        thirtyDaysLater.toIso8601String(),
      ];

      if (warehouseId != null) {
        whereClause += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }

      final result = await _db.query(
        'batch_info',
        where: whereClause,
        whereArgs: whereArgs,
        orderBy: 'expiryDate ASC',
      );

      return result.map((map) => BatchInfo.fromMap(map)).toList();
    } catch (e) {
      throw Exception('Failed to get batches nearing expiry: $e');
    }
  }

  /// Get batch by batch number
  Future<BatchInfo?> getBatchByNumber(String itemId, String batchNumber) async {
    try {
      final result = await _db.query(
        'batch_info',
        where: 'itemId = ? AND batchNumber = ?',
        whereArgs: [itemId, batchNumber],
      );

      if (result.isEmpty) return null;
      return BatchInfo.fromMap(result.first);
    } catch (e) {
      throw Exception('Failed to get batch by number: $e');
    }
  }

  /// Update batch quantity
  Future<void> updateBatchQuantity(String batchId, double newQuantity) async {
    try {
      await _db.update(
        'batch_info',
        {
          'quantity': newQuantity,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [batchId],
      );
    } catch (e) {
      throw Exception('Failed to update batch quantity: $e');
    }
  }

  /// Update batch
  Future<void> updateBatch(BatchInfo batch) async {
    try {
      await _db.update(
        'batch_info',
        batch.copyWith(updatedAt: DateTime.now()).toMap(),
        where: 'id = ?',
        whereArgs: [batch.id],
      );
    } catch (e) {
      throw Exception('Failed to update batch: $e');
    }
  }

  /// Delete batch
  Future<void> deleteBatch(String id) async {
    try {
      await _db.delete(
        'batch_info',
        where: 'id = ?',
        whereArgs: [id],
      );
    } catch (e) {
      throw Exception('Failed to delete batch: $e');
    }
  }

  /// Get batch statistics
  Future<Map<String, dynamic>> getBatchStatistics({
    String? warehouseId,
  }) async {
    try {
      String whereClause = '';
      List<dynamic> whereArgs = [];

      if (warehouseId != null) {
        whereClause = 'WHERE warehouseId = ?';
        whereArgs = [warehouseId];
      }

      // Total batches
      final totalCount = await _db.rawQuery(
        'SELECT COUNT(*) as count FROM batch_info $whereClause',
        whereArgs,
      );

      // Expired batches
      whereClause += '${whereClause.isEmpty ? 'WHERE' : ' AND'} expiryDate IS NOT NULL AND expiryDate < ?';
      whereArgs.add(DateTime.now().toIso8601String());

      final expiredCount = await _db.rawQuery(
        'SELECT COUNT(*) as count, SUM(quantity) as totalQty FROM batch_info $whereClause',
        whereArgs,
      );

      // Nearing expiry
      final now = DateTime.now();
      final thirtyDaysLater = now.add(const Duration(days: 30));

      final nearingExpiryCount = await _db.rawQuery(
        'SELECT COUNT(*) as count, SUM(quantity) as totalQty FROM batch_info'
        ' WHERE expiryDate IS NOT NULL AND expiryDate > ? AND expiryDate <= ?'
        '${warehouseId != null ? ' AND warehouseId = ?' : ''}',
        [
          now.toIso8601String(),
          thirtyDaysLater.toIso8601String(),
          if (warehouseId != null) warehouseId,
        ],
      );

      return {
        'totalBatches': totalCount.first['count'],
        'expiredBatches': expiredCount.first['count'] ?? 0,
        'expiredQuantity': expiredCount.first['totalQty'] ?? 0,
        'nearingExpiryBatches': nearingExpiryCount.first['count'] ?? 0,
        'nearingExpiryQuantity': nearingExpiryCount.first['totalQty'] ?? 0,
      };
    } catch (e) {
      throw Exception('Failed to get batch statistics: $e');
    }
  }
}
