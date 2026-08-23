/// ============================================================
/// REPORTS PROVIDER - Real-time reports and analytics
/// ============================================================
/// 
/// Manages report data generation from live database queries.
/// Provides fresh data that syncs with actual inventory state.
/// 
/// Architecture: Provider Layer
/// ============================================================
library;

import 'package:flutter/foundation.dart';
import '../services/unified_database_manager.dart';

class ReportData {
  final String itemId;
  final String itemName;
  final String sku;
  final String category;
  final String unit;
  final double costPrice;
  final double sellingPrice;
  final double reorderLevel;
  final double minStockLevel;
  final double totalQuantity;
  final double totalValue;
  final int warehouseCount;
  final String? batchNumber;
  final DateTime? expiryDate;

  ReportData({
    required this.itemId,
    required this.itemName,
    required this.sku,
    required this.category,
    required this.unit,
    required this.costPrice,
    required this.sellingPrice,
    required this.reorderLevel,
    required this.minStockLevel,
    required this.totalQuantity,
    required this.totalValue,
    required this.warehouseCount,
    this.batchNumber,
    this.expiryDate,
  });
}

class WarehouseStockData {
  final String warehouseId;
  final String warehouseName;
  final int itemCount;
  final double totalQuantity;
  final double totalValue;
  final List<Map<String, dynamic>> items;

  WarehouseStockData({
    required this.warehouseId,
    required this.warehouseName,
    required this.itemCount,
    required this.totalQuantity,
    required this.totalValue,
    required this.items,
  });
}

class TransactionSummary {
  final String type;
  final int count;
  final double totalQuantity;
  final double totalValue;
  final DateTime date;

  TransactionSummary({
    required this.type,
    required this.count,
    required this.totalQuantity,
    required this.totalValue,
    required this.date,
  });
}

/// Reports and Analytics Provider
class ReportsProvider with ChangeNotifier {
  final DatabaseManager _db = DatabaseManager.instance;
  
  List<ReportData> _stockValuationReport = [];
  List<ReportData> _lowStockReport = [];
  List<ReportData> _criticalStockReport = [];
  List<WarehouseStockData> _warehouseReport = [];
  List<TransactionSummary> _transactionReport = [];
  
  Map<String, dynamic> _summaryStats = {};
  bool _isLoading = false;
  String? _error;
  DateTime? _lastRefreshTime;

  // Getters
  List<ReportData> get stockValuationReport => _stockValuationReport;
  List<ReportData> get lowStockReport => _lowStockReport;
  List<ReportData> get criticalStockReport => _criticalStockReport;
  List<WarehouseStockData> get warehouseReport => _warehouseReport;
  List<TransactionSummary> get transactionReport => _transactionReport;
  Map<String, dynamic> get summaryStats => _summaryStats;
  bool get isLoading => _isLoading;
  String? get error => _error;
  DateTime? get lastRefreshTime => _lastRefreshTime;

