/// ============================================================
/// DASHBOARD PROVIDER - Aggregated dashboard state
/// ============================================================
/// 
/// Provides aggregated data for dashboard display.
/// Combines data from multiple services for overview.
/// 
/// Architecture: Provider Layer (State Management)
/// ============================================================

import 'package:flutter/foundation.dart';

import '../../core/types/result.dart';
import '../../domain/entities/stock.dart';
import '../../domain/entities/stock_movement.dart';
import '../../data/services/stock_service.dart';
import '../../data/services/movement_service.dart';
import '../../data/services/item_service.dart';
import '../../data/services/warehouse_service.dart';

/// Dashboard statistics summary
class DashboardStats {
  final int totalItems;
  final int totalWarehouses;
  final int totalLocations;
  final int totalStockRecords;
  final double totalStockValue;
  final int expiringItemsCount;
  final int lowStockCount;
  final int outOfStockCount;
  final int todayMovements;
  final int pendingMovements;
  
  const DashboardStats({
    this.totalItems = 0,
    this.totalWarehouses = 0,
    this.totalLocations = 0,
    this.totalStockRecords = 0,
    this.totalStockValue = 0.0,
    this.expiringItemsCount = 0,
    this.lowStockCount = 0,
    this.outOfStockCount = 0,
    this.todayMovements = 0,
    this.pendingMovements = 0,
  });
}

/// Provider for dashboard data
class DashboardProvider extends ChangeNotifier {
  final StockService _stockService = StockService();
  final MovementService _movementService = MovementService();
  final ItemService _itemService = ItemService();
  final WarehouseService _warehouseService = WarehouseService();
  
  // State
  DashboardStats _stats = const DashboardStats();
  List<ItemStockSummary> _recentStockIn = [];
  List<ItemStockSummary> _recentStockOut = [];
  List<Stock> _expiringItems = [];
  List<ItemStockSummary> _lowStockItems = [];
  List<StockMovement> _recentMovements = [];
  Map<String, dynamic>? _warehouseBreakdown;
  
  bool _isLoading = false;
  String? _errorMessage;
  DateTime? _lastRefresh;
  
  // Getters
  DashboardStats get stats => _stats;
  List<ItemStockSummary> get recentStockIn => _recentStockIn;
  List<ItemStockSummary> get recentStockOut => _recentStockOut;
  List<Stock> get expiringItems => _expiringItems;
  List<ItemStockSummary> get lowStockItems => _lowStockItems;
  List<StockMovement> get recentMovements => _recentMovements;
  Map<String, dynamic>? get warehouseBreakdown => _warehouseBreakdown;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  DateTime? get lastRefresh => _lastRefresh;
  
  /// Check if dashboard needs refresh (older than 5 minutes)
  bool get needsRefresh {
    if (_lastRefresh == null) return true;
    return DateTime.now().difference(_lastRefresh!).inMinutes > 5;
  }
  
  // =====================================================
  // LOAD DASHBOARD DATA
  // =====================================================
  
  /// Load all dashboard data
  Future<void> loadDashboard() async {
    _setLoading(true);
    
    // Load all data in parallel
    await Future.wait([
      _loadStats(),
      _loadAlerts(),
      _loadRecentMovements(),
      _loadWarehouseBreakdown(),
    ]);
    
    _lastRefresh = DateTime.now();
    _setLoading(false);
  }
  
  /// Refresh dashboard if stale
  Future<void> refreshIfNeeded() async {
    if (needsRefresh) {
      await loadDashboard();
    }
  }
  
  /// Force refresh dashboard
  Future<void> forceRefresh() async {
    await loadDashboard();
  }
  
  // =====================================================
  // PRIVATE LOADERS
  // =====================================================
  
