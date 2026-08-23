import 'package:flutter/material.dart';
import '../models/stock_adjustment.dart';
import '../models/batch_info.dart';
import '../services/adjustment_service.dart';
import '../services/unified_database_manager.dart';
import 'package:uuid/uuid.dart';

class AdjustmentProvider extends ChangeNotifier {
  AdjustmentService? _adjustmentService;
  BatchService? _batchService;

  List<StockAdjustment> _adjustments = [];
  List<StockAdjustment> _filteredAdjustments = [];
  List<BatchInfo> _batches = [];
  List<BatchInfo> _expiredBatches = [];
  List<BatchInfo> _nearingExpiryBatches = [];

  bool _isLoading = false;
  String? _error;

  // Getters
  List<StockAdjustment> get adjustments => _adjustments;
  List<StockAdjustment> get filteredAdjustments => _filteredAdjustments;
  List<BatchInfo> get batches => _batches;
  List<BatchInfo> get expiredBatches => _expiredBatches;
  List<BatchInfo> get nearingExpiryBatches => _nearingExpiryBatches;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void setAdjustmentService(AdjustmentService service) {
    _adjustmentService = service;
  }

  void setBatchService(BatchService service) {
    _batchService = service;
  }

  Future<void> _ensureServicesInitialized() async {
    if (_adjustmentService != null && _batchService != null) return;
    final db = await DatabaseManager.instance.database;
    _adjustmentService ??= AdjustmentService(db);
    _batchService ??= BatchService(db);
  }

