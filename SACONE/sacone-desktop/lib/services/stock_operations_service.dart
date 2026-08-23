import 'package:uuid/uuid.dart';
import '../services/unified_database_manager.dart';
import '../models/stock_movement.dart';
import '../models/inventory_item.dart';
import '../models/location.dart';

/// Core business logic for all stock operations
/// Ensures data integrity, prevents negative stock, and maintains audit trail
class StockOperationsService {
  static const String _currentUser = 'System'; // TODO: Replace with actual auth user

  /// STOCK IN: Add stock to a specific location
  /// Creates movement record and updates location_stock
  static Future<StockMovement> stockIn({
    required InventoryItem item,
    required String warehouseId,
    required String warehouseName,
    required Zone zone,
    required Rack rack,
    required Shelf shelf,
    required Bin bin,
    required double quantity,
    String? referenceNumber,
    String? batchNumber,
    DateTime? expiryDate,
    String? notes,
  }) async {
    if (quantity <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    const uuid = Uuid();

    // Generate location code
    final locationCode = _generateLocationCode(
      warehouseName: warehouseName,
      zoneName: zone.name,
      rackName: rack.name,
      shelfName: shelf.name,
      binName: bin.name,
    );

    // Get current stock at location
    final currentStock = await _getLocationStock(
      itemId: item.id,
      binId: bin.id,
    );

    final quantityBefore = currentStock?.quantity ?? 0.0;
    final quantityAfter = quantityBefore + quantity;

    // Create stock movement record
    final movement = StockMovement(
      id: uuid.v4(),
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      warehouseId: warehouseId,
      warehouseName: warehouseName,
      zoneId: zone.id,
      zoneName: zone.name,
      rackId: rack.id,
      rackName: rack.name,
      shelfId: shelf.id,
      shelfName: shelf.name,
      binId: bin.id,
      binName: bin.name,
      locationCode: locationCode,
      movementType: MovementType.stockIn,
      quantityBefore: quantityBefore,
      quantityChanged: quantity,
      quantityAfter: quantityAfter,
      referenceNumber: referenceNumber,
      batchNumber: batchNumber,
      expiryDate: expiryDate,
      notes: notes,
      performedBy: _currentUser,
      movementDate: now,
      createdAt: now,
    );

    // Insert movement record
    await db.insert('stock_movements', movement.toMap());

    // Update or create stocks record
    if (currentStock == null) {
      final newStock = LocationStock(
        id: uuid.v4(),
        itemId: item.id,
        warehouseId: warehouseId,
        zoneId: zone.id,
        rackId: rack.id,
        shelfId: shelf.id,
        binId: bin.id,
        quantity: quantity,
        batchNumber: batchNumber,
        expiryDate: expiryDate,
        lastMovementDate: now,
        updatedAt: now,
      );
      await db.insert('stocks', newStock.toMap());
    } else {
      await db.update(
        'stocks',
        {
          'quantity': quantityAfter,
          'lastMovementDate': now.toIso8601String(),
          'updatedAt': now.toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [currentStock.id],
      );
    }

    return movement;
  }

  /// STOCK OUT: Deduct stock from a specific location
  /// Validates sufficient quantity and prevents negative stock
  static Future<StockMovement> stockOut({
    required InventoryItem item,
    required String warehouseId,
    required String warehouseName,
    required Zone zone,
    required Rack rack,
    required Shelf shelf,
    required Bin bin,
    required double quantity,
    String? referenceNumber,
    String? reason,
    String? notes,
  }) async {
    if (quantity <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    const uuid = Uuid();

    // Generate location code
    final locationCode = _generateLocationCode(
      warehouseName: warehouseName,
      zoneName: zone.name,
      rackName: rack.name,
      shelfName: shelf.name,
      binName: bin.name,
    );

    // Get current stock at location
    final currentStock = await _getLocationStock(
      itemId: item.id,
      binId: bin.id,
    );

    if (currentStock == null) {
      throw Exception('No stock found at location: $locationCode');
    }

    final quantityBefore = currentStock.quantity;
    final quantityAfter = quantityBefore - quantity;

    // Prevent negative stock
    if (quantityAfter < 0) {
      throw Exception(
        'Insufficient stock at $locationCode. Available: ${quantityBefore.toStringAsFixed(2)} ${item.unit}',
      );
    }

    // Create stock movement record
    final movement = StockMovement(
      id: uuid.v4(),
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      warehouseId: warehouseId,
      warehouseName: warehouseName,
      zoneId: zone.id,
      zoneName: zone.name,
      rackId: rack.id,
      rackName: rack.name,
      shelfId: shelf.id,
      shelfName: shelf.name,
      binId: bin.id,
      binName: bin.name,
      locationCode: locationCode,
      movementType: MovementType.stockOut,
      quantityBefore: quantityBefore,
      quantityChanged: -quantity,
      quantityAfter: quantityAfter,
      referenceNumber: referenceNumber,
      reason: reason,
      notes: notes,
      performedBy: _currentUser,
      movementDate: now,
      createdAt: now,
    );

    // Insert movement record
    await db.insert('stock_movements', movement.toMap());

    // Update stocks record
    if (quantityAfter == 0) {
      // Remove record if quantity reaches zero
      await db.delete('stocks', where: 'id = ?', whereArgs: [currentStock.id]);
    } else {
      await db.update(
        'stocks',
        {
          'quantity': quantityAfter,
          'lastMovementDate': now.toIso8601String(),
          'updatedAt': now.toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [currentStock.id],
      );
    }

    return movement;
  }

  /// STOCK TRANSFER: Move stock between locations
  /// Creates two movements (out from source, in to destination)
  static Future<StockTransfer> transferStock({
    required InventoryItem item,
    required String fromWarehouseId,
    required String fromWarehouseName,
    required Zone fromZone,
    required Rack fromRack,
    required Shelf fromShelf,
    required Bin fromBin,
    required String toWarehouseId,
    required String toWarehouseName,
    required Zone toZone,
    required Rack toRack,
    required Shelf toShelf,
    required Bin toBin,
    required double quantity,
    String? referenceNumber,
    String? reason,
    String? notes,
  }) async {
    if (quantity <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    const uuid = Uuid();

    // Generate location codes
    final fromLocationCode = _generateLocationCode(
      warehouseName: fromWarehouseName,
      zoneName: fromZone.name,
      rackName: fromRack.name,
      shelfName: fromShelf.name,
      binName: fromBin.name,
    );

    final toLocationCode = _generateLocationCode(
      warehouseName: toWarehouseName,
      zoneName: toZone.name,
      rackName: toRack.name,
      shelfName: toShelf.name,
      binName: toBin.name,
    );

    // Validate source has sufficient stock
    final sourceStock = await _getLocationStock(
      itemId: item.id,
      binId: fromBin.id,
    );

    if (sourceStock == null) {
      throw Exception('No stock found at source location: $fromLocationCode');
    }

    if (sourceStock.quantity < quantity) {
      throw Exception(
        'Insufficient stock at $fromLocationCode. Available: ${sourceStock.quantity.toStringAsFixed(2)} ${item.unit}',
      );
    }

    // Create transfer record
    final transfer = StockTransfer(
      id: uuid.v4(),
      itemId: item.id,
      fromWarehouseId: fromWarehouseId,
      fromZoneId: fromZone.id,
      fromRackId: fromRack.id,
      fromShelfId: fromShelf.id,
      fromBinId: fromBin.id,
      toWarehouseId: toWarehouseId,
      toZoneId: toZone.id,
      toRackId: toRack.id,
      toShelfId: toShelf.id,
      toBinId: toBin.id,
      quantity: quantity,
      batchNumber: sourceStock.batchNumber,
      referenceNumber: referenceNumber,
      reason: reason,
      notes: notes,
      initiatedBy: _currentUser,
      status: TransferStatus.completed,
      transferDate: now,
      createdAt: now,
      completedAt: now,
    );

    await db.insert('stock_transfers', transfer.toMap());

    // Create OUT movement from source
    final outMovement = StockMovement(
      id: uuid.v4(),
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      warehouseId: fromWarehouseId,
      warehouseName: fromWarehouseName,
      zoneId: fromZone.id,
      zoneName: fromZone.name,
      rackId: fromRack.id,
      rackName: fromRack.name,
      shelfId: fromShelf.id,
      shelfName: fromShelf.name,
      binId: fromBin.id,
      binName: fromBin.name,
      locationCode: fromLocationCode,
      movementType: MovementType.transfer,
      quantityBefore: sourceStock.quantity,
      quantityChanged: -quantity,
      quantityAfter: sourceStock.quantity - quantity,
      referenceNumber: referenceNumber,
      batchNumber: sourceStock.batchNumber,
      fromLocationCode: toLocationCode,
      reason: 'Transfer to $toLocationCode',
      notes: notes,
      performedBy: _currentUser,
      movementDate: now,
      createdAt: now,
    );

    await db.insert('stock_movements', outMovement.toMap());

    // Update source stocks
    final newSourceQty = sourceStock.quantity - quantity;
    if (newSourceQty == 0) {
      await db.delete('stocks', where: 'id = ?', whereArgs: [sourceStock.id]);
    } else {
      await db.update(
        'stocks',
        {
          'quantity': newSourceQty,
          'lastMovementDate': now.toIso8601String(),
          'updatedAt': now.toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [sourceStock.id],
      );
    }

    // Get or create destination stocks
    final destStock = await _getLocationStock(
      itemId: item.id,
      binId: toBin.id,
    );

    final destQuantityBefore = destStock?.quantity ?? 0.0;
    final destQuantityAfter = destQuantityBefore + quantity;

    // Create IN movement to destination
    final inMovement = StockMovement(
      id: uuid.v4(),
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      warehouseId: toWarehouseId,
      warehouseName: toWarehouseName,
      zoneId: toZone.id,
      zoneName: toZone.name,
      rackId: toRack.id,
      rackName: toRack.name,
      shelfId: toShelf.id,
      shelfName: toShelf.name,
      binId: toBin.id,
      binName: toBin.name,
      locationCode: toLocationCode,
      movementType: MovementType.transfer,
      quantityBefore: destQuantityBefore,
      quantityChanged: quantity,
      quantityAfter: destQuantityAfter,
      referenceNumber: referenceNumber,
      batchNumber: sourceStock.batchNumber,
      fromWarehouseId: fromWarehouseId,
      fromLocationCode: fromLocationCode,
      reason: 'Transfer from $fromLocationCode',
      notes: notes,
      performedBy: _currentUser,
      movementDate: now,
      createdAt: now,
    );

    await db.insert('stock_movements', inMovement.toMap());

    // Update or create destination stocks
    if (destStock == null) {
      final newDestStock = LocationStock(
        id: uuid.v4(),
        itemId: item.id,
        warehouseId: toWarehouseId,
        zoneId: toZone.id,
        rackId: toRack.id,
        shelfId: toShelf.id,
        binId: toBin.id,
        quantity: quantity,
        batchNumber: sourceStock.batchNumber,
        expiryDate: sourceStock.expiryDate,
        lastMovementDate: now,
        updatedAt: now,
      );
      await db.insert('stocks', newDestStock.toMap());
    } else {
      await db.update(
        'stocks',
        {
          'quantity': destQuantityAfter,
          'lastMovementDate': now.toIso8601String(),
          'updatedAt': now.toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [destStock.id],
      );
    }

    return transfer;
  }

  /// Get stock locations for an item across all warehouses
  static Future<List<Map<String, dynamic>>> getItemStockLocations(String itemId) async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.rawQuery('''
      SELECT 
        st.*,
        w.name as warehouseName,
        c.name as cellName,
        c.code as cellCode
      FROM stocks st
      INNER JOIN warehouses w ON st.warehouseId = w.id
      LEFT JOIN cells c ON st.cellId = c.id
      WHERE st.itemId = ? AND st.quantity > 0
      ORDER BY w.name, c.name
    ''', [itemId]);

    return results;
  }

  /// Get total stock for an item across all locations
  static Future<double> getTotalStockForItem(String itemId) async {
    final db = await DatabaseManager.instance.database;
    
    final result = await db.rawQuery('''
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stocks
      WHERE itemId = ?
    ''', [itemId]);

    return result.first['total'] as double;
  }

  /// Get stock movement history for an item
  static Future<List<StockMovement>> getMovementHistory({
    String? itemId,
    String? warehouseId,
    DateTime? startDate,
    DateTime? endDate,
    int limit = 100,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    String query = 'SELECT * FROM stock_movements WHERE 1=1';
    List<dynamic> args = [];

    if (itemId != null) {
      query += ' AND itemId = ?';
      args.add(itemId);
    }

    if (warehouseId != null) {
      query += ' AND warehouseId = ?';
      args.add(warehouseId);
    }

    if (startDate != null) {
      query += ' AND movementDate >= ?';
      args.add(startDate.toIso8601String());
    }

    if (endDate != null) {
      query += ' AND movementDate <= ?';
      args.add(endDate.toIso8601String());
    }

    query += ' ORDER BY movementDate DESC LIMIT ?';
    args.add(limit);

    final results = await db.rawQuery(query, args);
    return results.map((map) => StockMovement.fromMap(map)).toList();
  }

  /// Get location stock record
  static Future<LocationStock?> _getLocationStock({
    required String itemId,
    required String binId,
  }) async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.query(
      'stocks',
      where: 'itemId = ? AND binId = ?',
      whereArgs: [itemId, binId],
    );

    if (results.isEmpty) return null;
    return LocationStock.fromMap(results.first);
  }

  /// Generate human-readable location code
  static String _generateLocationCode({
    required String warehouseName,
    required String zoneName,
    required String rackName,
    required String shelfName,
    required String binName,
  }) {
    final whCode = warehouseName.replaceAll(' ', '-').toUpperCase();
    return '$whCode/$zoneName/$rackName/$shelfName/$binName';
  }

  /// Get low stock items (below reorder level)
  static Future<List<Map<String, dynamic>>> getLowStockItems() async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.rawQuery('''
      SELECT 
        i.id,
        i.name,
        i.sku,
        i.category,
        i.unit,
        i.reorderLevel,
        i.minStockLevel,
        COALESCE(SUM(st.quantity), 0) as totalStock
      FROM inventory_items i
      LEFT JOIN stocks st ON i.id = st.itemId
      GROUP BY i.id
      HAVING totalStock <= i.reorderLevel
      ORDER BY totalStock ASC
    ''');

    return results;
  }

  /// Get dead stock items (no movement in X days)
  static Future<List<Map<String, dynamic>>> getDeadStock({int daysThreshold = 90}) async {
    final db = await DatabaseManager.instance.database;
    final cutoffDate = DateTime.now().subtract(Duration(days: daysThreshold));
    
    final results = await db.rawQuery('''
      SELECT 
        st.*,
        i.name as itemName,
        i.sku,
        i.category,
        i.unit,
        w.name as warehouseName
      FROM stocks st
      INNER JOIN inventory_items i ON st.itemId = i.id
      INNER JOIN warehouses w ON st.warehouseId = w.id
      WHERE st.updatedAt < ? AND st.quantity > 0
      ORDER BY st.updatedAt ASC
    ''', [cutoffDate.toIso8601String()]);

    return results;
  }
}