  Future<void> _loadStats() async {
    try {
      int totalItems = 0;
      int totalWarehouses = 0;
      int totalLocations = 0;
      int totalStockRecords = 0;
      double totalStockValue = 0.0;
      int expiringCount = 0;
      int lowStockCount = 0;
      int outOfStockCount = 0;
      int todayMovements = 0;
      int pendingMovements = 0;
      
      // Item count
      final itemsResult = await _itemService.getTotalCount();
      if (itemsResult case Success(:final data)) {
        totalItems = data;
      }
      
      // Warehouse count
      final warehousesResult = await _warehouseService.getWarehouses();
      if (warehousesResult case Success(:final data)) {
        totalWarehouses = data.length;
        for (final wh in data) {
          final statsResult = await _warehouseService.getWarehouseStats(wh.id);
          if (statsResult case Success(:final data)) {
            totalLocations += (data['totalLocations'] as int?) ?? 0;
          }
        }
      }
      
      // Stock counts and alerts
      final expiringResult = await _stockService.getExpiringStock(30);
      if (expiringResult case Success(:final data)) {
        expiringCount = data.length;
      }
      
      final lowStockResult = await _stockService.getLowStockItems();
      if (lowStockResult case Success(:final data)) {
        lowStockCount = data.length;
      }
      
      final outOfStockResult = await _stockService.getOutOfStockItems();
      if (outOfStockResult case Success(:final data)) {
        outOfStockCount = data.length;
      }
      
      // Today's movements
      final now = DateTime.now();
      final todayStart = DateTime(now.year, now.month, now.day);
      final todayEnd = todayStart.add(const Duration(days: 1));
      
      final movementsResult = await _movementService.getMovements(
        startDate: todayStart,
        endDate: todayEnd,
      );
      if (movementsResult case Success(:final data)) {
        todayMovements = data.length;
        pendingMovements = data.where((m) => m.status == MovementStatus.pending).length;
      }
      
      _stats = DashboardStats(
        totalItems: totalItems,
        totalWarehouses: totalWarehouses,
        totalLocations: totalLocations,
        totalStockRecords: totalStockRecords,
        totalStockValue: totalStockValue,
        expiringItemsCount: expiringCount,
        lowStockCount: lowStockCount,
        outOfStockCount: outOfStockCount,
        todayMovements: todayMovements,
        pendingMovements: pendingMovements,
      );
    } catch (e) {
      _errorMessage = 'Failed to load stats: $e';
    }
  }
  
  Future<void> _loadAlerts() async {
    try {
      // Expiring items
      final expiringResult = await _stockService.getExpiringStock(30);
      if (expiringResult case Success(:final data)) {
        _expiringItems = data.take(10).toList(); // Top 10
      }
      
      // Low stock
      final lowStockResult = await _stockService.getLowStockItems();
      if (lowStockResult case Success(:final data)) {
        _lowStockItems = data.take(10).toList(); // Top 10
      }
    } catch (e) {
      _errorMessage = 'Failed to load alerts: $e';
    }
  }
  
  Future<void> _loadRecentMovements() async {
    try {
      // Recent movements (last 24 hours)
      final now = DateTime.now();
      final yesterday = now.subtract(const Duration(days: 1));
      
      final result = await _movementService.getMovements(
        startDate: yesterday,
        endDate: now,
        limit: 20,
      );
      
      if (result case Success(:final data)) {
        _recentMovements = data;
      }
    } catch (e) {
      _errorMessage = 'Failed to load recent movements: $e';
    }
  }
  
  Future<void> _loadWarehouseBreakdown() async {
    try {
      final warehousesResult = await _warehouseService.getWarehouses();
      if (warehousesResult case Success(:final data)) {
        final breakdown = <String, dynamic>{};
        
        for (final wh in data) {
          final stats = await _warehouseService.getWarehouseStats(wh.id);
          if (stats case Success(:final data)) {
            breakdown[wh.name] = data;
          }
        }
        
        _warehouseBreakdown = breakdown;
      }
    } catch (e) {
      _errorMessage = 'Failed to load warehouse breakdown: $e';
    }
  }
  
  // =====================================================
  // QUICK ACTIONS
  // =====================================================
  
  /// Get movement summary for date range
  Future<Map<MovementType, int>> getMovementSummary({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final start = startDate ?? DateTime.now().subtract(const Duration(days: 7));
    final end = endDate ?? DateTime.now();
    
    final result = await _movementService.getMovements(
      startDate: start,
      endDate: end,
    );
    
    if (result case Success(:final data)) {
      final summary = <MovementType, int>{};
      for (final movement in data) {
        summary[movement.movementType] = (summary[movement.movementType] ?? 0) + 1;
      }
      return summary;
    }
    
    return {};
  }
  
  /// Get stock value by warehouse
  Future<Map<String, double>> getStockValueByWarehouse() async {
    final values = <String, double>{};
    
    final warehousesResult = await _warehouseService.getWarehouses();
    if (warehousesResult case Success(:final data)) {
      for (final wh in data) {
        final stockResult = await _stockService.getStockByWarehouse(wh.id);
        if (stockResult case Success(:final data)) {
          double value = 0;
          for (final stock in data) {
            value += stock.value;
          }
          values[wh.name] = value;
        }
      }
    }
    
    return values;
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
  
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
