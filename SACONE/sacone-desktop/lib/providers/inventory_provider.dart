import 'package:flutter/foundation.dart';
import '../models/inventory_item.dart';
import '../models/stock.dart';
import '../services/unified_database_manager.dart';
import '../services/stock_control_service.dart';
import '../services/sync_queue_service.dart';

class InventoryProvider with ChangeNotifier {
  List<InventoryItem> _items = [];
  List<Stock> _stocks = [];
  List<Transaction> _transactions = [];
  final Map<String, double> _totalStockByItem = {};
  
  // Daily/Monthly stats cache
  Map<String, dynamic> _dailyStats = {};
  Map<String, dynamic> _monthlyStats = {};
  
  List<InventoryItem> get items => _items;
  List<Stock> get stocks => _stocks;
  List<Transaction> get transactions => _transactions;
  Map<String, dynamic> get dailyStats => _dailyStats;
  Map<String, dynamic> get monthlyStats => _monthlyStats;
  
  List<InventoryItem> get lowStockItems {
    return _items.where((item) {
      final totalStock = _totalStockByItem[item.id] ?? 0;
      return totalStock <= item.reorderLevel;
    }).toList();
  }
  
  List<InventoryItem> get criticalStockItems {
    return _items.where((item) {
      final totalStock = _totalStockByItem[item.id] ?? 0;
      return totalStock <= item.minStockLevel;
    }).toList();
  }

  Future<void> loadInventoryItems() async {
    final db = await DatabaseManager.instance.database;
    final List<Map<String, dynamic>> maps = await db.query('inventory_items');
    _items = maps.map((map) => InventoryItem.fromMap(map)).toList();
    await _calculateTotalStocks();
    notifyListeners();
  }

  Future<void> _calculateTotalStocks() async {
    final db = await DatabaseManager.instance.database;
    _totalStockByItem.clear();
    
    for (var item in _items) {
      final result = await db.rawQuery(
        'SELECT SUM(quantity) as total FROM stocks WHERE itemId = ?',
        [item.id],
      );
      _totalStockByItem[item.id] = result.first['total'] as double? ?? 0.0;
    }
  }

  double getTotalStock(String itemId) {
    return _totalStockByItem[itemId] ?? 0.0;
  }

  Future<void> addInventoryItem(InventoryItem item) async {
    try {
      print('Adding inventory item: ${item.name}');
      final db = await DatabaseManager.instance.database;
      print('Database obtained');
      final itemMap = item.toMap();
      print('Item map: $itemMap');
      await db.insert('inventory_items', itemMap);
      await trackMutation(
        tableName: 'inventory_items',
        recordId: item.id,
        operation: 'upsert',
        payload: itemMap,
      );
      print('Item inserted into database');
      await loadInventoryItems();
      print('Inventory items reloaded, total items: ${_items.length}');
    } catch (e) {
      print('Error adding inventory item: $e');
      rethrow;
    }
  }

  /// Bulk import items with callback for progress updates
  /// Much faster than adding items one by one
  Future<void> bulkImportInventoryItems(
    List<InventoryItem> items, {
    Function(int progress, int total)? onProgress,
  }) async {
    if (items.isEmpty) return;

    try {
      final db = await DatabaseManager.instance.database;
      
      await db.transaction((txn) async {
        for (int i = 0; i < items.length; i++) {
          await txn.insert('inventory_items', items[i].toMap());
          onProgress?.call(i + 1, items.length);
        }
      });
      
      // Load all items once after bulk import
      await loadInventoryItems();
      print('Bulk imported ${items.length} inventory items');
    } catch (e) {
      print('Error bulk importing inventory items: $e');
      rethrow;
    }
  }

  Future<void> updateInventoryItem(InventoryItem item) async {
    final db = await DatabaseManager.instance.database;
    await db.update(
      'inventory_items',
      item.toMap(),
      where: 'id = ?',
      whereArgs: [item.id],
    );
    await trackMutation(
      tableName: 'inventory_items',
      recordId: item.id,
      operation: 'upsert',
      payload: item.toMap(),
    );
    await loadInventoryItems();
  }

