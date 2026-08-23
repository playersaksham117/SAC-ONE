import 'unified_database_manager.dart';

class LocationStockDetail {
  final String stockId;
  final String warehouseId;
  final String warehouseName;
  final String? cellId;
  final String? cellName;
  final String? cellCode;
  // Legacy fields
  final String? zoneId;
  final String? zoneName;
  final String? rackId;
  final String? rackName;
  final String? shelfId;
  final String? shelfName;
  final String? binId;
  final String? binName;
  final double quantity;
  final String? batchNumber;
  final DateTime? expiryDate;
  final DateTime? lastUpdated;

  String get locationPath {
    final parts = <String>[warehouseName];
    // Use new simplified structure if cell is present
    if (cellName != null) {
      parts.add(cellName!);
    } else {
      // Fallback to legacy structure
      if (zoneName != null) parts.add(zoneName!);
      if (rackName != null) parts.add(rackName!);
      if (shelfName != null) parts.add(shelfName!);
      if (binName != null) parts.add(binName!);
    }
    return parts.join(' / ');
  }

  String get hierarchyLevel {
    if (cellName != null) return 'Cell';
    if (binName != null) return 'Bin';
    if (shelfName != null) return 'Shelf';
    if (rackName != null) return 'Rack';
    if (zoneName != null) return 'Zone';
    return 'Warehouse';
  }

  LocationStockDetail({
    required this.stockId,
    required this.warehouseId,
    required this.warehouseName,
    this.cellId,
    this.cellName,
    this.cellCode,
    this.zoneId,
    this.zoneName,
    this.rackId,
    this.rackName,
    this.shelfId,
    this.shelfName,
    this.binId,
    this.binName,
    required this.quantity,
    this.batchNumber,
    this.expiryDate,
    this.lastUpdated,
  });

  factory LocationStockDetail.fromMap(Map<String, dynamic> map) {
    return LocationStockDetail(
      stockId: map['id'] as String,
      warehouseId: map['warehouseId'] as String,
      warehouseName: map['warehouseName'] as String,
      cellId: map['cellId'] as String?,
      cellName: map['cellName'] as String?,
      cellCode: map['cellCode'] as String?,
      zoneId: map['zoneId'] as String?,
      zoneName: map['zoneName'] as String?,
      rackId: map['rackId'] as String?,
      rackName: map['rackName'] as String?,
      shelfId: map['shelfId'] as String?,
      shelfName: map['shelfName'] as String?,
      binId: map['binId'] as String?,
      binName: map['binName'] as String?,
      quantity: (map['quantity'] as num).toDouble(),
      batchNumber: map['batchNumber'] as String?,
      expiryDate: map['expiryDate'] != null ? DateTime.parse(map['expiryDate'] as String) : null,
      lastUpdated: map['lastUpdated'] != null ? DateTime.parse(map['lastUpdated'] as String) : null,
    );
  }
}

class StockSearchResult {
  final String itemId;
  final String itemName;
  final String sku;
  final String? barcode;
  final String category;
  final String unit;
  final double costPrice;
  final double sellingPrice;
  final double totalQuantity;
  final List<LocationStockDetail> locations;
  final bool isLowStock;
  final bool isCritical;
  final double reorderLevel;

  StockSearchResult({
    required this.itemId,
    required this.itemName,
    required this.sku,
    this.barcode,
    required this.category,
    required this.unit,
    required this.costPrice,
    required this.sellingPrice,
    required this.totalQuantity,
    required this.locations,
    required this.isLowStock,
    required this.isCritical,
    required this.reorderLevel,
  });

  double get totalValue => totalQuantity * costPrice;
  double get totalSaleValue => totalQuantity * sellingPrice;
  double get estimatedProfit => totalSaleValue - totalValue;

  int get warehouseCount => locations.map((l) => l.warehouseId).toSet().length;
  int get locationCount => locations.length;
}

/// Core stock search service with fast, indexed searches
class StockSearchService {
  
