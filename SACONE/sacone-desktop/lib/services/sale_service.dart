import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/retail_models.dart';
import 'unified_database_manager.dart';
import 'sequence_service.dart';
import 'stock_control_service.dart';
import 'ledger_service.dart';
import '../data/repositories/party_repository.dart';
import 'warranty_service.dart';
import 'loyalty_service.dart';
import 'serial_tracking_service.dart';
import 'audit_service.dart';
import 'sync_queue_service.dart';

class SaleService {
  static const _uuid = Uuid();
  final LedgerService _ledger = LedgerService();
  final CustomerRepository _customers = CustomerRepository();
  final WarrantyService _warranty = WarrantyService();
  final LoyaltyService _loyalty = LoyaltyService();
  final SerialTrackingService _serials = SerialTrackingService();

  Future<List<SalesInvoice>> listInvoices({DateTime? from, DateTime? to}) async {
    final db = await DatabaseManager.instance.database;
    String? where;
    List<Object?>? args;

    if (from != null && to != null) {
      where = 'invoiceDate >= ? AND invoiceDate <= ?';
      args = [from.toIso8601String(), to.toIso8601String()];
    }

    final rows = await db.query(
      'sales_invoices',
      where: where,
      whereArgs: args,
      orderBy: 'invoiceDate DESC',
      limit: 200,
    );

    final invoices = <SalesInvoice>[];
    for (final row in rows) {
      final lines = await _loadLines(db, row['id'] as String);
      invoices.add(SalesInvoice.fromMap(row, lines: lines));
    }
    return invoices;
  }

  Future<SalesInvoice> completeSale({
    required String warehouseId,
    required List<PosCartItem> cart,
    String? customerId,
    String? customerName,
    String? customerPhone,
    String? customerGstin,
    required String paymentMode,
    required double paidAmount,
    double discountAmount = 0,
    String? notes,
    String? createdBy,
  }) async {
    if (cart.isEmpty) throw Exception('Cart is empty');

    final db = await DatabaseManager.instance.database;
    final invoiceNumber = await SequenceService.nextNumber('SALE');
    final now = DateTime.now();
    final invoiceId = _uuid.v4();

    double subtotal = 0;
    double taxAmount = 0;
    for (final item in cart) {
      subtotal += item.lineSubtotal;
      taxAmount += item.lineTax;
    }
    final total = subtotal + taxAmount - discountAmount;
    if (total < 0) throw Exception('Invalid total');

    final due = total - paidAmount;
    final paymentStatus = due <= 0.0001
        ? 'paid'
        : paidAmount > 0
            ? 'partial'
            : 'credit';

    final invoice = await db.transaction((txn) async {
      for (final item in cart) {
        await StockControlService.assertAvailable(
          itemId: item.itemId,
          warehouseId: warehouseId,
          quantity: item.quantity,
          txn: txn,
        );
      }

      await txn.insert('sales_invoices', {
        'id': invoiceId,
        'invoiceNumber': invoiceNumber,
        'customerId': customerId,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'customerGstin': customerGstin,
        'warehouseId': warehouseId,
        'invoiceDate': now.toIso8601String(),
        'subtotal': subtotal,
        'taxAmount': taxAmount,
        'discountAmount': discountAmount,
        'totalAmount': total,
        'paidAmount': paidAmount,
        'dueAmount': due > 0 ? due : 0,
        'paymentMode': paymentMode,
        'paymentStatus': paymentStatus,
        'status': 'completed',
        'notes': notes,
        'createdBy': createdBy,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'syncStatus': 'local',
      });

      for (final item in cart) {
        final lineId = _uuid.v4();
        await txn.insert('sale_lines', SaleLine(
          id: lineId,
          invoiceId: invoiceId,
          itemId: item.itemId,
          itemName: item.name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          taxAmount: item.lineTax,
          lineTotal: item.lineTotal,
        ).toMap());

        await StockControlService.stockOut(
          txn: txn,
          itemId: item.itemId,
          warehouseId: warehouseId,
          quantity: item.quantity,
          updatedBy: createdBy,
        );

        if (item.serialNumbers.isNotEmpty) {
          await _serials.mapSerialsToSale(
            txn: txn,
            saleInvoiceId: invoiceId,
            saleLineId: lineId,
            itemId: item.itemId,
            serialNumbers: item.serialNumbers,
            customerId: customerId,
          );
        }

        await _warranty.createWarrantyFromSale(
          txn: txn,
          itemId: item.itemId,
          itemName: item.name,
          saleInvoiceId: invoiceId,
          serialNumber: item.serialNumbers.isNotEmpty ? item.serialNumbers.first : null,
          customerId: customerId,
          customerName: customerName,
        );

        await txn.insert('transactions', {
          'id': _uuid.v4(),
          'itemId': item.itemId,
          'warehouseId': warehouseId,
          'type': 'sale',
          'quantity': item.quantity,
          'unitPrice': item.unitPrice,
          'totalAmount': item.lineTotal,
          'customer': customerName,
          'referenceNumber': invoiceNumber,
          'transactionDate': now.toIso8601String(),
          'createdAt': now.toIso8601String(),
        });
      }

      if (customerId != null && due > 0) {
        await _customers.adjustOutstanding(customerId, due, purchaseDelta: total);
        await _ledger.recordCustomerSale(
          txn: txn,
          customerId: customerId,
          customerName: customerName ?? 'Customer',
          invoiceId: invoiceId,
          invoiceNumber: invoiceNumber,
          amount: total,
          paidAmount: paidAmount,
          paymentMode: paymentMode,
          createdBy: createdBy,
        );
      } else if (customerId != null) {
        await _customers.adjustOutstanding(customerId, 0, purchaseDelta: total);
      }

      if (customerId != null) {
        await _loyalty.earnFromPurchase(
          txn: txn,
          customerId: customerId,
          purchaseAmount: total,
          saleInvoiceId: invoiceId,
        );
      }

      await AuditService.log(
        module: 'pos',
        action: 'complete_sale',
        entityType: 'sales_invoice',
        entityId: invoiceId,
        payload: {'total': total, 'discount': discountAmount},
        txn: txn,
      );

      final lines = cart.map((c) => SaleLine(
        id: '',
        invoiceId: invoiceId,
        itemId: c.itemId,
        itemName: c.name,
        sku: c.sku,
        barcode: c.barcode,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        taxRate: c.taxRate,
        taxAmount: c.lineTax,
        lineTotal: c.lineTotal,
      )).toList();

      return SalesInvoice(
        id: invoiceId,
        invoiceNumber: invoiceNumber,
        customerId: customerId,
        customerName: customerName,
        customerPhone: customerPhone,
        customerGstin: customerGstin,
        warehouseId: warehouseId,
        invoiceDate: now,
        subtotal: subtotal,
        taxAmount: taxAmount,
        discountAmount: discountAmount,
        totalAmount: total,
        paidAmount: paidAmount,
        dueAmount: due > 0 ? due : 0,
        paymentMode: paymentMode,
        paymentStatus: paymentStatus,
        lines: lines,
      );
    });

    await _enqueueSaleSync(invoice.id);
    return invoice;
  }

