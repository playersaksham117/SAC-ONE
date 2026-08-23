/// ============================================================
/// STOCK PROVIDER - State management for stock operations
/// ============================================================
/// 
/// Manages stock levels, movements, and operations.
/// Wraps StockService for UI consumption.
/// 
/// Architecture: Provider Layer (State Management)
/// ============================================================

import 'package:flutter/foundation.dart';

import '../../core/types/result.dart';
import '../../domain/entities/stock.dart';
import '../../domain/entities/stock_movement.dart';
import '../../data/services/stock_service.dart';
import '../../data/services/movement_service.dart';

/// Provider for stock operations and state management
class StockProvider extends ChangeNotifier {
  final StockService _stockService = StockService();
  final MovementService _movementService = MovementService();
  
  // State
  List<Stock> _stockAtLocation = [];
  List<Stock> _itemStock = [];
  List<Stock> _expiringStock = [];
  List<Stock> _expiredStock = [];
  List<Map<String, dynamic>> _lowStockItems = [];
  List<Map<String, dynamic>> _outOfStockItems = [];
  List<MovementDetails> _recentMovements = [];
  ItemStockSummary? _itemSummary;
  
  bool _isLoading = false;
  String? _errorMessage;
  String? _successMessage;
  String? _selectedWarehouseId;
  
  // Getters
  List<Stock> get stockAtLocation => _stockAtLocation;
  List<Stock> get itemStock => _itemStock;
  List<Stock> get expiringStock => _expiringStock;
  List<Stock> get expiredStock => _expiredStock;
  List<Map<String, dynamic>> get lowStockItems => _lowStockItems;
  List<Map<String, dynamic>> get outOfStockItems => _outOfStockItems;
  List<MovementDetails> get recentMovements => _recentMovements;
  ItemStockSummary? get itemSummary => _itemSummary;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get successMessage => _successMessage;
  String? get selectedWarehouseId => _selectedWarehouseId;
  
  // =====================================================
  // WAREHOUSE SELECTION
  // =====================================================
  
  /// Set current warehouse context
  void setWarehouse(String? warehouseId) {
    _selectedWarehouseId = warehouseId;
    notifyListeners();
  }
  
  // =====================================================
  // DATA LOADING
  // =====================================================
  
