import 'package:flutter/foundation.dart';
import '../models/location.dart';
import '../models/stock.dart';
import '../services/unified_database_manager.dart';
import 'package:uuid/uuid.dart';

class StockEntryProvider with ChangeNotifier {
  final _uuid = const Uuid();

  // Simplified location caching (Warehouse → Cell)
  final Map<String, List<Cell>> _cellsByWarehouse = {};
  
  // Legacy location hierarchy caching (kept for backward compatibility)
  final Map<String, List<Zone>> _zonesByWarehouse = {};
  final Map<String, List<Rack>> _racksByZone = {};
  final Map<String, List<Shelf>> _shelfsByRack = {};
  final Map<String, List<Bin>> _binsByShelf = {};

  // Location Code Generation
  String generateLocationCode({
    required String warehouseName,
    required String zoneName,
    required String rackName,
    required String shelfName,
    required String binName,
  }) {
    // Generate code like: WH-01/A/R03/S02/B05
    final whCode = _sanitizeCode(warehouseName, 'WH');
    final zCode = _sanitizeCode(zoneName, 'Z');
    final rCode = _sanitizeCode(rackName, 'R');
    final sCode = _sanitizeCode(shelfName, 'S');
    final bCode = _sanitizeCode(binName, 'B');
    
    return '$whCode/$zCode/$rCode/$sCode/$bCode';
  }

  String _sanitizeCode(String input, String prefix) {
    // Extract numbers if present, otherwise use first 2-3 characters
    final numbers = input.replaceAll(RegExp(r'[^0-9]'), '');
    if (numbers.isNotEmpty) {
      return '$prefix${numbers.padLeft(2, '0')}';
    }
    final letters = input.replaceAll(RegExp(r'[^A-Za-z]'), '').toUpperCase();
    return letters.isEmpty ? prefix : letters.substring(0, letters.length > 2 ? 2 : letters.length);
  }

  // Get full location path for display (supports both cell and legacy structure)
  Future<LocationPath?> getLocationPath({
    String? warehouseId,
    String? cellId,
    String? zoneId,
    String? rackId,
    String? shelfId,
    String? binId,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    String? warehouseName;
    String? cellName;
    String? zoneName;
    String? rackName;
    String? shelfName;
    String? binName;

    if (warehouseId != null) {
      final wh = await db.query('warehouses', where: 'id = ?', whereArgs: [warehouseId]);
      warehouseName = wh.isNotEmpty ? wh.first['name'] as String : null;
    }

    // Check for new simplified structure (cell)
    if (cellId != null) {
      final cell = await db.query('cells', where: 'id = ?', whereArgs: [cellId]);
      cellName = cell.isNotEmpty ? cell.first['name'] as String : null;
    }

    // Legacy structure
    if (zoneId != null) {
      final zone = await db.query('zones', where: 'id = ?', whereArgs: [zoneId]);
      zoneName = zone.isNotEmpty ? zone.first['name'] as String : null;
    }

    if (rackId != null) {
      final rack = await db.query('racks', where: 'id = ?', whereArgs: [rackId]);
      rackName = rack.isNotEmpty ? rack.first['name'] as String : null;
    }

    if (shelfId != null) {
      final shelf = await db.query('shelves', where: 'id = ?', whereArgs: [shelfId]);
      shelfName = shelf.isNotEmpty ? shelf.first['name'] as String : null;
    }

    if (binId != null) {
      final bin = await db.query('bins', where: 'id = ?', whereArgs: [binId]);
      binName = bin.isNotEmpty ? bin.first['name'] as String : null;
    }

    return LocationPath(
      warehouseName: warehouseName,
      cellName: cellName,
      zoneName: zoneName,
      rackName: rackName,
      shelfName: shelfName,
      binName: binName,
    );
  }

  // ==================== ZONE OPERATIONS ====================

  Future<List<Zone>> loadZones(String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'zones',
      where: 'warehouseId = ?',
      whereArgs: [warehouseId],
      orderBy: 'name ASC',
    );
    
    final zones = maps.map((map) => Zone.fromMap(map)).toList();
    _zonesByWarehouse[warehouseId] = zones;
    notifyListeners();
    return zones;
  }

