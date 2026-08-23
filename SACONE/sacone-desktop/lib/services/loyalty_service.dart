import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';
import 'audit_service.dart';

class LoyaltyService {
  static const _uuid = Uuid();
  static const pointsPerHundredRupees = 1.0;

  Future<Map<String, dynamic>> getAccount(String customerId) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('loyalty_accounts', where: 'customerId = ?', whereArgs: [customerId]);
    if (rows.isNotEmpty) return rows.first;

    final now = DateTime.now().toIso8601String();
    final account = {
      'id': _uuid.v4(),
      'customerId': customerId,
      'pointsBalance': 0,
      'lifetimePoints': 0,
      'tier': 'standard',
      'updatedAt': now,
    };
    await db.insert('loyalty_accounts', account);
    return account;
  }

  Future<double> earnFromPurchase({
    required Transaction txn,
    required String customerId,
    required double purchaseAmount,
    required String saleInvoiceId,
  }) async {
    final points = (purchaseAmount / 100 * pointsPerHundredRupees).floorToDouble();
    if (points <= 0) return 0;

    await _adjustPoints(
      txn: txn,
      customerId: customerId,
      points: points,
      txnType: 'earn',
      referenceType: 'sales_invoice',
      referenceId: saleInvoiceId,
      notes: 'Purchase reward',
    );
    return points;
  }

  Future<double> redeemPoints({
    required String customerId,
    required double points,
    String? saleInvoiceId,
  }) async {
    final db = await DatabaseManager.instance.database;
    return db.transaction((txn) async {
      final account = await getAccount(customerId);
      final balance = (account['pointsBalance'] as num).toDouble();
      if (points > balance) throw Exception('Insufficient loyalty points');

      await _adjustPoints(
        txn: txn,
        customerId: customerId,
        points: -points,
        txnType: 'redeem',
        referenceType: saleInvoiceId != null ? 'sales_invoice' : 'manual',
        referenceId: saleInvoiceId ?? _uuid.v4(),
        notes: 'Points redeemed',
      );
      return points;
    });
  }

  Future<void> _adjustPoints({
    required Transaction txn,
    required String customerId,
    required double points,
    required String txnType,
    String? referenceType,
    String? referenceId,
    String? notes,
  }) async {
    final account = await txn.query('loyalty_accounts', where: 'customerId = ?', whereArgs: [customerId]);
    final now = DateTime.now().toIso8601String();

    if (account.isEmpty) {
      await txn.insert('loyalty_accounts', {
        'id': _uuid.v4(),
        'customerId': customerId,
        'pointsBalance': points > 0 ? points : 0,
        'lifetimePoints': points > 0 ? points : 0,
        'tier': 'standard',
        'updatedAt': now,
      });
    } else {
      final bal = (account.first['pointsBalance'] as num).toDouble() + points;
      final lifetime = (account.first['lifetimePoints'] as num).toDouble() + (points > 0 ? points : 0);
      await txn.update(
        'loyalty_accounts',
        {
          'pointsBalance': bal < 0 ? 0 : bal,
          'lifetimePoints': lifetime,
          'tier': _tierForLifetime(lifetime),
          'updatedAt': now,
        },
        where: 'customerId = ?',
        whereArgs: [customerId],
      );
    }

    await txn.insert('loyalty_transactions', {
      'id': _uuid.v4(),
      'customerId': customerId,
      'txnType': txnType,
      'points': points,
      'referenceType': referenceType,
      'referenceId': referenceId,
      'notes': notes,
      'createdAt': now,
    });

    await AuditService.log(
      module: 'loyalty',
      action: txnType,
      entityType: 'customer',
      entityId: customerId,
      payload: {'points': points},
      txn: txn,
    );
  }

  String _tierForLifetime(double lifetime) {
    if (lifetime >= 10000) return 'platinum';
    if (lifetime >= 5000) return 'gold';
    if (lifetime >= 1000) return 'silver';
    return 'standard';
  }

  Future<List<Map<String, dynamic>>> getTransactions(String customerId) async {
    final db = await DatabaseManager.instance.database;
    return db.query(
      'loyalty_transactions',
      where: 'customerId = ?',
      whereArgs: [customerId],
      orderBy: 'createdAt DESC',
      limit: 50,
    );
  }
}