  /// Load stock at a location
  Future<void> loadLocationStock(String locationId) async {
    _setLoading(true);
    
    final result = await _stockService.getLocationStock(locationId);
    
    switch (result) {
      case Success(:final data):
        _stockAtLocation = data.map((ls) => Stock(
          id: ls.stockId,
          itemId: ls.itemId,
          locationId: ls.locationId,
          warehouseId: '', // Not included in LocationStock
          quantity: ls.quantity,
          reservedQuantity: ls.reservedQuantity,
          batchNumber: ls.batchNumber,
          expiryDate: ls.expiryDate,
          serialNumber: ls.serialNumber,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        )).toList();
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load stock for an item
  Future<void> loadItemStock(String itemId, {String? warehouseId}) async {
    _setLoading(true);
    
    // Get stock summary
    final summaryResult = await _stockService.getItemStockSummary(itemId);
    if (summaryResult case Success(:final data)) {
      _itemSummary = data;
    }
    
    // Get detailed stock
    // Note: StockService doesn't expose getStockForItem directly,
    // we need to add that or use repository directly
    // For now, summary is sufficient
    
    _setLoading(false);
  }
  
  /// Load expiring stock
  Future<void> loadExpiringStock({int days = 30}) async {
    _setLoading(true);
    
    final result = await _stockService.getExpiringStock(
      days: days,
      warehouseId: _selectedWarehouseId,
    );
    
    switch (result) {
      case Success(:final data):
        _expiringStock = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load expired stock
  Future<void> loadExpiredStock() async {
    _setLoading(true);
    
    final result = await _stockService.getExpiredStock(
      warehouseId: _selectedWarehouseId,
    );
    
    switch (result) {
      case Success(:final data):
        _expiredStock = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load low stock alerts
  Future<void> loadLowStockItems() async {
    _setLoading(true);
    
    final result = await _stockService.getLowStockItems(
      warehouseId: _selectedWarehouseId,
    );
    
    switch (result) {
      case Success(:final data):
        _lowStockItems = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load out of stock items
  Future<void> loadOutOfStockItems() async {
    _setLoading(true);
    
    final result = await _stockService.getOutOfStockItems();
    
    switch (result) {
      case Success(:final data):
        _outOfStockItems = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load recent movements
  Future<void> loadRecentMovements({int limit = 20}) async {
    _setLoading(true);
    
    final result = await _movementService.getRecentMovements(
      warehouseId: _selectedWarehouseId,
      limit: limit,
    );
    
    switch (result) {
      case Success(:final data):
        _recentMovements = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load all alerts (expiring, low stock, out of stock)
  Future<void> loadAlerts() async {
    await Future.wait([
      loadExpiringStock(),
      loadLowStockItems(),
      loadOutOfStockItems(),
    ]);
  }
  
  // =====================================================
  // STOCK IN OPERATIONS
  // =====================================================
  
  /// Receive stock
  Future<Result<StockMovement>> stockIn({
    required String itemId,
    required String locationId,
    required String warehouseId,
    required double quantity,
    required String performedBy,
    String? batchNumber,
    DateTime? expiryDate,
    double? unitCost,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.stockIn(
      itemId: itemId,
      locationId: locationId,
      warehouseId: warehouseId,
      quantity: quantity,
      performedBy: performedBy,
      batchNumber: batchNumber,
      expiryDate: expiryDate,
      unitCost: unitCost,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Stock received: ${data.referenceNumber}';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Bulk stock in
  Future<Result<List<StockMovement>>> bulkStockIn({
    required List<StockInItem> items,
    required String warehouseId,
    required String locationId,
    required String performedBy,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.bulkStockIn(
      items: items,
      warehouseId: warehouseId,
      locationId: locationId,
      performedBy: performedBy,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Received ${data.length} items';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // STOCK OUT OPERATIONS
  // =====================================================
  
  /// Issue stock (FEFO)
  Future<Result<List<StockMovement>>> stockOut({
    required String itemId,
    required double quantity,
    required String performedBy,
    MovementReason reason = MovementReason.sale,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.stockOut(
      itemId: itemId,
      quantity: quantity,
      performedBy: performedBy,
      warehouseId: _selectedWarehouseId,
      reason: reason,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Stock issued: ${data.length} movement(s)';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Issue stock from specific location
  Future<Result<StockMovement>> stockOutFromLocation({
    required String stockId,
    required double quantity,
    required String performedBy,
    MovementReason reason = MovementReason.sale,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.stockOutFromLocation(
      stockId: stockId,
      quantity: quantity,
      performedBy: performedBy,
      reason: reason,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Stock issued: ${data.referenceNumber}';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // TRANSFER OPERATIONS
  // =====================================================
  
  /// Transfer stock
  Future<Result<StockMovement>> transfer({
    required String stockId,
    required String toLocationId,
    required String toWarehouseId,
    required double quantity,
    required String performedBy,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.transfer(
      stockId: stockId,
      toLocationId: toLocationId,
      toWarehouseId: toWarehouseId,
      quantity: quantity,
      performedBy: performedBy,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Transfer complete: ${data.referenceNumber}';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Bulk transfer (all stock from one location to another)
  Future<Result<List<StockMovement>>> bulkTransfer({
    required String fromLocationId,
    required String toLocationId,
    required String toWarehouseId,
    required String performedBy,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.bulkTransfer(
      fromLocationId: fromLocationId,
      toLocationId: toLocationId,
      toWarehouseId: toWarehouseId,
      performedBy: performedBy,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Bulk transfer complete: ${data.length} items moved';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // ADJUSTMENT OPERATIONS
  // =====================================================
  
  /// Adjust stock
  Future<Result<StockMovement>> adjust({
    required String stockId,
    required double newQuantity,
    required String performedBy,
    required MovementReason reason,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.adjust(
      stockId: stockId,
      newQuantity: newQuantity,
      performedBy: performedBy,
      reason: reason,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Adjustment recorded: ${data.referenceNumber}';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // CYCLE COUNT OPERATIONS
  // =====================================================
  
  /// Record cycle count
  Future<Result<StockMovement>> cycleCount({
    required String stockId,
    required double countedQuantity,
    required String performedBy,
    String? notes,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _stockService.cycleCount(
      stockId: stockId,
      countedQuantity: countedQuantity,
      performedBy: performedBy,
      notes: notes,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Cycle count recorded: ${data.referenceNumber}';
        await loadRecentMovements();
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // MOVEMENT QUERIES
  // =====================================================
  
  /// Get item movements
  Future<List<StockMovement>> getItemMovements(
    String itemId, {
    DateTime? startDate,
    DateTime? endDate,
    MovementType? type,
  }) async {
    final result = await _movementService.getItemMovements(
      itemId,
      startDate: startDate,
      endDate: endDate,
      type: type,
    );
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  /// Get movement details
  Future<MovementDetails?> getMovementDetails(String movementId) async {
    final result = await _movementService.getMovementDetails(movementId);
    return switch (result) {
      Success(:final data) => data,
      Failed() => null,
    };
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
  
  void _clearMessages() {
    _errorMessage = null;
    _successMessage = null;
  }
  
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
  
  void clearSuccess() {
    _successMessage = null;
    notifyListeners();
  }
  
  void clearMessages() {
    _errorMessage = null;
    _successMessage = null;
    notifyListeners();
  }
}
