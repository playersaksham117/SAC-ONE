import 'package:flutter/foundation.dart';
import '../models/warehouse.dart';
import '../services/unified_database_manager.dart';

class WarehouseProvider with ChangeNotifier {
  List<Warehouse> _warehouses = [];
  List<StorageLocation> _locations = [];
  
  List<Warehouse> get warehouses => _warehouses;
  List<StorageLocation> get locations => _locations;
  
  List<Warehouse> get activeWarehouses => 
    _warehouses.where((w) => w.isActive).toList();

  Future<void> loadWarehouses() async {
    try {
      final db = await DatabaseManager.instance.database;
      final List<Map<String, dynamic>> maps = await db.query('warehouses');
      _warehouses = maps.map((map) => Warehouse.fromMap(map)).toList();
      notifyListeners();
      debugPrint('Loaded ${_warehouses.length} warehouses');
    } catch (e) {
      debugPrint('Error loading warehouses: $e');
      rethrow;
    }
  }

  Future<void> addWarehouse(Warehouse warehouse) async {
    try {
      debugPrint('Adding warehouse: ${warehouse.toMap()}');
      final db = await DatabaseManager.instance.database;
      await db.insert('warehouses', warehouse.toMap());
      debugPrint('Warehouse inserted successfully');
      await loadWarehouses();
    } catch (e) {
      debugPrint('Error adding warehouse: $e');
      rethrow;
    }
  }

  Future<void> updateWarehouse(Warehouse warehouse) async {
    try {
      debugPrint('Updating warehouse: ${warehouse.toMap()}');
      final db = await DatabaseManager.instance.database;
      final result = await db.update(
        'warehouses',
        warehouse.toMap(),
        where: 'id = ?',
        whereArgs: [warehouse.id],
      );
      debugPrint('Warehouse update result: $result rows affected');
      await loadWarehouses();
    } catch (e) {
      debugPrint('Error updating warehouse: $e');
      rethrow;
    }
  }

  Future<void> deleteWarehouse(String id) async {
    final db = await DatabaseManager.instance.database;
    await db.delete('warehouses', where: 'id = ?', whereArgs: [id]);
    await loadWarehouses();
  }

  Future<void> loadStorageLocations(String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    final List<Map<String, dynamic>> maps = await db.query(
      'cells',
      where: 'warehouseId = ?',
      whereArgs: [warehouseId],
    );
    _locations = maps.map((map) => StorageLocation.fromMap({
      'id': map['id'],
      'warehouseId': map['warehouseId'],
      'code': map['code'],
      'name': map['name'],
      'type': 'cell',
    })).toList();
    notifyListeners();
  }

  Future<void> addStorageLocation(StorageLocation location) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    await db.insert('cells', {
      'id': location.id,
      'warehouseId': location.warehouseId,
      'name': location.code,
      'code': location.code,
      'description': location.description,
      'isActive': 1,
      'createdAt': now,
      'updatedAt': now,
    });
    await loadStorageLocations(location.warehouseId);
  }

  Future<void> updateStorageLocation(StorageLocation location) async {
    final db = await DatabaseManager.instance.database;
    await db.update(
      'cells',
      {
        'name': location.code,
        'code': location.code,
        'description': location.description,
        'updatedAt': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [location.id],
    );
    await loadStorageLocations(location.warehouseId);
  }

  Future<void> deleteStorageLocation(String id, String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    await db.delete('cells', where: 'id = ?', whereArgs: [id]);
    await loadStorageLocations(warehouseId);
  }
}