  /// GLOBAL SEARCH: Find items by SKU, Name, or Barcode
  /// Returns items with all their locations and quantities
  static Future<List<StockSearchResult>> globalSearch(String query) async {
    final db = await DatabaseManager.instance.database;
    final searchTerm = '%$query%';

    try {
      // Search by SKU, Item Name, or Barcode
      final itemResults = await db.rawQuery('''
        SELECT DISTINCT
          ii.id,
          ii.sku,
          ii.name,
          ii.barcode,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          COALESCE(SUM(st.quantity), 0) as totalQuantity
        FROM inventory_items ii
        LEFT JOIN stocks st ON ii.id = st.itemId
        WHERE ii.sku LIKE ? OR ii.name LIKE ? OR ii.barcode LIKE ?
        GROUP BY ii.id
        ORDER BY ii.name ASC
      ''', [searchTerm, searchTerm, searchTerm]);

      List<StockSearchResult> results = [];

      for (var item in itemResults) {
        final itemId = item['id'] as String;
        final totalQty = (item['totalQuantity'] as num).toDouble();

        // Get all locations for this item
        final locations = await _getItemLocations(itemId);

        results.add(StockSearchResult(
          itemId: itemId,
          itemName: item['name'] as String,
          sku: item['sku'] as String,
          barcode: item['barcode'] as String?,
          category: item['category'] as String,
          unit: item['unit'] as String,
          costPrice: (item['costPrice'] as num).toDouble(),
          sellingPrice: (item['sellingPrice'] as num).toDouble(),
          totalQuantity: totalQty,
          locations: locations,
          isLowStock: totalQty <= (item['reorderLevel'] as num).toDouble(),
          isCritical: totalQty <= ((item['reorderLevel'] as num).toDouble() * 0.5),
          reorderLevel: (item['reorderLevel'] as num).toDouble(),
        ));
      }

      return results;
    } catch (e) {
      throw Exception('Search failed: $e');
    }
  }

  /// SEARCH BY SKU ONLY (Fast exact match)
  static Future<StockSearchResult?> searchBySku(String sku) async {
    final db = await DatabaseManager.instance.database;

    try {
      final results = await db.rawQuery('''
        SELECT
          ii.id,
          ii.sku,
          ii.name,
          ii.barcode,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          COALESCE(SUM(st.quantity), 0) as totalQuantity
        FROM inventory_items ii
        LEFT JOIN stocks st ON ii.id = st.itemId
        WHERE ii.sku = ?
        GROUP BY ii.id
      ''', [sku]);

      if (results.isEmpty) return null;

      final item = results.first;
      final itemId = item['id'] as String;
      final locations = await _getItemLocations(itemId);

      return StockSearchResult(
        itemId: itemId,
        itemName: item['name'] as String,
        sku: item['sku'] as String,
        barcode: item['barcode'] as String?,
        category: item['category'] as String,
        unit: item['unit'] as String,
        costPrice: (item['costPrice'] as num).toDouble(),
        sellingPrice: (item['sellingPrice'] as num).toDouble(),
        totalQuantity: (item['totalQuantity'] as num).toDouble(),
        locations: locations,
        isLowStock: (item['totalQuantity'] as num).toDouble() <= (item['reorderLevel'] as num).toDouble(),
        isCritical: (item['totalQuantity'] as num).toDouble() <= ((item['reorderLevel'] as num).toDouble() * 0.5),
        reorderLevel: (item['reorderLevel'] as num).toDouble(),
      );
    } catch (e) {
      throw Exception('SKU search failed: $e');
    }
  }

  /// SEARCH BY BARCODE (Fast exact match)
  static Future<StockSearchResult?> searchByBarcode(String barcode) async {
    final db = await DatabaseManager.instance.database;

    try {
      final results = await db.rawQuery('''
        SELECT
          ii.id,
          ii.sku,
          ii.name,
          ii.barcode,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          COALESCE(SUM(st.quantity), 0) as totalQuantity
        FROM inventory_items ii
        LEFT JOIN stocks st ON ii.id = st.itemId
        WHERE ii.barcode = ?
        GROUP BY ii.id
      ''', [barcode]);

      if (results.isEmpty) return null;

      final item = results.first;
      final itemId = item['id'] as String;
      final locations = await _getItemLocations(itemId);

      return StockSearchResult(
        itemId: itemId,
        itemName: item['name'] as String,
        sku: item['sku'] as String,
        barcode: item['barcode'] as String?,
        category: item['category'] as String,
        unit: item['unit'] as String,
        costPrice: (item['costPrice'] as num).toDouble(),
        sellingPrice: (item['sellingPrice'] as num).toDouble(),
        totalQuantity: (item['totalQuantity'] as num).toDouble(),
        locations: locations,
        isLowStock: (item['totalQuantity'] as num).toDouble() <= (item['reorderLevel'] as num).toDouble(),
        isCritical: (item['totalQuantity'] as num).toDouble() <= ((item['reorderLevel'] as num).toDouble() * 0.5),
        reorderLevel: (item['reorderLevel'] as num).toDouble(),
      );
    } catch (e) {
      throw Exception('Barcode search failed: $e');
    }
  }

