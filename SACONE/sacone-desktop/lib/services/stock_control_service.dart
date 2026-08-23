import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'sync_queue_service.dart';
import 'unified_database_manager.dart';

/// Stock availability, negative-stock prevention, and reservations.
class StockControlService {
  static const _uuid = Uuid();

  static Future<double> getOnHandQty({
    required String itemId,
    required String warehouseId,
    Transaction? txn,
  }) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final rows = await db.rawQuery('''
      SELECT COALESCE(SUM(quantity), 0) as qty
      FROM stocks
      WHERE itemId = ? AND warehouseId = ?
    ''', [itemId, warehouseId]);

    return (rows.first['qty'] as num?)?.toDouble() ?? 0;
  }

  static Future<double> getReservedQty({
    required String itemId,
    required String warehouseId,
    Transaction? txn,
  }) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final rows = await db.rawQuery('''
      SELECT COALESCE(SUM(reservedQty), 0) as qty
      FROM stocks
      WHERE itemId = ? AND warehouseId = ?
    ''', [itemId, warehouseId]);

    return (rows.first['qty'] as num?)?.toDouble() ?? 0;
  }

  static Future<double> getAvailableQty({
    required String itemId,
    required String warehouseId,
    Transaction? txn,
  }) async {
    final onHand = await getOnHandQty(itemId: itemId, warehouseId: warehouseId, txn: txn);
    final reserved = await getReservedQty(itemId: itemId, warehouseId: warehouseId, txn: txn);
    return onHand - reserved;
  }

  static Future<void> assertAvailable({
    required String itemId,
    required String warehouseId,
    required double quantity,
    Transaction? txn,
  }) async {
    final available = await getAvailableQty(
      itemId: itemId,
      warehouseId: warehouseId,
      txn: txn,
    );
    if (quantity > available) {
      throw Exception(
        'Insufficient stock. Available: ${available.toStringAsFixed(2)}, requested: ${quantity.toStringAsFixed(2)}',
      );
    }
  }

  static Future<void> stockIn({
    required Transaction txn,
    required String itemId,
    required String warehouseId,
    required double quantity,
    String? cellId,
    String? updatedBy,
  }) async {
    if (quantity <= 0) throw Exception('Quantity must be positive');

    final existing = await txn.query(
      'stocks',
      where: 'itemId = ? AND warehouseId = ? AND cellId ${cellId != null ? '= ?' : 'IS NULL'}',
      whereArgs: cellId != null ? [itemId, warehouseId, cellId] : [itemId, warehouseId],
    );

    if (existing.isNotEmpty) {
      final current = (existing.first['quantity'] as num).toDouble();
      await txn.update(
        'stocks',
        {
          'quantity': current + quantity,
          'lastUpdated': DateTime.now().toIso8601String(),
          'updatedBy': updatedBy,
        },
        where: 'id = ?',
        whereArgs: [existing.first['id']],
      );
      final updated = await txn.query('stocks', where: 'id = ?', whereArgs: [existing.first['id']], limit: 1);
      if (updated.isNotEmpty) {
        await trackMutation(
          tableName: 'stocks',
          recordId: updated.first['id'] as String,
          operation: 'upsert',
          payload: updated.first,
          txn: txn,
        );
      }
    } else {
      final stockId = _uuid.v4();
      final row = {
        'id': stockId,
        'itemId': itemId,
        'warehouseId': warehouseId,
        'cellId': cellId,
        'quantity': quantity,
        'reservedQty': 0,
        'lastUpdated': DateTime.now().toIso8601String(),
        'updatedBy': updatedBy,
      };
      await txn.insert('stocks', row);
      await trackMutation(
        tableName: 'stocks',
        recordId: stockId,
        operation: 'upsert',
        payload: row,
        txn: txn,
      );
    }
  }

  static Future<void> stockOut({
    required Transaction txn,
    required String itemId,
    required String warehouseId,
    required double quantity,
    String? cellId,
    String? updatedBy,
  }) async {
    if (quantity <= 0) throw Exception('Quantity must be positive');

    await assertAvailable(itemId: itemId, warehouseId: warehouseId, quantity: quantity, txn: txn);

    final rows = await txn.query(
      'stocks',
      where: 'itemId = ? AND warehouseId = ? AND quantity > 0',
      whereArgs: [itemId, warehouseId],
      orderBy: 'lastUpdated ASC',
    );

    var remaining = quantity;
    for (final row in rows) {
      if (remaining <= 0) break;

      final stockId = row['id'] as String;
      final onHand = (row['quantity'] as num).toDouble();
      final reserved = (row['reservedQty'] as num?)?.toDouble() ?? 0;
      final available = onHand - reserved;
      if (available <= 0) continue;

      final deduct = remaining <= available ? remaining : available;
      final newQty = onHand - deduct;

      await txn.update(
        'stocks',
        {
          'quantity': newQty,
          'lastUpdated': DateTime.now().toIso8601String(),
          'updatedBy': updatedBy,
        },
        where: 'id = ?',
        whereArgs: [stockId],
      );
      final updated = await txn.query('stocks', where: 'id = ?', whereArgs: [stockId], limit: 1);
      if (updated.isNotEmpty) {
        await trackMutation(
          tableName: 'stocks',
          recordId: stockId,
          operation: 'upsert',
          payload: updated.first,
          txn: txn,
        );
      }

      remaining -= deduct;
    }

    if (remaining > 0.0001) {
      throw Exception('Could not fulfill stock out completely');
    }
  }

  static Future<String> reserveStock({
    required String itemId,
    required String warehouseId,
    required double quantity,
    required String referenceType,
    required String referenceId,
    Transaction? txn,
  }) async {
    Future<String> action(Transaction t) async {
      await assertAvailable(itemId: itemId, warehouseId: warehouseId, quantity: quantity, txn: t);

      final reservationId = _uuid.v4();
      await t.insert('stock_reservations', {
        'id': reservationId,
        'itemId': itemId,
        'warehouseId': warehouseId,
        'quantity': quantity,
        'referenceType': referenceType,
        'referenceId': referenceId,
        'status': 'active',
        'createdAt': DateTime.now().toIso8601String(),
      });

      final rows = await t.query(
        'stocks',
        where: 'itemId = ? AND warehouseId = ? AND quantity > reservedQty',
        whereArgs: [itemId, warehouseId],
        orderBy: 'lastUpdated ASC',
      );

      var remaining = quantity;
      for (final row in rows) {
        if (remaining <= 0) break;
        final onHand = (row['quantity'] as num).toDouble();
        final reserved = (row['reservedQty'] as num?)?.toDouble() ?? 0;
        final free = onHand - reserved;
        if (free <= 0) continue;

        final addReserve = remaining <= free ? remaining : free;
        await t.update(
          'stocks',
          {'reservedQty': reserved + addReserve},
          where: 'id = ?',
          whereArgs: [row['id']],
        );
        remaining -= addReserve;
      }

      return reservationId;
    }

    if (txn != null) return action(txn);
    final database = await DatabaseManager.instance.database;
    return database.transaction(action);
  }

  static Future<void> releaseReservation({
    required String referenceType,
    required String referenceId,
    Transaction? txn,
  }) async {
    Future<void> action(Transaction t) async {
      final reservations = await t.query(
        'stock_reservations',
        where: 'referenceType = ? AND referenceId = ? AND status = ?',
        whereArgs: [referenceType, referenceId, 'active'],
      );

      for (final res in reservations) {
        final qty = (res['quantity'] as num).toDouble();
        final itemId = res['itemId'] as String;
        final warehouseId = res['warehouseId'] as String;

        final stocks = await t.query(
          'stocks',
          where: 'itemId = ? AND warehouseId = ? AND reservedQty > 0',
          whereArgs: [itemId, warehouseId],
          orderBy: 'lastUpdated ASC',
        );

        var remaining = qty;
        for (final stock in stocks) {
          if (remaining <= 0) break;
          final reserved = (stock['reservedQty'] as num).toDouble();
          final release = remaining <= reserved ? remaining : reserved;
          await t.update(
            'stocks',
            {'reservedQty': reserved - release},
            where: 'id = ?',
            whereArgs: [stock['id']],
          );
          remaining -= release;
        }

        await t.update(
          'stock_reservations',
          {
            'status': 'released',
            'releasedAt': DateTime.now().toIso8601String(),
          },
          where: 'id = ?',
          whereArgs: [res['id']],
        );
      }
    }

    if (txn != null) {
      await action(txn);
    } else {
      final database = await DatabaseManager.instance.database;
      await database.transaction(action);
    }
  }
}
