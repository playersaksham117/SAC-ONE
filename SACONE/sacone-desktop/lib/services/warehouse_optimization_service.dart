import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';

/// Warehouse picking priority, fast-moving zones, location optimization.
class WarehouseOptimizationService {
  Future<void> upsertPickingConfig({
    required String warehouseId,
    String? zoneId,
    String? cellId,
    String? locationCode,
    int pickingPriority = 50,
    bool isFastMovingZone = false,
    double velocityScore = 0,
  }) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    final id = '${warehouseId}_${zoneId ?? ''}_${cellId ?? locationCode ?? 'default'}';

    await db.insert(
      'warehouse_picking_config',
      {
        'id': id,
        'warehouseId': warehouseId,
        'zoneId': zoneId,
        'cellId': cellId,
        'locationCode': locationCode,
        'pickingPriority': pickingPriority,
        'isFastMovingZone': isFastMovingZone ? 1 : 0,
        'velocityScore': velocityScore,
        'lastOptimizedAt': now,
        'createdAt': now,
        'updatedAt': now,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getPickPath({
    required String warehouseId,
    required List<String> itemIds,
  }) async {
    final db = await DatabaseManager.instance.database;
    if (itemIds.isEmpty) return [];

    final placeholders = List.filled(itemIds.length, '?').join(',');

    return db.rawQuery('''
      SELECT s.itemId, i.name, s.quantity, s.cellId,
             COALESCE(wpc.pickingPriority, 50) as pickingPriority,
             COALESCE(wpc.isFastMovingZone, 0) as isFastMovingZone,
             COALESCE(wpc.velocityScore, 0) as velocityScore
      FROM stocks s
      JOIN inventory_items i ON i.id = s.itemId
      LEFT JOIN warehouse_picking_config wpc
        ON wpc.warehouseId = s.warehouseId AND (wpc.cellId = s.cellId OR wpc.zoneId IS NOT NULL)
      WHERE s.warehouseId = ? AND s.itemId IN ($placeholders) AND s.quantity > 0
      ORDER BY isFastMovingZone DESC, pickingPriority ASC, velocityScore DESC
    ''', [warehouseId, ...itemIds]);
  }

  Future<void> recalculateVelocityScores({required String warehouseId, int days = 30}) async {
    final db = await DatabaseManager.instance.database;
    final since = DateTime.now().subtract(Duration(days: days)).toIso8601String();

    final velocities = await db.rawQuery('''
      SELECT sl.itemId, SUM(sl.quantity) as soldQty
      FROM sale_lines sl
      JOIN sales_invoices si ON si.id = sl.invoiceId
      WHERE si.warehouseId = ? AND si.invoiceDate >= ?
      GROUP BY sl.itemId
    ''', [warehouseId, since]);

    final now = DateTime.now().toIso8601String();
    for (final row in velocities) {
      final itemId = row['itemId'] as String;
      final soldQty = (row['soldQty'] as num).toDouble();
      final isFast = soldQty >= 20;

      await db.insert(
        'warehouse_picking_config',
        {
          'id': '${warehouseId}_item_$itemId',
          'warehouseId': warehouseId,
          'locationCode': itemId,
          'pickingPriority': isFast ? 10 : 50,
          'isFastMovingZone': isFast ? 1 : 0,
          'velocityScore': soldQty,
          'lastOptimizedAt': now,
          'createdAt': now,
          'updatedAt': now,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
  }

  Future<List<Map<String, dynamic>>> getOptimizationSummary(String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    return db.query(
      'warehouse_picking_config',
      where: 'warehouseId = ?',
      whereArgs: [warehouseId],
      orderBy: 'pickingPriority ASC, velocityScore DESC',
      limit: 50,
    );
  }
}
