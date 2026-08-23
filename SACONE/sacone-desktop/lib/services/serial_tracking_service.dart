import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';
import 'audit_service.dart';

class SerialTrackingService {
  static const _uuid = Uuid();

  Future<List<Map<String, dynamic>>> search(String query) async {
    final db = await DatabaseManager.instance.database;
    final q = '%$query%';
    return db.rawQuery('''
      SELECT s.*, i.name as itemName, i.sku
      FROM serial_numbers s
      JOIN inventory_items i ON i.id = s.itemId
      WHERE s.serialNumber LIKE ? OR s.imei LIKE ? OR i.sku LIKE ?
      ORDER BY s.updatedAt DESC
      LIMIT 100
    ''', [q, q, q]);
  }

  Future<Map<String, dynamic>> registerSerial({
    required String itemId,
    required String serialNumber,
    String? imei,
    String? warehouseId,
    String? purchaseOrderId,
    Transaction? txn,
  }) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    final id = _uuid.v4();

    final row = {
      'id': id,
      'itemId': itemId,
      'serialNumber': serialNumber,
      'imei': imei,
      'status': 'in_stock',
      'warehouseId': warehouseId,
      'purchaseOrderId': purchaseOrderId,
      'receivedAt': now,
      'createdAt': now,
      'updatedAt': now,
      'syncStatus': 'local',
    };

    if (txn != null) {
      await txn.insert('serial_numbers', row);
    } else {
      await db.insert('serial_numbers', row);
    }

    await AuditService.log(
      module: 'serial',
      action: 'register',
      entityType: 'serial_number',
      entityId: id,
      payload: {'serialNumber': serialNumber, 'itemId': itemId},
      txn: txn,
    );

    return row;
  }

  Future<void> mapSerialsToSale({
    required Transaction txn,
    required String saleInvoiceId,
    required String saleLineId,
    required String itemId,
    required List<String> serialNumbers,
    String? customerId,
  }) async {
    final now = DateTime.now().toIso8601String();

    for (final sn in serialNumbers) {
      final rows = await txn.query(
        'serial_numbers',
        where: 'serialNumber = ? AND itemId = ? AND status = ?',
        whereArgs: [sn, itemId, 'in_stock'],
        limit: 1,
      );
      if (rows.isEmpty) {
        throw Exception('Serial $sn not available for sale');
      }

      final serial = rows.first;
      final serialId = serial['id'] as String;

      await txn.insert('sale_serial_mappings', {
        'id': _uuid.v4(),
        'serialId': serialId,
        'serialNumber': sn,
        'saleInvoiceId': saleInvoiceId,
        'saleLineId': saleLineId,
        'customerId': customerId,
        'soldAt': now,
        'returnValidated': 0,
      });

      await txn.update(
        'serial_numbers',
        {
          'status': 'sold',
          'saleInvoiceId': saleInvoiceId,
          'soldAt': now,
          'updatedAt': now,
        },
        where: 'id = ?',
        whereArgs: [serialId],
      );
    }
  }

  Future<Map<String, dynamic>> validateAndProcessReturn({
    required String serialNumber,
    required String reason,
    bool restock = true,
    String? createdBy,
  }) async {
    final db = await DatabaseManager.instance.database;

    return db.transaction((txn) async {
      final rows = await txn.query(
        'serial_numbers',
        where: 'serialNumber = ?',
        whereArgs: [serialNumber],
        limit: 1,
      );
      if (rows.isEmpty) throw Exception('Serial not found');

      final serial = rows.first;
      if (serial['status'] != 'sold') {
        throw Exception('Serial is not in sold status');
      }

      final saleInvoiceId = serial['saleInvoiceId'] as String?;
      if (saleInvoiceId == null) throw Exception('No sale linked to serial');

      final mappingRows = await txn.query(
        'sale_serial_mappings',
        where: 'serialId = ? AND saleInvoiceId = ?',
        whereArgs: [serial['id'], saleInvoiceId],
        limit: 1,
      );

      final isValid = mappingRows.isNotEmpty && mappingRows.first['returnedAt'] == null;
      final now = DateTime.now().toIso8601String();

      await txn.insert('serial_returns', {
        'id': _uuid.v4(),
        'serialId': serial['id'],
        'saleInvoiceId': saleInvoiceId,
        'returnDate': now,
        'isValid': isValid ? 1 : 0,
        'validationNotes': reason,
        'restocked': restock && isValid ? 1 : 0,
        'createdBy': createdBy,
        'createdAt': now,
      });

      if (isValid) {
        await txn.update(
          'sale_serial_mappings',
          {'returnedAt': now, 'returnValidated': 1, 'returnReason': reason},
          where: 'serialId = ?',
          whereArgs: [serial['id']],
        );

        await txn.update(
          'serial_numbers',
          {
            'status': restock ? 'in_stock' : 'returned',
            'returnedAt': now,
            'saleInvoiceId': null,
            'soldAt': null,
            'updatedAt': now,
          },
          where: 'id = ?',
          whereArgs: [serial['id']],
        );
      }

      await AuditService.log(
        module: 'serial',
        action: 'return',
        entityType: 'serial_number',
        entityId: serial['id'] as String,
        payload: {'valid': isValid, 'reason': reason},
        txn: txn,
      );

      return {'valid': isValid, 'serialNumber': serialNumber, 'restocked': restock && isValid};
    });
  }
}
