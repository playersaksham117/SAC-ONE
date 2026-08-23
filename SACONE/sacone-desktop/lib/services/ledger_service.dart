import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/retail_models.dart';
import 'unified_database_manager.dart';
import '../data/repositories/party_repository.dart';

class LedgerService {
  static const _uuid = Uuid();
  final SupplierRepository _suppliers = SupplierRepository();

  Future<List<LedgerEntry>> getPartyLedger({
    required String partyType,
    required String partyId,
  }) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query(
      'ledger_entries',
      where: 'partyType = ? AND partyId = ?',
      whereArgs: [partyType, partyId],
      orderBy: 'entryDate DESC, createdAt DESC',
    );
    return rows.map(LedgerEntry.fromMap).toList();
  }

  Future<List<Map<String, dynamic>>> getCustomerDues() async {
    final db = await DatabaseManager.instance.database;
    return db.rawQuery('''
      SELECT id, code, name, phone, outstandingBalance, totalPurchases
      FROM customers
      WHERE isActive = 1 AND outstandingBalance > 0
      ORDER BY outstandingBalance DESC
    ''');
  }

  Future<List<Map<String, dynamic>>> getSupplierDues() async {
    final db = await DatabaseManager.instance.database;
    return db.rawQuery('''
      SELECT id, code, name, phone, creditBalance as outstandingBalance
      FROM suppliers
      WHERE isActive = 1 AND creditBalance > 0
      ORDER BY creditBalance DESC
    ''');
  }

  Future<void> recordCustomerSale({
    required Transaction txn,
    required String customerId,
    required String customerName,
    required String invoiceId,
    required String invoiceNumber,
    required double amount,
    required double paidAmount,
    required String paymentMode,
    String? createdBy,
  }) async {
    final due = amount - paidAmount;
    final balance = await _nextBalance(txn, 'customer', customerId, debit: due);

    await txn.insert('ledger_entries', {
      'id': _uuid.v4(),
      'partyType': 'customer',
      'partyId': customerId,
      'partyName': customerName,
      'entryType': 'sale',
      'referenceType': 'sales_invoice',
      'referenceId': invoiceId,
      'referenceNumber': invoiceNumber,
      'debitAmount': due,
      'creditAmount': paidAmount,
      'balanceAfter': balance,
      'paymentMode': paymentMode,
      'entryDate': DateTime.now().toIso8601String(),
      'createdBy': createdBy,
      'createdAt': DateTime.now().toIso8601String(),
      'syncStatus': 'local',
    });
  }

  Future<void> recordCustomerPayment({
    required Transaction txn,
    required String customerId,
    required String customerName,
    required double amount,
    required String paymentMode,
    String? notes,
    String? createdBy,
  }) async {
    final balance = await _nextBalance(txn, 'customer', customerId, credit: amount);

    await txn.insert('ledger_entries', {
      'id': _uuid.v4(),
      'partyType': 'customer',
      'partyId': customerId,
      'partyName': customerName,
      'entryType': 'payment',
      'referenceType': 'payment',
      'referenceId': _uuid.v4(),
      'referenceNumber': null,
      'debitAmount': 0,
      'creditAmount': amount,
      'balanceAfter': balance,
      'paymentMode': paymentMode,
      'notes': notes,
      'entryDate': DateTime.now().toIso8601String(),
      'createdBy': createdBy,
      'syncStatus': 'local',
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  Future<void> recordSupplierPurchase({
    required Transaction txn,
    required String supplierId,
    required String supplierName,
    required String purchaseOrderId,
    required String poNumber,
    required double amount,
    required double paidAmount,
    String? createdBy,
  }) async {
    final due = amount - paidAmount;
    await _suppliers.adjustCreditBalance(supplierId, due);

    final balance = await _nextBalance(txn, 'supplier', supplierId, debit: due);

    await txn.insert('ledger_entries', {
      'id': _uuid.v4(),
      'partyType': 'supplier',
      'partyId': supplierId,
      'partyName': supplierName,
      'entryType': 'purchase',
      'referenceType': 'purchase_order',
      'referenceId': purchaseOrderId,
      'referenceNumber': poNumber,
      'debitAmount': due,
      'creditAmount': paidAmount,
      'balanceAfter': balance,
      'entryDate': DateTime.now().toIso8601String(),
      'createdBy': createdBy,
      'createdAt': DateTime.now().toIso8601String(),
      'syncStatus': 'local',
    });
  }

  Future<double> _nextBalance(
    Transaction txn,
    String partyType,
    String partyId, {
    double debit = 0,
    double credit = 0,
  }) async {
    final rows = await txn.query(
      'ledger_entries',
      columns: ['balanceAfter'],
      where: 'partyType = ? AND partyId = ?',
      whereArgs: [partyType, partyId],
      orderBy: 'createdAt DESC',
      limit: 1,
    );

    final previous = rows.isEmpty ? 0.0 : (rows.first['balanceAfter'] as num).toDouble();
    return previous + debit - credit;
  }
}