  Future<void> _enqueueSaleSync(String invoiceId) async {
    final db = await DatabaseManager.instance.database;
    final invRows = await db.query('sales_invoices', where: 'id = ?', whereArgs: [invoiceId], limit: 1);
    if (invRows.isNotEmpty) {
      await trackMutation(
        tableName: 'sales_invoices',
        recordId: invoiceId,
        operation: 'upsert',
        payload: invRows.first,
      );
    }
    final lineRows = await db.query('sale_lines', where: 'invoiceId = ?', whereArgs: [invoiceId]);
    for (final line in lineRows) {
      await trackMutation(
        tableName: 'sale_lines',
        recordId: line['id'] as String,
        operation: 'upsert',
        payload: line,
      );
    }
  }

  Future<void> recordCustomerPayment({
    required String customerId,
    required double amount,
    required String paymentMode,
    String? notes,
    String? createdBy,
  }) async {
    final db = await DatabaseManager.instance.database;
    final customer = await _customers.getById(customerId);
    if (customer == null) throw Exception('Customer not found');

    await db.transaction((txn) async {
      await _customers.adjustOutstanding(customerId, -amount);
      await _ledger.recordCustomerPayment(
        txn: txn,
        customerId: customerId,
        customerName: customer.name,
        amount: amount,
        paymentMode: paymentMode,
        notes: notes,
        createdBy: createdBy,
      );
    });
  }

  Future<List<SaleLine>> _loadLines(Database db, String invoiceId) async {
    final rows = await db.query('sale_lines', where: 'invoiceId = ?', whereArgs: [invoiceId]);
    return rows.map(SaleLine.fromMap).toList();
  }
}
