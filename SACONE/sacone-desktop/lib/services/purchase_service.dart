import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/retail_models.dart';
import 'unified_database_manager.dart';
import 'sequence_service.dart';
import 'stock_control_service.dart';
import 'ledger_service.dart';

class PurchaseService {
  static const _uuid = Uuid();
  final LedgerService _ledger = LedgerService();

  Future<List<PurchaseOrder>> listOrders({String? status}) async {
    final db = await DatabaseManager.instance.database;
    final rows = status != null
        ? await db.query('purchase_orders', where: 'status = ?', whereArgs: [status], orderBy: 'orderDate DESC')
        : await db.query('purchase_orders', orderBy: 'orderDate DESC');

    final orders = <PurchaseOrder>[];
    for (final row in rows) {
      final lines = await _loadLines(db, row['id'] as String);
      orders.add(PurchaseOrder.fromMap(row, lines: lines));
    }
    return orders;
  }

  Future<PurchaseOrder?> getOrder(String id) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('purchase_orders', where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    final lines = await _loadLines(db, id);
    return PurchaseOrder.fromMap(rows.first, lines: lines);
  }

  Future<PurchaseOrder> createOrder({
    required String supplierId,
    required String supplierName,
    required String warehouseId,
    required List<PurchaseOrderLine> lines,
    String? notes,
    String? createdBy,
  }) async {
    final db = await DatabaseManager.instance.database;
    final poNumber = await SequenceService.nextNumber('PO');
    final now = DateTime.now();
    final id = _uuid.v4();

    double subtotal = 0;
    double taxAmount = 0;
    for (final line in lines) {
      subtotal += line.unitCost * line.orderedQty;
      taxAmount += line.taxAmount;
    }
    final total = subtotal + taxAmount;

    final order = PurchaseOrder(
      id: id,
      poNumber: poNumber,
      supplierId: supplierId,
      supplierName: supplierName,
      warehouseId: warehouseId,
      status: 'draft',
      orderDate: now,
      subtotal: subtotal,
      taxAmount: taxAmount,
      totalAmount: total,
      dueAmount: total,
      notes: notes,
      lines: lines,
    );

    await db.transaction((txn) async {
      await txn.insert('purchase_orders', {
        'id': id,
        'poNumber': poNumber,
        'supplierId': supplierId,
        'supplierName': supplierName,
        'warehouseId': warehouseId,
        'status': 'draft',
        'orderDate': now.toIso8601String(),
        'subtotal': subtotal,
        'taxAmount': taxAmount,
        'totalAmount': total,
        'dueAmount': total,
        'notes': notes,
        'createdBy': createdBy,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'syncStatus': 'local',
      });

      for (final line in lines) {
        await txn.insert('purchase_order_lines', {
          ...line.toMap(),
          'id': line.id.isEmpty ? _uuid.v4() : line.id,
          'purchaseOrderId': id,
        });
      }
    });

    return order;
  }

  Future<PurchaseOrder> receiveOrder({
    required String purchaseOrderId,
    required Map<String, double> receiveQtyByLineId,
    double paidAmount = 0,
    String? invoiceNumber,
    String? createdBy,
  }) async {
    final db = await DatabaseManager.instance.database;
    final order = await getOrder(purchaseOrderId);
    if (order == null) throw Exception('Purchase order not found');

    final now = DateTime.now();

    return db.transaction((txn) async {
      for (final line in order.lines) {
        final receiveQty = receiveQtyByLineId[line.id] ?? 0;
        if (receiveQty <= 0) continue;

        final newReceived = line.receivedQty + receiveQty;
        if (newReceived > line.orderedQty + 0.0001) {
          throw Exception('Cannot receive more than ordered for ${line.itemName}');
        }

        await txn.update(
          'purchase_order_lines',
          {'receivedQty': newReceived},
          where: 'id = ?',
          whereArgs: [line.id],
        );

        await StockControlService.stockIn(
          txn: txn,
          itemId: line.itemId,
          warehouseId: order.warehouseId,
          quantity: receiveQty,
          updatedBy: createdBy,
        );
      }

      final allReceived = order.lines.every((l) {
        final extra = receiveQtyByLineId[l.id] ?? 0;
        return l.receivedQty + extra >= l.orderedQty - 0.0001;
      });

      final due = order.totalAmount - paidAmount;
      await txn.update(
        'purchase_orders',
        {
          'status': allReceived ? 'received' : 'partial',
          'receivedDate': now.toIso8601String(),
          'paidAmount': paidAmount,
          'dueAmount': due > 0 ? due : 0,
          'invoiceNumber': invoiceNumber,
          'updatedAt': now.toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [purchaseOrderId],
      );

      if (due > 0) {
        await _ledger.recordSupplierPurchase(
          txn: txn,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          purchaseOrderId: purchaseOrderId,
          poNumber: order.poNumber,
          amount: order.totalAmount,
          paidAmount: paidAmount,
          createdBy: createdBy,
        );
      }

      final updated = await getOrder(purchaseOrderId);
      return updated!;
    });
  }

  Future<List<PurchaseOrderLine>> _loadLines(Database db, String poId) async {
    final rows = await db.query(
      'purchase_order_lines',
      where: 'purchaseOrderId = ?',
      whereArgs: [poId],
    );
    return rows.map(PurchaseOrderLine.fromMap).toList();
  }
}