  Future<void> deleteInventoryItem(String id) async {
    final db = await DatabaseManager.instance.database;
    await db.delete('inventory_items', where: 'id = ?', whereArgs: [id]);
    await trackMutation(
      tableName: 'inventory_items',
      recordId: id,
      operation: 'delete',
      payload: {'id': id},
    );
    await loadInventoryItems();
  }

  Future<void> loadStocks([String? warehouseId]) async {
    final db = await DatabaseManager.instance.database;
    List<Map<String, dynamic>> maps;
    
    if (warehouseId != null) {
      maps = await db.query('stocks', where: 'warehouseId = ?', whereArgs: [warehouseId]);
    } else {
      maps = await db.query('stocks');
    }
    
    _stocks = maps.map((map) => Stock.fromMap(map)).toList();
    notifyListeners();
  }

  Future<void> addTransaction(Transaction transaction, bool isIncoming) async {
    final db = await DatabaseManager.instance.database;

    await db.transaction((txn) async {
      await txn.insert('transactions', transaction.toMap());
      await trackMutation(
        tableName: 'transactions',
        recordId: transaction.id,
        operation: 'upsert',
        payload: transaction.toMap(),
        txn: txn,
      );

      if (isIncoming) {
        await StockControlService.stockIn(
          txn: txn,
          itemId: transaction.itemId,
          warehouseId: transaction.warehouseId,
          quantity: transaction.quantity,
          cellId: transaction.locationId,
        );
      } else {
        await StockControlService.stockOut(
          txn: txn,
          itemId: transaction.itemId,
          warehouseId: transaction.warehouseId,
          quantity: transaction.quantity,
          cellId: transaction.locationId,
        );
      }
    });

    await loadInventoryItems();
    await loadStocks();
    notifyListeners();
  }

  Future<void> loadTransactions({String? itemId, String? warehouseId}) async {
    final db = await DatabaseManager.instance.database;
    List<Map<String, dynamic>> maps;
    
    if (itemId != null) {
      maps = await db.query('transactions', where: 'itemId = ?', whereArgs: [itemId], orderBy: 'transactionDate DESC');
    } else if (warehouseId != null) {
      maps = await db.query('transactions', where: 'warehouseId = ?', whereArgs: [warehouseId], orderBy: 'transactionDate DESC');
    } else {
      maps = await db.query('transactions', orderBy: 'transactionDate DESC', limit: 100);
    }
    
    _transactions = maps.map((map) => Transaction.fromMap(map)).toList();
    notifyListeners();
  }

  /// Load daily stats for purchases and sales
  Future<void> loadDailyStats() async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    
    final stats = await db.rawQuery('''
      SELECT 
        type,
        SUM(quantity) as totalQty,
        SUM(totalAmount) as totalValue,
        COUNT(*) as count
      FROM transactions
      WHERE date(transactionDate) = date(?)
      GROUP BY type
    ''', [startOfToday.toIso8601String()]);
    
    double purchases = 0;
    double sales = 0;
    double purchaseValue = 0;
    double salesValue = 0;
    int purchaseCount = 0;
    int salesCount = 0;
    
    for (var stat in stats) {
      final type = stat['type'] as String?;
      final qty = (stat['totalQty'] as num? ?? 0).toDouble();
      final value = (stat['totalValue'] as num? ?? 0).toDouble();
      final count = stat['count'] as int? ?? 0;
      
      if (type == 'purchase') {
        purchases = qty;
        purchaseValue = value;
        purchaseCount = count;
      } else if (type == 'sale') {
        sales = qty;
        salesValue = value;
        salesCount = count;
      }
    }
    
    _dailyStats = {
      'purchases': purchases,
      'sales': sales,
      'purchaseValue': purchaseValue,
      'salesValue': salesValue,
      'purchaseCount': purchaseCount,
      'salesCount': salesCount,
      'netMovement': purchases - sales,
    };
    
