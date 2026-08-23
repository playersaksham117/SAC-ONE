import 'package:uuid/uuid.dart';

import '../../models/retail_models.dart';
import '../../services/unified_database_manager.dart';

class SupplierRepository {
  static const _uuid = Uuid();

  Future<List<Supplier>> getAll({String? search}) async {
    final db = await DatabaseManager.instance.database;
    if (search != null && search.isNotEmpty) {
      final q = '%$search%';
      final rows = await db.query(
        'suppliers',
        where: 'isActive = 1 AND (name LIKE ? OR code LIKE ? OR phone LIKE ? OR gstin LIKE ?)',
        whereArgs: [q, q, q, q],
        orderBy: 'name ASC',
      );
      return rows.map(Supplier.fromMap).toList();
    }
    final rows = await db.query('suppliers', orderBy: 'name ASC');
    return rows.map(Supplier.fromMap).toList();
  }

  Future<Supplier?> getById(String id) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('suppliers', where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return Supplier.fromMap(rows.first);
  }

  Future<Supplier> create(Supplier supplier) async {
    final db = await DatabaseManager.instance.database;
    await db.insert('suppliers', supplier.toMap());
    return supplier;
  }

  Future<void> update(Supplier supplier) async {
    final db = await DatabaseManager.instance.database;
    await db.update('suppliers', supplier.toMap(), where: 'id = ?', whereArgs: [supplier.id]);
  }

  Future<void> delete(String id) async {
    final db = await DatabaseManager.instance.database;
    await db.update(
      'suppliers',
      {'isActive': 0, 'updatedAt': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> adjustCreditBalance(String supplierId, double delta) async {
    final db = await DatabaseManager.instance.database;
    await db.rawUpdate(
      'UPDATE suppliers SET creditBalance = creditBalance + ?, updatedAt = ? WHERE id = ?',
      [delta, DateTime.now().toIso8601String(), supplierId],
    );
  }

  String newId() => _uuid.v4();
}

class CustomerRepository {
  static const _uuid = Uuid();

  Future<List<Customer>> getAll({String? search}) async {
    final db = await DatabaseManager.instance.database;
    if (search != null && search.isNotEmpty) {
      final q = '%$search%';
      final rows = await db.query(
        'customers',
        where: 'isActive = 1 AND (name LIKE ? OR code LIKE ? OR phone LIKE ? OR gstin LIKE ?)',
        whereArgs: [q, q, q, q],
        orderBy: 'name ASC',
      );
      return rows.map(Customer.fromMap).toList();
    }
    final rows = await db.query('customers', orderBy: 'name ASC');
    return rows.map(Customer.fromMap).toList();
  }

  Future<Customer?> getById(String id) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('customers', where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return Customer.fromMap(rows.first);
  }

  Future<Customer?> getByPhone(String phone) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('customers', where: 'phone = ?', whereArgs: [phone], limit: 1);
    if (rows.isEmpty) return null;
    return Customer.fromMap(rows.first);
  }

  Future<Customer> create(Customer customer) async {
    final db = await DatabaseManager.instance.database;
    await db.insert('customers', customer.toMap());
    return customer;
  }

  Future<void> update(Customer customer) async {
    final db = await DatabaseManager.instance.database;
    await db.update('customers', customer.toMap(), where: 'id = ?', whereArgs: [customer.id]);
  }

  Future<void> delete(String id) async {
    final db = await DatabaseManager.instance.database;
    await db.update(
      'customers',
      {'isActive': 0, 'updatedAt': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> adjustOutstanding(String customerId, double delta, {double purchaseDelta = 0}) async {
    final db = await DatabaseManager.instance.database;
    await db.rawUpdate('''
      UPDATE customers
      SET outstandingBalance = outstandingBalance + ?,
          totalPurchases = totalPurchases + ?,
          updatedAt = ?
      WHERE id = ?
    ''', [delta, purchaseDelta, DateTime.now().toIso8601String(), customerId]);
  }

  String newId() => _uuid.v4();
}