  /// Load all adjustments
  Future<void> loadAdjustments({int limit = 100, int offset = 0}) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _adjustments = await _adjustmentService!.getAllAdjustments(
        limit: limit,
        offset: offset,
      );
      _filteredAdjustments = _adjustments;
      _error = null;
    } catch (e) {
      _error = 'Failed to load adjustments: $e';
      _adjustments = [];
      _filteredAdjustments = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load adjustments by status
  Future<void> loadAdjustmentsByStatus(
    AdjustmentStatus status, {
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _filteredAdjustments = await _adjustmentService!.getAdjustmentsByStatus(
        status,
        limit: limit,
        offset: offset,
      );
      _error = null;
    } catch (e) {
      _error = 'Failed to load adjustments: $e';
      _filteredAdjustments = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load adjustments by item
  Future<void> loadAdjustmentsByItem(String itemId) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _filteredAdjustments = await _adjustmentService!.getAdjustmentsByItem(itemId);
      _error = null;
    } catch (e) {
      _error = 'Failed to load item adjustments: $e';
      _filteredAdjustments = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load adjustments by warehouse
  Future<void> loadAdjustmentsByWarehouse(
    String warehouseId, {
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _filteredAdjustments = await _adjustmentService!.getAdjustmentsByWarehouse(
        warehouseId,
        limit: limit,
        offset: offset,
      );
      _error = null;
    } catch (e) {
      _error = 'Failed to load warehouse adjustments: $e';
      _filteredAdjustments = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Create new adjustment
  Future<String?> createAdjustment({
    required String itemId,
    required String itemName,
    required String itemSku,
    required String warehouseId,
    required String warehouseName,
    String? cellId,
    String? cellName,
    String? batchNumber,
    DateTime? expiryDate,
    required double quantityBefore,
    required double quantityAdjusted,
    required AdjustmentType adjustmentType,
    required String reason,
    String? referenceDocument,
    String? notes,
    required String createdBy,
  }) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      final adjustment = StockAdjustment(
        id: const Uuid().v4(),
        itemId: itemId,
        itemName: itemName,
        itemSku: itemSku,
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        cellId: cellId,
        cellName: cellName,
        batchNumber: batchNumber,
        expiryDate: expiryDate,
        quantityBefore: quantityBefore,
        quantityAdjusted: quantityAdjusted,
        quantityAfter: quantityBefore + quantityAdjusted,
        adjustmentType: adjustmentType,
        status: AdjustmentStatus.pending,
        reason: reason,
        referenceDocument: referenceDocument,
        notes: notes,
        createdBy: createdBy,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final id = await _adjustmentService!.createAdjustment(adjustment);
      _adjustments.insert(0, adjustment);
      _filteredAdjustments = _adjustments;
      _error = null;

      return id;
    } catch (e) {
      _error = 'Failed to create adjustment: $e';
      return null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Approve adjustment and apply stock changes
  Future<bool> approveAdjustment(String adjustmentId, String approvedBy) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      await _adjustmentService!.approveAdjustment(adjustmentId, approvedBy);

      final index = _adjustments.indexWhere((a) => a.id == adjustmentId);
      if (index != -1) {
        _adjustments[index] = _adjustments[index].copyWith(
          status: AdjustmentStatus.approved,
          approvedBy: approvedBy,
          approvedAt: DateTime.now(),
        );
        _filteredAdjustments = _adjustments;
      }

      _error = null;
      return true;
    } catch (e) {
      _error = 'Failed to approve adjustment: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<double> getStockQuantity(
    String itemId,
    String warehouseId, {
    String? cellId,
  }) async {
    await _ensureServicesInitialized();
    if (cellId != null) {
      return _adjustmentService!.getStockQuantity(itemId, warehouseId, cellId: cellId);
    }
    return _adjustmentService!.getWarehouseStockQuantity(itemId, warehouseId);
  }

  Future<List<Map<String, dynamic>>> getCellsForWarehouse(String warehouseId) async {
    await _ensureServicesInitialized();
    return _adjustmentService!.getCellsForWarehouse(warehouseId);
  }

  Future<List<Map<String, dynamic>>> getCellStockRows(String warehouseId, {String? cellId}) async {
    await _ensureServicesInitialized();
    return _adjustmentService!.getCellStockRows(warehouseId, cellId: cellId);
  }

  Future<String?> correctCellStock({
    required String itemId,
    required String itemName,
    required String itemSku,
    required String warehouseId,
    required String warehouseName,
    required String cellId,
    required String cellName,
    required double targetQuantity,
    required String reason,
    required String createdBy,
    String? notes,
  }) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      final id = await _adjustmentService!.correctCellStock(
        itemId: itemId,
        itemName: itemName,
        itemSku: itemSku,
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        cellId: cellId,
        cellName: cellName,
        targetQuantity: targetQuantity,
        reason: reason,
        createdBy: createdBy,
        notes: notes,
      );

      await loadAdjustments();
      return id;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      return null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadAllBatches() async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();
      _batches = await _batchService!.getAllBatches();
    } catch (e) {
      _error = 'Failed to load batches: $e';
      _batches = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Reject adjustment
  Future<bool> rejectAdjustment(String adjustmentId) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      await _adjustmentService!.rejectAdjustment(adjustmentId);

      // Update local list
      final index = _adjustments.indexWhere((a) => a.id == adjustmentId);
      if (index != -1) {
        _adjustments[index] =
            _adjustments[index].copyWith(status: AdjustmentStatus.rejected);
        _filteredAdjustments = _adjustments;
      }

      _error = null;
      return true;
    } catch (e) {
      _error = 'Failed to reject adjustment: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load batches for item
  Future<void> loadBatchesForItem(String itemId) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _batches = await _batchService!.getBatchesByItem(itemId);
      _error = null;
    } catch (e) {
      _error = 'Failed to load batches: $e';
      _batches = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load batches for warehouse
  Future<void> loadBatchesForWarehouse(String warehouseId) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _batches = await _batchService!.getBatchesByWarehouse(warehouseId);
      _error = null;
    } catch (e) {
      _error = 'Failed to load warehouse batches: $e';
      _batches = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load expired batches
  Future<void> loadExpiredBatches({String? warehouseId}) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _expiredBatches = await _batchService!.getExpiredBatches(
        warehouseId: warehouseId,
      );
      _error = null;
    } catch (e) {
      _error = 'Failed to load expired batches: $e';
      _expiredBatches = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load batches nearing expiry
  Future<void> loadNearingExpiryBatches({String? warehouseId}) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      _nearingExpiryBatches = await _batchService!.getBatchesNearingExpiry(
        warehouseId: warehouseId,
      );
      _error = null;
    } catch (e) {
      _error = 'Failed to load nearing expiry batches: $e';
      _nearingExpiryBatches = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Create new batch
  Future<String?> createBatch({
    required String itemId,
    required String batchNumber,
    DateTime? manufacturingDate,
    DateTime? expiryDate,
    required double quantity,
    required double costPrice,
    required String warehouseId,
    String? cellId,
  }) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      final batch = BatchInfo(
        id: const Uuid().v4(),
        itemId: itemId,
        batchNumber: batchNumber,
        manufacturingDate: manufacturingDate,
        expiryDate: expiryDate,
        quantity: quantity,
        costPrice: costPrice,
        warehouseId: warehouseId,
        cellId: cellId,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final id = await _batchService!.createBatch(batch);
      _batches.add(batch);
      _error = null;

      return id;
    } catch (e) {
      _error = 'Failed to create batch: $e';
      return null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Update batch quantity
  Future<bool> updateBatchQuantity(String batchId, double newQuantity) async {
    try {
      await _ensureServicesInitialized();
      _isLoading = true;
      _error = null;
      notifyListeners();

      await _batchService!.updateBatchQuantity(batchId, newQuantity);

      // Update local list
      final index = _batches.indexWhere((b) => b.id == batchId);
      if (index != -1) {
        _batches[index] = _batches[index].copyWith(quantity: newQuantity);
      }

      _error = null;
      return true;
    } catch (e) {
      _error = 'Failed to update batch quantity: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Filter adjustments by type
  void filterByType(AdjustmentType type) {
    _filteredAdjustments = _adjustments
        .where((adj) => adj.adjustmentType == type)
        .toList();
    notifyListeners();
  }

  /// Filter adjustments by date range
  void filterByDateRange(DateTime startDate, DateTime endDate) {
    _filteredAdjustments = _adjustments
        .where((adj) =>
            adj.createdAt.isAfter(startDate) &&
            adj.createdAt.isBefore(endDate))
        .toList();
    notifyListeners();
  }

  /// Clear filters
  void clearFilters() {
    _filteredAdjustments = _adjustments;
    notifyListeners();
  }

  /// Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }
}