  /// Get all locations where an item is stored with quantities
  static Future<List<LocationStockDetail>> _getItemLocations(String itemId) async {
    final db = await DatabaseManager.instance.database;

    try {
      final results = await db.rawQuery('''
        SELECT
          st.id,
          st.quantity,
          st.batchNumber,
          st.expiryDate,
          st.lastUpdated,
          w.id as warehouseId,
          w.name as warehouseName,
          c.id as cellId,
          c.name as cellName,
          c.code as cellCode
        FROM stocks st
        INNER JOIN warehouses w ON st.warehouseId = w.id
        LEFT JOIN cells c ON st.cellId = c.id
        WHERE st.itemId = ? AND st.quantity > 0
        ORDER BY w.name, c.name
      ''', [itemId]);

      return results.map((m) => LocationStockDetail.fromMap(m)).toList();
    } catch (e) {
      throw Exception('Location query failed: $e');
    }
  }

  /// Get stock at specific location
  static Future<double> getLocationStock({
    required String itemId,
    required String warehouseId,
    String? zoneId,
    String? rackId,
    String? shelfId,
    String? binId,
  }) async {
    final db = await DatabaseManager.instance.database;

    try {
      String query = 'SELECT SUM(quantity) as total FROM stocks WHERE itemId = ? AND warehouseId = ?';
      List<dynamic> args = [itemId, warehouseId];

      if (zoneId != null) {
        query += ' AND zoneId = ?';
        args.add(zoneId);
      }
      if (rackId != null) {
        query += ' AND rackId = ?';
        args.add(rackId);
      }
      if (shelfId != null) {
        query += ' AND shelfId = ?';
        args.add(shelfId);
      }
      if (binId != null) {
        query += ' AND binId = ?';
        args.add(binId);
      }

      final result = await db.rawQuery(query, args);
      return (result.first['total'] as num?)?.toDouble() ?? 0.0;
    } catch (e) {
      throw Exception('Stock query failed: $e');
    }
  }

  /// Get stock summary by warehouse for an item
  static Future<List<Map<String, dynamic>>> getItemStockByWarehouse(String itemId) async {
    final db = await DatabaseManager.instance.database;

    try {
      return await db.rawQuery('''
        SELECT
          w.id,
          w.name,
          w.code,
          COALESCE(SUM(st.quantity), 0) as totalQuantity,
          COUNT(DISTINCT st.id) as locationCount
        FROM warehouses w
        LEFT JOIN stocks st ON w.id = st.warehouseId AND st.itemId = ?
        GROUP BY w.id
        ORDER BY w.name
      ''', [itemId]);
    } catch (e) {
      throw Exception('Warehouse stock query failed: $e');
    }
  }

  /// Get recent stock movements for an item (last N transactions)
  static Future<List<Map<String, dynamic>>> getItemMovementHistory(
    String itemId, {
    int limit = 10,
  }) async {
    final db = await DatabaseManager.instance.database;

    try {
      return await db.rawQuery('''
        SELECT
          t.id,
          t.type,
          t.quantity,
          t.unitPrice,
          t.totalAmount,
          t.transactionDate,
          t.referenceNumber,
          w.name as warehouseName
        FROM transactions t
        INNER JOIN warehouses w ON t.warehouseId = w.id
        WHERE t.itemId = ?
        ORDER BY t.transactionDate DESC
        LIMIT ?
      ''', [itemId, limit]);
    } catch (e) {
      throw Exception('Movement history query failed: $e');
    }
  }

