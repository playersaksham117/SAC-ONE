import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';
import 'audit_service.dart';

class WarrantyService {
  static const _uuid = Uuid();

  Future<void> upsertItemConfig({
    required String itemId,
    required int warrantyMonths,
    String warrantyType = 'manufacturer',
    String? terms,
  }) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    final existing = await db.query('item_warranty_config', where: 'itemId = ?', whereArgs: [itemId]);

    if (existing.isEmpty) {
      await db.insert('item_warranty_config', {
        'id': _uuid.v4(),
        'itemId': itemId,
        'warrantyMonths': warrantyMonths,
        'warrantyType': warrantyType,
        'terms': terms,
        'isActive': 1,
        'createdAt': now,
        'updatedAt': now,
      });
    } else {
      await db.update(
        'item_warranty_config',
        {
          'warrantyMonths': warrantyMonths,
          'warrantyType': warrantyType,
          'terms': terms,
          'updatedAt': now,
        },
        where: 'itemId = ?',
        whereArgs: [itemId],
      );
    }

    await db.update(
      'inventory_items',
      {'warrantyMonths': warrantyMonths, 'updatedAt': now},
      where: 'id = ?',
      whereArgs: [itemId],
    );
  }

  Future<String> createWarrantyFromSale({
    required Transaction txn,
    required String itemId,
    required String itemName,
    required String saleInvoiceId,
    String? serialId,
    String? serialNumber,
    String? customerId,
    String? customerName,
  }) async {
    final config = await txn.query(
      'item_warranty_config',
      where: 'itemId = ? AND isActive = 1',
      whereArgs: [itemId],
      limit: 1,
    );

    int months = 12;
    if (config.isNotEmpty) {
      months = config.first['warrantyMonths'] as int;
    } else {
      final item = await txn.query('inventory_items', where: 'id = ?', whereArgs: [itemId], limit: 1);
      if (item.isNotEmpty) months = (item.first['warrantyMonths'] as int?) ?? 0;
    }

    if (months <= 0) return '';

    final start = DateTime.now();
    final end = DateTime(start.year, start.month + months, start.day);
    final id = _uuid.v4();
    final now = start.toIso8601String();

    await txn.insert('warranty_records', {
      'id': id,
      'itemId': itemId,
      'itemName': itemName,
      'serialId': serialId,
      'serialNumber': serialNumber,
      'customerId': customerId,
      'customerName': customerName,
      'saleInvoiceId': saleInvoiceId,
      'startDate': now,
      'endDate': end.toIso8601String(),
      'status': 'active',
      'createdAt': now,
      'updatedAt': now,
    });

    if (serialId != null) {
      await txn.update(
        'serial_numbers',
        {'warrantyRecordId': id, 'updatedAt': now},
        where: 'id = ?',
        whereArgs: [serialId],
      );
    }

    return id;
  }

  Future<List<Map<String, dynamic>>> lookupCustomerWarranties(String query) async {
    final db = await DatabaseManager.instance.database;
    final q = '%$query%';
    return db.rawQuery('''
      SELECT w.*,
        CASE WHEN w.endDate < ? THEN 'expired' ELSE w.status END as computedStatus
      FROM warranty_records w
      WHERE w.customerName LIKE ? OR w.serialNumber LIKE ? OR w.itemName LIKE ?
      ORDER BY w.endDate ASC
      LIMIT 100
    ''', [DateTime.now().toIso8601String(), q, q, q]);
  }

  Future<List<Map<String, dynamic>>> getExpiringWarranties({int withinDays = 30}) async {
    final db = await DatabaseManager.instance.database;
    final until = DateTime.now().add(Duration(days: withinDays)).toIso8601String();
    return db.rawQuery('''
      SELECT * FROM warranty_records
      WHERE status = 'active' AND endDate <= ?
      ORDER BY endDate ASC
    ''', [until]);
  }

  Future<void> logService({
    required String warrantyRecordId,
    required String issueDescription,
    String? resolution,
    String status = 'open',
    String? technician,
  }) async {
    final db = await DatabaseManager.instance.database;
    await db.insert('warranty_service_logs', {
      'id': _uuid.v4(),
      'warrantyRecordId': warrantyRecordId,
      'serviceDate': DateTime.now().toIso8601String(),
      'issueDescription': issueDescription,
      'resolution': resolution,
      'status': status,
      'technician': technician,
      'createdAt': DateTime.now().toIso8601String(),
    });

    await AuditService.log(
      module: 'warranty',
      action: 'service_log',
      entityType: 'warranty_record',
      entityId: warrantyRecordId,
      payload: {'status': status},
    );
  }
}