    notifyListeners();
  }

  /// Load monthly stats for purchases and sales
  Future<void> loadMonthlyStats() async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    final startOfMonth = DateTime(now.year, now.month, 1);
    
    final stats = await db.rawQuery('''
      SELECT 
        type,
        SUM(quantity) as totalQty,
        SUM(totalAmount) as totalValue,
        COUNT(*) as count
      FROM transactions
      WHERE date(transactionDate) >= date(?)
      GROUP BY type
    ''', [startOfMonth.toIso8601String()]);
    
    double purchases = 0;
    double sales = 0;
    double purchaseValue = 0;
    double salesValue = 0;
    int purchaseCount = 0;
    int salesCount = 0;
    
    for (var stat in stats) {
      final type = stat['type'] as String?;
      final qty = (stat['totalQty'] as num? ?? 0).toDouble();
      final value = (stat['totalValue'] as num? ?? 0).toDouble();
      final count = stat['count'] as int? ?? 0;
      
      if (type == 'purchase') {
        purchases = qty;
        purchaseValue = value;
        purchaseCount = count;
      } else if (type == 'sale') {
        sales = qty;
        salesValue = value;
        salesCount = count;
      }
    }
    
    _monthlyStats = {
      'purchases': purchases,
      'sales': sales,
      'purchaseValue': purchaseValue,
      'salesValue': salesValue,
      'purchaseCount': purchaseCount,
      'salesCount': salesCount,
      'netMovement': purchases - sales,
    };
    
    notifyListeners();
  }

  /// Get stock by cell
  Future<List<Map<String, dynamic>>> getStockByCell(String cellId) async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.rawQuery('''
      SELECT 
        s.id as stockId,
        s.itemId,
        s.quantity,
        s.batchNumber,
        s.expiryDate,
        s.lastUpdated,
        i.name as itemName,
        i.sku,
        i.unit,
        i.category,
        i.costPrice,
        i.sellingPrice
      FROM stocks s
      JOIN inventory_items i ON s.itemId = i.id
      WHERE s.cellId = ? AND s.quantity > 0
      ORDER BY i.name
    ''', [cellId]);
    
    return results.cast<Map<String, dynamic>>();
  }

  /// Get transactions for a specific date
  Future<List<Map<String, dynamic>>> getTransactionsByDate(DateTime date) async {
    final db = await DatabaseManager.instance.database;
    final startOfDay = DateTime(date.year, date.month, date.day);
    
    final results = await db.rawQuery('''
      SELECT 
        t.id,
        t.type,
        t.itemId,
        t.warehouseId,
        t.locationId,
        t.quantity,
        t.unitPrice,
        t.totalAmount,
        t.referenceNumber,
        t.supplier,
        t.customer,
        t.notes,
        t.transactionDate,
        t.createdAt,
        i.name as itemName,
        i.sku,
        i.unit,
        i.category,
        w.name as warehouseName,
        c.name as cellName,
        c.code as cellCode
      FROM transactions t
      JOIN inventory_items i ON t.itemId = i.id
      JOIN warehouses w ON t.warehouseId = w.id
      LEFT JOIN cells c ON t.locationId = c.id
      WHERE date(t.transactionDate) = date(?)
      ORDER BY t.transactionDate DESC
    ''', [startOfDay.toIso8601String()]);
    
    return results.cast<Map<String, dynamic>>();
  }

  /// Get stock location summary
  Future<List<Map<String, dynamic>>> getStockLocationSummary(String warehouseId) async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.rawQuery('''
      SELECT 
        c.id as cellId,
        c.name as cellName,
        c.code as cellCode,
        COUNT(DISTINCT s.itemId) as productCount,
        SUM(s.quantity) as totalQuantity,
        SUM(s.quantity * i.costPrice) as totalValue
      FROM cells c
      LEFT JOIN stocks s ON s.cellId = c.id AND s.quantity > 0
      LEFT JOIN inventory_items i ON s.itemId = i.id
      WHERE c.warehouseId = ?
      GROUP BY c.id
      ORDER BY c.code
    ''', [warehouseId]);
    
    return results.cast<Map<String, dynamic>>();
  }
}
