/// ============================================================
/// MOVEMENT SERVICE - Business logic for movement queries
/// ============================================================
/// 
/// Handles movement history queries and reporting.
/// Provides analytics and movement summaries.
/// 
/// Architecture: Service Layer
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/stock_movement.dart';
import '../repositories/movement_repository.dart';
import '../repositories/base_repository.dart';

/// Service for movement queries and reporting
class MovementService {
  final MovementRepository _movementRepo = MovementRepository();
  
  // =====================================================
  // MOVEMENT QUERIES
  // =====================================================
  
  /// Get movement by ID with full details
  Future<Result<MovementDetails?>> getMovementDetails(String movementId) async {
    return _movementRepo.getWithDetails(movementId);
  }
  
  /// Get recent movements
  Future<Result<List<MovementDetails>>> getRecentMovements({
    String? warehouseId,
    int limit = 20,
  }) async {
    return _movementRepo.getRecentWithDetails(
      warehouseId: warehouseId,
      limit: limit,
    );
  }
  
  /// Get movements for item
  Future<Result<List<StockMovement>>> getItemMovements(
    String itemId, {
    DateTime? startDate,
    DateTime? endDate,
    MovementType? type,
    PageRequest? page,
  }) async {
    return _movementRepo.getForItem(
      itemId,
      startDate: startDate,
      endDate: endDate,
      type: type,
      page: page,
    );
  }
  