  /// Find out-of-stock locations for an item
  static Future<List<Map<String, dynamic>>> getOutOfStockLocations() async {
    final db = await DatabaseManager.instance.database;

    try {
      return await db.rawQuery('''
        SELECT
          ii.id,
          ii.sku,
          ii.name,
          COUNT(DISTINCT w.id) as warehouseCount
        FROM inventory_items ii
        LEFT JOIN stocks st ON ii.id = st.itemId
        LEFT JOIN warehouses w ON st.warehouseId = w.id
        WHERE COALESCE(SUM(st.quantity), 0) = 0
        GROUP BY ii.id
        ORDER BY ii.name
      ''');
    } catch (e) {
      throw Exception('Out of stock query failed: $e');
    }
  }

  /// Fast text search with wildcard support
  static Future<List<StockSearchResult>> advancedSearch({
    String? skuPattern,
    String? namePattern,
    String? category,
    String? warehouseId,
    bool? isLowStock,
    bool? isCritical,
  }) async {
    final db = await DatabaseManager.instance.database;
    String query = '''
      SELECT DISTINCT
        ii.id,
        ii.sku,
        ii.name,
        ii.barcode,
        ii.category,
        ii.unit,
        ii.costPrice,
        ii.sellingPrice,
        ii.reorderLevel,
        COALESCE(SUM(st.quantity), 0) as totalQuantity
      FROM inventory_items ii
      LEFT JOIN stocks st ON ii.id = st.itemId
      WHERE 1=1
    ''';

    List<dynamic> args = [];

    if (skuPattern != null) {
      query += ' AND ii.sku LIKE ?';
      args.add('%$skuPattern%');
    }

    if (namePattern != null) {
      query += ' AND ii.name LIKE ?';
      args.add('%$namePattern%');
    }

    if (category != null) {
      query += ' AND ii.category = ?';
      args.add(category);
    }

    if (warehouseId != null) {
      query += ' AND st.warehouseId = ?';
      args.add(warehouseId);
    }

    query += ' GROUP BY ii.id';

    if (isLowStock == true) {
      query += ' HAVING totalQuantity <= ii.reorderLevel';
    }

    if (isCritical == true) {
      query += ' HAVING totalQuantity <= (ii.reorderLevel * 0.5)';
    }

    query += ' ORDER BY ii.name';

    try {
      final itemResults = await db.rawQuery(query, args);
      List<StockSearchResult> results = [];

      for (var item in itemResults) {
        final itemId = item['id'] as String;
        final totalQty = (item['totalQuantity'] as num).toDouble();
        final locations = await _getItemLocations(itemId);

        results.add(StockSearchResult(
          itemId: itemId,
          itemName: item['name'] as String,
          sku: item['sku'] as String,
          barcode: item['barcode'] as String?,
          category: item['category'] as String,
          unit: item['unit'] as String,
          costPrice: (item['costPrice'] as num).toDouble(),
          sellingPrice: (item['sellingPrice'] as num).toDouble(),
          totalQuantity: totalQty,
          locations: locations,
          isLowStock: totalQty <= (item['reorderLevel'] as num).toDouble(),
          isCritical: totalQty <= ((item['reorderLevel'] as num).toDouble() * 0.5),
          reorderLevel: (item['reorderLevel'] as num).toDouble(),
        ));
      }

      return results;
    } catch (e) {
      throw Exception('Advanced search failed: $e');
    }
  }

  /// Adjust stock quantity (increase or decrease) at a specific location
  static Future<void> adjustStockQuantity({
    required String stockId,
    required double adjustment,
    String reason = 'Manual adjustment',
  }) async {
    final db = await DatabaseManager.instance.database;

    try {
      // Get current stock
      final results = await db.query('stocks', where: 'id = ?', whereArgs: [stockId]);
      
      if (results.isEmpty) {
        throw Exception('Stock record not found');
      }

      final currentQty = (results.first['quantity'] as num).toDouble();
      final newQty = currentQty + adjustment;

      if (newQty < 0) {
        throw Exception('Cannot reduce stock below zero. Current: $currentQty, Adjustment: $adjustment');
      }

      // Update stock quantity
      await db.update(
        'stocks',
        {
          'quantity': newQty,
          'lastUpdated': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [stockId],
      );

      // If quantity becomes 0, optionally delete the record
      if (newQty == 0) {
        await db.delete('stocks', where: 'id = ?', whereArgs: [stockId]);
      }
    } catch (e) {
      throw Exception('Failed to adjust stock: $e');
    }
  }
}