  /// Load all reports (full sync)
  Future<void> loadAllReports() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await Future.wait([
        loadStockValuationReport(),
        loadLowStockReport(),
        loadWarehouseReport(),
        loadTransactionReport(),
        loadSummaryStats(),
      ]);
      _lastRefreshTime = DateTime.now();
    } catch (e) {
      _error = e.toString();
      debugPrint('Error loading reports: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load stock valuation report (live from database)
  Future<void> loadStockValuationReport() async {
    try {
      final database = await _db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          ii.id,
          ii.name,
          ii.sku,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          ii.minStockLevel,
          SUM(COALESCE(s.quantity, 0)) as totalQty,
          SUM(COALESCE(s.quantity, 0)) * ii.costPrice as totalValue,
          COUNT(DISTINCT s.warehouseId) as warehouseCount,
          MAX(s.batchNumber) as batchNumber,
          MAX(s.expiryDate) as expiryDate
        FROM inventory_items ii
        LEFT JOIN stocks s ON ii.id = s.itemId
        WHERE ii.isActive = 1
        GROUP BY ii.id
        ORDER BY ii.name
      ''');

      _stockValuationReport = results.map((row) {
        return ReportData(
          itemId: row['id'] as String,
          itemName: row['name'] as String,
          sku: row['sku'] as String,
          category: row['category'] as String,
          unit: row['unit'] as String,
          costPrice: (row['costPrice'] as num).toDouble(),
          sellingPrice: (row['sellingPrice'] as num).toDouble(),
          reorderLevel: (row['reorderLevel'] as num).toDouble(),
          minStockLevel: (row['minStockLevel'] as num).toDouble(),
          totalQuantity: (row['totalQty'] as num?)?.toDouble() ?? 0.0,
          totalValue: (row['totalValue'] as num?)?.toDouble() ?? 0.0,
          warehouseCount: (row['warehouseCount'] as num?)?.toInt() ?? 0,
          batchNumber: row['batchNumber'] as String?,
          expiryDate: row['expiryDate'] != null 
            ? DateTime.tryParse(row['expiryDate'] as String)
            : null,
        );
      }).toList();

      notifyListeners();
      debugPrint('Stock valuation report loaded: ${_stockValuationReport.length} items');
    } catch (e) {
      _error = 'Error loading stock valuation: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Load low stock items report
  Future<void> loadLowStockReport() async {
    try {
      final database = await _db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          ii.id,
          ii.name,
          ii.sku,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          ii.minStockLevel,
          SUM(COALESCE(s.quantity, 0)) as totalQty,
          SUM(COALESCE(s.quantity, 0)) * ii.costPrice as totalValue,
          COUNT(DISTINCT s.warehouseId) as warehouseCount,
          MAX(s.batchNumber) as batchNumber,
          MAX(s.expiryDate) as expiryDate
        FROM inventory_items ii
        LEFT JOIN stocks s ON ii.id = s.itemId
        WHERE ii.isActive = 1 
        GROUP BY ii.id
        HAVING totalQty <= ii.reorderLevel AND totalQty > ii.minStockLevel
        ORDER BY totalQty ASC
      ''');

      _lowStockReport = results.map((row) {
        return ReportData(
          itemId: row['id'] as String,
          itemName: row['name'] as String,
          sku: row['sku'] as String,
          category: row['category'] as String,
          unit: row['unit'] as String,
          costPrice: (row['costPrice'] as num).toDouble(),
          sellingPrice: (row['sellingPrice'] as num).toDouble(),
          reorderLevel: (row['reorderLevel'] as num).toDouble(),
          minStockLevel: (row['minStockLevel'] as num).toDouble(),
          totalQuantity: (row['totalQty'] as num?)?.toDouble() ?? 0.0,
          totalValue: (row['totalValue'] as num?)?.toDouble() ?? 0.0,
          warehouseCount: (row['warehouseCount'] as num?)?.toInt() ?? 0,
          batchNumber: row['batchNumber'] as String?,
          expiryDate: row['expiryDate'] != null 
            ? DateTime.tryParse(row['expiryDate'] as String)
            : null,
        );
      }).toList();

      notifyListeners();
      debugPrint('Low stock report loaded: ${_lowStockReport.length} items');
    } catch (e) {
      _error = 'Error loading low stock report: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Load critical stock items report
  Future<void> loadCriticalStockReport() async {
    try {
      final database = await _db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          ii.id,
          ii.name,
          ii.sku,
          ii.category,
          ii.unit,
          ii.costPrice,
          ii.sellingPrice,
          ii.reorderLevel,
          ii.minStockLevel,
          SUM(COALESCE(s.quantity, 0)) as totalQty,
          SUM(COALESCE(s.quantity, 0)) * ii.costPrice as totalValue,
          COUNT(DISTINCT s.warehouseId) as warehouseCount,
          MAX(s.batchNumber) as batchNumber,
          MAX(s.expiryDate) as expiryDate
        FROM inventory_items ii
        LEFT JOIN stocks s ON ii.id = s.itemId
        WHERE ii.isActive = 1 
        GROUP BY ii.id
        HAVING totalQty <= ii.minStockLevel
        ORDER BY totalQty ASC
      ''');

      _criticalStockReport = results.map((row) {
        return ReportData(
          itemId: row['id'] as String,
          itemName: row['name'] as String,
          sku: row['sku'] as String,
          category: row['category'] as String,
          unit: row['unit'] as String,
          costPrice: (row['costPrice'] as num).toDouble(),
          sellingPrice: (row['sellingPrice'] as num).toDouble(),
          reorderLevel: (row['reorderLevel'] as num).toDouble(),
          minStockLevel: (row['minStockLevel'] as num).toDouble(),
          totalQuantity: (row['totalQty'] as num?)?.toDouble() ?? 0.0,
          totalValue: (row['totalValue'] as num?)?.toDouble() ?? 0.0,
          warehouseCount: (row['warehouseCount'] as num?)?.toInt() ?? 0,
          batchNumber: row['batchNumber'] as String?,
          expiryDate: row['expiryDate'] != null 
            ? DateTime.tryParse(row['expiryDate'] as String)
            : null,
        );
      }).toList();

      notifyListeners();
      debugPrint('Critical stock report loaded: ${_criticalStockReport.length} items');
    } catch (e) {
      _error = 'Error loading critical stock report: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Load warehouse stock report
  Future<void> loadWarehouseReport() async {
    try {
      final database = await _db.database;
      
      // Get all warehouses with their stock summary
      final warehouseResults = await database.rawQuery('''
        SELECT 
          w.id,
          w.name,
          COUNT(DISTINCT s.itemId) as itemCount,
          SUM(COALESCE(s.quantity, 0)) as totalQty,
          SUM(COALESCE(s.quantity, 0) * ii.costPrice) as totalValue
        FROM warehouses w
        LEFT JOIN stocks s ON w.id = s.warehouseId
        LEFT JOIN inventory_items ii ON s.itemId = ii.id
        WHERE w.isActive = 1
        GROUP BY w.id
        ORDER BY w.name
      ''');

      _warehouseReport = [];
      
      for (var warehouse in warehouseResults) {
        final warehouseId = warehouse['id'] as String;
        
        // Get items in this warehouse
        final itemResults = await database.rawQuery('''
          SELECT 
            ii.id,
            ii.name,
            ii.sku,
            SUM(COALESCE(s.quantity, 0)) as qty,
            ii.costPrice
          FROM inventory_items ii
          LEFT JOIN stocks s ON ii.id = s.itemId AND s.warehouseId = ?
          WHERE ii.isActive = 1
          GROUP BY ii.id
          ORDER BY ii.name
        ''', [warehouseId]);

        _warehouseReport.add(
          WarehouseStockData(
            warehouseId: warehouseId,
            warehouseName: warehouse['name'] as String,
            itemCount: (warehouse['itemCount'] as num?)?.toInt() ?? 0,
            totalQuantity: (warehouse['totalQty'] as num?)?.toDouble() ?? 0.0,
            totalValue: (warehouse['totalValue'] as num?)?.toDouble() ?? 0.0,
            items: itemResults.cast<Map<String, dynamic>>(),
          ),
        );
      }

      notifyListeners();
      debugPrint('Warehouse report loaded: ${_warehouseReport.length} warehouses');
    } catch (e) {
      _error = 'Error loading warehouse report: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Load transaction summary report
  Future<void> loadTransactionReport() async {
    try {
      final database = await _db.database;
      
      final results = await database.rawQuery('''
        SELECT 
          type,
          COUNT(*) as count,
          SUM(quantity) as totalQty,
          SUM(totalAmount) as totalValue,
          date(transactionDate) as txnDate
        FROM transactions
        WHERE date(transactionDate) >= date('now', '-30 days')
        GROUP BY type, txnDate
        ORDER BY txnDate DESC, type
      ''');

      _transactionReport = results.map((row) {
        return TransactionSummary(
          type: row['type'] as String,
          count: (row['count'] as num).toInt(),
          totalQuantity: (row['totalQty'] as num?)?.toDouble() ?? 0.0,
          totalValue: (row['totalValue'] as num?)?.toDouble() ?? 0.0,
          date: DateTime.parse(row['txnDate'] as String),
        );
      }).toList();

      notifyListeners();
      debugPrint('Transaction report loaded: ${_transactionReport.length} records');
    } catch (e) {
      _error = 'Error loading transaction report: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Load summary statistics
  Future<void> loadSummaryStats() async {
    try {
      final database = await _db.database;
      
      final itemsResult = await database.rawQuery('SELECT COUNT(*) as count FROM inventory_items WHERE isActive = 1');
      final warehousesResult = await database.rawQuery('SELECT COUNT(*) as count FROM warehouses WHERE isActive = 1');
      final stockResult = await database.rawQuery('SELECT SUM(quantity) as total FROM stocks');
      final valueResult = await database.rawQuery('''
        SELECT SUM(s.quantity * ii.costPrice) as total
        FROM stocks s
        JOIN inventory_items ii ON s.itemId = ii.id
      ''');
      
      _summaryStats = {
        'totalItems': (itemsResult.first['count'] as num?)?.toInt() ?? 0,
        'totalWarehouses': (warehousesResult.first['count'] as num?)?.toInt() ?? 0,
        'totalStockUnits': (stockResult.first['total'] as num?)?.toDouble() ?? 0.0,
        'totalInventoryValue': (valueResult.first['total'] as num?)?.toDouble() ?? 0.0,
      };

      notifyListeners();
      debugPrint('Summary stats loaded: $_summaryStats');
    } catch (e) {
      _error = 'Error loading summary stats: $e';
      debugPrint(_error);
      notifyListeners();
    }
  }

  /// Refresh all reports with fresh data from database
  Future<void> refreshReports() async {
    debugPrint('Refreshing reports with fresh data...');
    await loadAllReports();
  }

  /// Get filtered report data
  List<ReportData> filterReportData(
    List<ReportData> data, {
    String? searchQuery,
    String? warehouseId,
    String? category,
    String sortBy = 'name',
    bool ascending = true,
  }) {
    var filtered = data.toList();

    // Apply search filter
    if (searchQuery != null && searchQuery.isNotEmpty) {
      final query = searchQuery.toLowerCase();
      filtered = filtered.where((item) {
        return item.itemName.toLowerCase().contains(query) ||
            item.sku.toLowerCase().contains(query) ||
            item.category.toLowerCase().contains(query);
      }).toList();
    }

    // Apply category filter
    if (category != null && category.isNotEmpty) {
      filtered = filtered.where((item) => item.category == category).toList();
    }

    // Apply sorting
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.itemName.compareTo(b.itemName));
        break;
      case 'qty':
        filtered.sort((a, b) => a.totalQuantity.compareTo(b.totalQuantity));
        break;
      case 'value':
        filtered.sort((a, b) => a.totalValue.compareTo(b.totalValue));
        break;
      case 'sku':
        filtered.sort((a, b) => a.sku.compareTo(b.sku));
        break;
    }

    if (!ascending) {
      filtered = filtered.reversed.toList();
    }

    return filtered;
  }

  /// Export report data as map
  Map<String, dynamic> exportReportAsMap(String reportType) {
    switch (reportType) {
      case 'stock_valuation':
        return {
          'title': 'Stock Valuation Report',
          'generated': DateTime.now().toIso8601String(),
          'summary': _summaryStats,
          'data': _stockValuationReport.map((r) => {
            'itemName': r.itemName,
            'sku': r.sku,
            'category': r.category,
            'quantity': r.totalQuantity,
            'unitPrice': r.costPrice,
            'totalValue': r.totalValue,
          }).toList(),
        };
      case 'low_stock':
        return {
          'title': 'Low Stock Report',
          'generated': DateTime.now().toIso8601String(),
          'data': _lowStockReport.map((r) => {
            'itemName': r.itemName,
            'sku': r.sku,
            'currentQty': r.totalQuantity,
            'reorderLevel': r.reorderLevel,
            'status': r.totalQuantity <= r.minStockLevel ? 'CRITICAL' : 'LOW',
          }).toList(),
        };
      case 'warehouse':
        return {
          'title': 'Warehouse Stock Report',
          'generated': DateTime.now().toIso8601String(),
          'data': _warehouseReport.map((w) => {
            'warehouse': w.warehouseName,
            'items': w.itemCount,
            'totalQty': w.totalQuantity,
            'totalValue': w.totalValue,
          }).toList(),
        };
      case 'transactions':
        return {
          'title': 'Transaction Report',
          'generated': DateTime.now().toIso8601String(),
          'data': _transactionReport.map((t) => {
            'type': t.type,
            'date': t.date.toIso8601String(),
            'count': t.count,
            'quantity': t.totalQuantity,
            'value': t.totalValue,
          }).toList(),
        };
      default:
        return {};
    }
  }
}