  Future<Zone> createZone({
    required String warehouseId,
    required String name,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate zone name in warehouse
    final existing = await db.query(
      'zones',
      where: 'warehouseId = ? AND LOWER(name) = ?',
      whereArgs: [warehouseId, name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Zone "$name" already exists in this warehouse');
    }

    final zone = Zone(
      id: _uuid.v4(),
      warehouseId: warehouseId,
      name: name,
      description: description,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('zones', zone.toMap());
    await loadZones(warehouseId);
    return zone;
  }

  Future<void> updateZone({
    required String zoneId,
    required String name,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    await db.update(
      'zones',
      {
        'name': name,
        'description': description,
        'updatedAt': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [zoneId],
    );
    notifyListeners();
  }

  Future<void> deleteZone(String zoneId) async {
    final db = await DatabaseManager.instance.database;
    
    // Delete all cells in this zone first
    await db.delete('cells', where: 'zoneId = ?', whereArgs: [zoneId]);
    
    // Delete the zone
    await db.delete('zones', where: 'id = ?', whereArgs: [zoneId]);
    notifyListeners();
  }

  List<Zone> getZonesForWarehouse(String warehouseId) {
    return _zonesByWarehouse[warehouseId] ?? [];
  }

  // ==================== RACK OPERATIONS ====================

  Future<List<Rack>> loadRacks(String zoneId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'racks',
      where: 'zoneId = ?',
      whereArgs: [zoneId],
      orderBy: 'name ASC',
    );
    
    final racks = maps.map((map) => Rack.fromMap(map)).toList();
    _racksByZone[zoneId] = racks;
    notifyListeners();
    return racks;
  }

  Future<Rack> createRack({
    required String zoneId,
    required String name,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate rack name in zone
    final existing = await db.query(
      'racks',
      where: 'zoneId = ? AND LOWER(name) = ?',
      whereArgs: [zoneId, name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Rack "$name" already exists in this zone');
    }

    final rack = Rack(
      id: _uuid.v4(),
      zoneId: zoneId,
      name: name,
      description: description,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('racks', rack.toMap());
    await loadRacks(zoneId);
    return rack;
  }

  List<Rack> getRacksForZone(String zoneId) {
    return _racksByZone[zoneId] ?? [];
  }

  // ==================== SHELF OPERATIONS ====================

  Future<List<Shelf>> loadShelves(String rackId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'shelves',
      where: 'rackId = ?',
      whereArgs: [rackId],
      orderBy: 'name ASC',
    );
    
    final shelves = maps.map((map) => Shelf.fromMap(map)).toList();
    _shelfsByRack[rackId] = shelves;
    notifyListeners();
    return shelves;
  }

  Future<Shelf> createShelf({
    required String rackId,
    required String name,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate shelf name in rack
    final existing = await db.query(
      'shelves',
      where: 'rackId = ? AND LOWER(name) = ?',
      whereArgs: [rackId, name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Shelf "$name" already exists in this rack');
    }

    final shelf = Shelf(
      id: _uuid.v4(),
      rackId: rackId,
      name: name,
      description: description,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('shelves', shelf.toMap());
    await loadShelves(rackId);
    return shelf;
  }

  List<Shelf> getShelvesForRack(String rackId) {
    return _shelfsByRack[rackId] ?? [];
  }

  // ==================== BIN OPERATIONS ====================

  Future<List<Bin>> loadBins(String shelfId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'bins',
      where: 'shelfId = ?',
      whereArgs: [shelfId],
      orderBy: 'name ASC',
    );
    
    final bins = maps.map((map) => Bin.fromMap(map)).toList();
    _binsByShelf[shelfId] = bins;
    notifyListeners();
    return bins;
  }

  Future<Bin> createBin({
    required String shelfId,
    required String name,
    String? description,
    double? maxCapacity,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate bin name in shelf
    final existing = await db.query(
      'bins',
      where: 'shelfId = ? AND LOWER(name) = ?',
      whereArgs: [shelfId, name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Bin "$name" already exists in this shelf');
    }

    final bin = Bin(
      id: _uuid.v4(),
      shelfId: shelfId,
      name: name,
      description: description,
      maxCapacity: maxCapacity,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('bins', bin.toMap());
    await loadBins(shelfId);
    return bin;
  }

  List<Bin> getBinsForShelf(String shelfId) {
    return _binsByShelf[shelfId] ?? [];
  }

  // ==================== CELL OPERATIONS (SIMPLIFIED LOCATION) ====================

  Future<List<Cell>> loadCells(String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'cells',
      where: 'warehouseId = ? AND isActive = ?',
      whereArgs: [warehouseId, 1],
      orderBy: 'name ASC',
    );
    
    final cells = maps.map((map) => Cell.fromMap(map)).toList();
    _cellsByWarehouse[warehouseId] = cells;
    notifyListeners();
    return cells;
  }

  // Load cells for a specific zone
  Future<List<Cell>> loadCellsForZone(String zoneId) async {
    final db = await DatabaseManager.instance.database;
    final maps = await db.query(
      'cells',
      where: 'zoneId = ? AND isActive = ?',
      whereArgs: [zoneId, 1],
      orderBy: 'name ASC',
    );
    
    return maps.map((map) => Cell.fromMap(map)).toList();
  }

  Future<Cell> createCell({
    required String warehouseId,
    required String name,
    required String code,
    int? capacity,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate cell code or name in warehouse
    final existing = await db.query(
      'cells',
      where: 'warehouseId = ? AND (LOWER(code) = ? OR LOWER(name) = ?)',
      whereArgs: [warehouseId, code.toLowerCase(), name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Cell with code "$code" or name "$name" already exists in this warehouse');
    }

    final cell = Cell(
      id: _uuid.v4(),
      zoneId: '',  // No zone for legacy cells
      warehouseId: warehouseId,
      name: name,
      code: code,
      capacity: capacity,
      description: description,
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('cells', cell.toMap());
    await loadCells(warehouseId);
    return cell;
  }

  // Create cell within a zone
  Future<Cell> createCellInZone({
    required String zoneId,
    required String warehouseId,
    required String name,
    required String code,
    int? capacity,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check for duplicate cell code or name in warehouse
    final existing = await db.query(
      'cells',
      where: 'warehouseId = ? AND (LOWER(code) = ? OR LOWER(name) = ?)',
      whereArgs: [warehouseId, code.toLowerCase(), name.toLowerCase()],
    );
    
    if (existing.isNotEmpty) {
      throw Exception('Cell with code "$code" or name "$name" already exists in this warehouse');
    }

    final cell = Cell(
      id: _uuid.v4(),
      zoneId: zoneId,
      warehouseId: warehouseId,
      name: name,
      code: code,
      capacity: capacity,
      description: description,
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await db.insert('cells', cell.toMap());
    await loadCells(warehouseId);
    notifyListeners();
    return cell;
  }

  // Update cell
  Future<void> updateCell({
    required String cellId,
    required String name,
    required String code,
    int? capacity,
    String? description,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    await db.update(
      'cells',
      {
        'name': name,
        'code': code,
        'capacity': capacity,
        'description': description,
        'updatedAt': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [cellId],
    );
    notifyListeners();
  }

  // Delete cell
  Future<void> deleteCell(String cellId) async {
    final db = await DatabaseManager.instance.database;
    
    // Check if cell has stock
    final stocks = await db.query(
      'stocks',
      where: 'cellId = ? AND quantity > 0',
      whereArgs: [cellId],
    );
    
    if (stocks.isNotEmpty) {
      throw Exception('Cannot delete cell with existing stock. Please move or remove stock first.');
    }
    
    // Delete the cell
    await db.delete('cells', where: 'id = ?', whereArgs: [cellId]);
    notifyListeners();
  }

  List<Cell> getCellsForWarehouse(String warehouseId) {
    return _cellsByWarehouse[warehouseId] ?? [];
  }

  // Simplified location code generation for warehouse → cell
  String generateSimpleLocationCode({
    required String warehouseName,
    required String cellCode,
  }) {
    final whCode = _sanitizeCode(warehouseName, 'WH');
    return '$whCode-$cellCode';
  }

  // ==================== STOCK ENTRY ====================

  // Simplified stock entry for warehouse → cell structure
  Future<void> addStockEntrySimple({
    required String itemId,
    required String warehouseId,
    required String cellId,
    required double quantity,
    required double unitPrice,
    String? batchNumber,
    DateTime? expiryDate,
  }) async {
    // Validation
    if (quantity <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    final db = await DatabaseManager.instance.database;

    // Check if stock already exists at this location for this item
    final existing = await db.query(
      'stocks',
      where: 'itemId = ? AND warehouseId = ? AND cellId = ?',
      whereArgs: [itemId, warehouseId, cellId],
    );

    if (existing.isNotEmpty) {
      // Update existing stock
      final currentQty = existing.first['quantity'] as double;
      await db.update(
        'stocks',
        {
          'quantity': currentQty + quantity,
          'lastUpdated': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [existing.first['id']],
      );
    } else {
      // Create new stock entry with cell
      final stock = {
        'id': _uuid.v4(),
        'itemId': itemId,
        'warehouseId': warehouseId,
        'cellId': cellId,
        'quantity': quantity,
        'batchNumber': batchNumber,
        'expiryDate': expiryDate?.toIso8601String(),
        'lastUpdated': DateTime.now().toIso8601String(),
      };

      await db.insert('stocks', stock);
    }

    // Record stock movement for tracking
    final now = DateTime.now().toIso8601String();
    await db.insert('stock_movements', {
      'id': _uuid.v4(),
      'itemId': itemId,
      'itemName': '',
      'itemSku': '',
      'warehouseId': warehouseId,
      'warehouseName': '',
      'movementType': 'IN',
      'quantityBefore': 0,
      'quantityChanged': quantity,
      'quantityAfter': quantity,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'performedBy': 'System',
      'movementDate': now,
      'createdAt': now,
      'notes': 'Stock entry via simplified location (cell)',
    });

    notifyListeners();
  }

  // Legacy stock entry for zone → rack → shelf → bin structure
  Future<void> addStockEntry({
    required String itemId,
    required String warehouseId,
    required String zoneId,
    required String rackId,
    required String shelfId,
    required String binId,
    required double quantity,
    String? batchNumber,
    DateTime? expiryDate,
  }) async {
    // Validation
    if (quantity <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    final db = await DatabaseManager.instance.database;

    // Check if stock already exists at this location for this item
    final existing = await db.query(
      'stocks',
      where: 'itemId = ? AND warehouseId = ? AND binId = ?',
      whereArgs: [itemId, warehouseId, binId],
    );

    if (existing.isNotEmpty) {
      // Update existing stock
      final currentQty = existing.first['quantity'] as double;
      await db.update(
        'stocks',
        {
          'quantity': currentQty + quantity,
          'lastUpdated': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [existing.first['id']],
      );
    } else {
      // Create new stock entry
      final stock = Stock(
        id: _uuid.v4(),
        itemId: itemId,
        warehouseId: warehouseId,
        zoneId: zoneId,
        rackId: rackId,
        shelfId: shelfId,
        binId: binId,
        quantity: quantity,
        batchNumber: batchNumber,
        expiryDate: expiryDate,
        lastUpdated: DateTime.now(),
      );

      await db.insert('stocks', stock.toMap());
    }

    notifyListeners();
  }

  // ==================== UTILITY METHODS ====================

  Future<bool> checkLocationExists({
    required String warehouseId,
    required String zoneName,
    required String rackName,
    required String shelfName,
    required String binName,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    // Check if the complete path exists
    final result = await db.rawQuery('''
      SELECT b.id FROM bins b
      JOIN shelves s ON b.shelfId = s.id
      JOIN racks r ON s.rackId = r.id
      JOIN zones z ON r.zoneId = z.id
      WHERE z.warehouseId = ?
      AND LOWER(z.name) = ?
      AND LOWER(r.name) = ?
      AND LOWER(s.name) = ?
      AND LOWER(b.name) = ?
    ''', [
      warehouseId,
      zoneName.toLowerCase(),
      rackName.toLowerCase(),
      shelfName.toLowerCase(),
      binName.toLowerCase(),
    ]);

    return result.isNotEmpty;
  }

  void clearCache() {
    _cellsByWarehouse.clear();
    _zonesByWarehouse.clear();
    _racksByZone.clear();
    _shelfsByRack.clear();
    _binsByShelf.clear();
    notifyListeners();
  }
}