  /// Get movements at location
  Future<Result<List<StockMovement>>> getLocationMovements(
    String locationId, {
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    return _movementRepo.getForLocation(
      locationId,
      startDate: startDate,
      endDate: endDate,
      page: page,
    );
  }
  
  /// Get movements in warehouse
  Future<Result<List<StockMovement>>> getWarehouseMovements(
    String warehouseId, {
    DateTime? startDate,
    DateTime? endDate,
    MovementType? type,
    PageRequest? page,
  }) async {
    return _movementRepo.getForWarehouse(
      warehouseId,
      startDate: startDate,
      endDate: endDate,
      type: type,
      page: page,
    );
  }
  
  /// Get movements by type
  Future<Result<List<StockMovement>>> getMovementsByType(
    MovementType type, {
    String? warehouseId,
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    return switch (type) {
      MovementType.stockIn => _movementRepo.getStockIns(
          warehouseId: warehouseId,
          startDate: startDate,
          endDate: endDate,
          page: page,
        ),
      MovementType.stockOut => _movementRepo.getStockOuts(
          warehouseId: warehouseId,
          startDate: startDate,
          endDate: endDate,
          page: page,
        ),
      MovementType.transfer => _movementRepo.getTransfers(
          warehouseId: warehouseId,
          startDate: startDate,
          endDate: endDate,
          page: page,
        ),
      MovementType.cycleCount => _movementRepo.getCycleCounts(
          warehouseId: warehouseId,
          startDate: startDate,
          endDate: endDate,
          page: page,
        ),
      _ => _movementRepo.getAdjustments(
          warehouseId: warehouseId,
          startDate: startDate,
          endDate: endDate,
          page: page,
        ),
    };
  }
  
  /// Get user activity
  Future<Result<List<StockMovement>>> getUserActivity(
    String userId, {
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    return _movementRepo.getByUser(
      userId,
      startDate: startDate,
      endDate: endDate,
      page: page,
    );
  }
  
  /// Get batch history
  Future<Result<List<StockMovement>>> getBatchHistory(
    String itemId,
    String batchNumber, {
    PageRequest? page,
  }) async {
    return _movementRepo.getForBatch(
      itemId,
      batchNumber,
      page: page,
    );
  }
  
  /// Get pending movements
  Future<Result<List<StockMovement>>> getPendingMovements({
    String? warehouseId,
    MovementType? type,
  }) async {
    return _movementRepo.getPending(
      warehouseId: warehouseId,
      type: type,
    );
  }
  
  // =====================================================
  // ANALYTICS & REPORTS
  // =====================================================
  
  /// Get movement summary by type
  Future<Result<Map<MovementType, int>>> getMovementSummary({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    return _movementRepo.getSummaryByType(
      startDate: startDate,
      endDate: endDate,
      warehouseId: warehouseId,
    );
  }
  
  /// Get total quantities moved by type
  Future<Result<Map<MovementType, double>>> getQuantitiesSummary({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    return _movementRepo.getQuantitiesByType(
      startDate: startDate,
      endDate: endDate,
      warehouseId: warehouseId,
    );
  }
  
  /// Get daily movement trends
  Future<Result<List<Map<String, dynamic>>>> getDailyTrends({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
    MovementType? type,
  }) async {
    return _movementRepo.getDailyMovements(
      startDate: startDate,
      endDate: endDate,
      warehouseId: warehouseId,
      type: type,
    );
  }
  
  /// Get most moved items
  Future<Result<List<Map<String, dynamic>>>> getTopMovedItems({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
    int limit = 10,
  }) async {
    return _movementRepo.getTopMovedItems(
      startDate: startDate,
      endDate: endDate,
      warehouseId: warehouseId,
      limit: limit,
    );
  }
  
  /// Calculate stock in vs stock out for period
  Future<Result<Map<String, double>>> getInOutBalance({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    final quantitiesResult = await getQuantitiesSummary(
      startDate: startDate,
      endDate: endDate,
      warehouseId: warehouseId,
    );
    
    if (quantitiesResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final quantities = (quantitiesResult as Success).data;
    
    final stockIn = quantities[MovementType.stockIn] ?? 0;
    final stockOut = quantities[MovementType.stockOut] ?? 0;
    final transfers = quantities[MovementType.transfer] ?? 0;
    final adjustments = quantities[MovementType.adjustment] ?? 0;
    
    return Result.success({
      'stockIn': stockIn,
      'stockOut': stockOut,
      'transfers': transfers,
      'adjustments': adjustments,
      'netChange': stockIn - stockOut + adjustments,
    });
  }
  
  // =====================================================
  // REPORTING HELPERS
  // =====================================================
  
  /// Get movement report for date range
  Future<Result<MovementReport>> generateMovementReport({
    required DateTime startDate,
    required DateTime endDate,
    String? warehouseId,
  }) async {
    try {
      // Get summary by type
      final summaryResult = await getMovementSummary(
        startDate: startDate,
        endDate: endDate,
        warehouseId: warehouseId,
      );
      
      // Get quantities by type
      final quantitiesResult = await getQuantitiesSummary(
        startDate: startDate,
        endDate: endDate,
        warehouseId: warehouseId,
      );
      
      // Get daily trends
      final trendsResult = await getDailyTrends(
        startDate: startDate,
        endDate: endDate,
        warehouseId: warehouseId,
      );
      
      // Get top items
      final topItemsResult = await getTopMovedItems(
        startDate: startDate,
        endDate: endDate,
        warehouseId: warehouseId,
      );
      
      if (summaryResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      if (quantitiesResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      if (trendsResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      if (topItemsResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      
      return Result.success(MovementReport(
        startDate: startDate,
        endDate: endDate,
        warehouseId: warehouseId,
        countByType: (summaryResult as Success).data,
        quantityByType: (quantitiesResult as Success).data,
        dailyTrends: (trendsResult as Success).data,
        topItems: (topItemsResult as Success).data,
        generatedAt: DateTime.now(),
      ));
    } catch (e) {
      return Result.failure(Failure.business('Failed to generate report: $e'));
    }
  }
}

/// Movement report data class
class MovementReport {
  final DateTime startDate;
  final DateTime endDate;
  final String? warehouseId;
  final Map<MovementType, int> countByType;
  final Map<MovementType, double> quantityByType;
  final List<Map<String, dynamic>> dailyTrends;
  final List<Map<String, dynamic>> topItems;
  final DateTime generatedAt;
  
  const MovementReport({
    required this.startDate,
    required this.endDate,
    required this.warehouseId,
    required this.countByType,
    required this.quantityByType,
    required this.dailyTrends,
    required this.topItems,
    required this.generatedAt,
  });
  
  int get totalMovements => countByType.values.fold(0, (sum, v) => sum + v);
  
  double get totalQuantityIn => quantityByType[MovementType.stockIn] ?? 0;
  double get totalQuantityOut => quantityByType[MovementType.stockOut] ?? 0;
  double get netChange => totalQuantityIn - totalQuantityOut;
}
