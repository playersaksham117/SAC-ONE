/// ============================================================
/// STOCK SERVICE - Business logic for stock operations
/// ============================================================
/// 
/// Handles all stock movements with atomic transactions.
/// Implements FEFO (First Expiry First Out) for deduction.
/// Creates audit trail for all operations.
/// 
/// Architecture: Service Layer
/// ============================================================

import '../../core/constants/app_constants.dart';
import '../../core/types/result.dart';
import '../../domain/entities/stock.dart';
import '../../domain/entities/stock_movement.dart';
import '../repositories/stock_repository.dart';
import '../repositories/movement_repository.dart';
import '../repositories/item_repository.dart';
import '../repositories/location_repository.dart';
import '../database/database_connection.dart';

/// Service for managing stock operations
class StockService {
  final StockRepository _stockRepo = StockRepository();
  final MovementRepository _movementRepo = MovementRepository();
  final ItemRepository _itemRepo = ItemRepository();
  final LocationRepository _locationRepo = LocationRepository();
  final DatabaseConnection _db = DatabaseConnection.instance;
  
  // =====================================================
  // STOCK IN OPERATIONS
  // =====================================================
  
  /// Receive stock into a location
  Future<Result<StockMovement>> stockIn({
    required String itemId,
    required String locationId,
    required String warehouseId,
    required double quantity,
    required String performedBy,
    String? batchNumber,
    DateTime? expiryDate,
    String? serialNumber,
    double? unitCost,
    String? referenceNumber,
    String? notes,
  }) async {
    // Validate inputs
    final validationResult = await _validateStockIn(
      itemId: itemId,
      locationId: locationId,
      quantity: quantity,
      batchNumber: batchNumber,
      expiryDate: expiryDate,
    );
    
    if (validationResult != null) {
      return Result.failure(validationResult);
    }
    
    // Generate reference if not provided
    final ref = (referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.stockIn))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'SI-${DateTime.now().millisecondsSinceEpoch}'))!;
    
    try {
      // Use transaction to ensure atomicity
      final createdMovement = await _db.transaction<StockMovement>((txn) async {
        // Check if stock entry exists for this item+location+batch
        final existingResult = await _stockRepo.getStockAtLocation(
          itemId,
          locationId,
          batchNumber: batchNumber,
        );
        
        Stock stock;
        
        if (existingResult case Success(:final data) when data != null) {
          // Update existing stock
          stock = data;
          await _stockRepo.incrementQuantity(stock.id, quantity);
          stock = stock.copyWith(
            quantity: stock.quantity + quantity,
            updatedAt: DateTime.now(),
          );
        } else {
          // Create new stock entry
          stock = Stock(
            id: _generateId(),
            itemId: itemId,
            locationId: locationId,
            locationType: 'bin',
            warehouseId: warehouseId,
            quantity: quantity,
            reservedQuantity: 0,
            batchNumber: batchNumber,
            expiryDate: expiryDate,
            serialNumber: serialNumber,
            lotCostPrice: unitCost,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          await _stockRepo.insert(stock);
        }
        
        // Create movement record
        final movement = StockMovement(
          id: _generateId(),
          referenceNo: ref,
          itemId: itemId,
          movementType: MovementType.stockIn,
          quantity: quantity,
          destinationLocationId: locationId,
          destinationWarehouseId: warehouseId,
          batchNumber: batchNumber,
          expiryDate: expiryDate,
          serialNumber: serialNumber,
          unitCost: unitCost,
          status: MovementStatus.completed,
          createdBy: performedBy,
          notes: notes,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        
        await _movementRepo.insert(movement);
        
        return movement;
      });
      return Result.success(createdMovement);
    } catch (e) {
      return Result.failure(Failure.database(
        'Stock in failed: $e',
        error: e,
      ));
    }
  }
  
  /// Bulk stock in (multiple items at once)
  Future<Result<List<StockMovement>>> bulkStockIn({
    required List<StockInItem> items,
    required String warehouseId,
    required String locationId,
    required String performedBy,
    String? groupReference,
    String? notes,
  }) async {
    final movements = <StockMovement>[];
    final errors = <String>[];
    
    for (int i = 0; i < items.length; i++) {
      final item = items[i];
      final result = await stockIn(
        itemId: item.itemId,
        locationId: locationId,
        warehouseId: warehouseId,
        quantity: item.quantity,
        performedBy: performedBy,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        unitCost: item.unitCost,
        referenceNumber: groupReference,
        notes: notes,
      );
      
      switch (result) {
        case Success(:final data):
          movements.add(data);
        case Failed(:final failure):
          errors.add('Item ${i + 1}: ${failure.message}');
      }
    }
    
    if (movements.isEmpty && errors.isNotEmpty) {
      return Result.failure(Failure.business(errors.join('\n')));
    }
    
    return Result.success(movements);
  }
  
  // =====================================================
  // STOCK OUT OPERATIONS (FEFO)
  // =====================================================
  
  /// Issue stock from location(s) using FEFO
  Future<Result<List<StockMovement>>> stockOut({
    required String itemId,
    required double quantity,
    required String performedBy,
    String? warehouseId,
    String? preferredLocationId,
    MovementReason reason = MovementReason.sale,
    String? referenceNumber,
    String? notes,
  }) async {
    // Validate item exists
    final itemResult = await _itemRepo.getById(itemId);
    if (itemResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    if ((itemResult as Success).data == null) {
      return Result.failure(Failure.notFound('Item', itemId));
    }
    
    // Get available stock in FEFO order
    final stockResult = await _stockRepo.getStockFEFO(
      itemId,
      warehouseId: warehouseId,
    );
    
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final availableStock = (stockResult as Success).data;
    final totalAvailable = availableStock.fold<double>(
      0, 
      (sum, s) => sum + s.availableQuantity,
    );
    
    if (totalAvailable < quantity) {
      return Result.failure(Failure.business(
        'Insufficient stock. Available: $totalAvailable, Requested: $quantity',
      ));
    }
    
    // Generate reference
    final ref = (referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.stockOut))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'SO-${DateTime.now().millisecondsSinceEpoch}'))!;
    
    try {
      final createdMovements = await _db.transaction<List<StockMovement>>((txn) async {
        final movements = <StockMovement>[];
        var remainingQty = quantity;
        
        // Sort by preferred location first if specified
        if (preferredLocationId != null) {
          availableStock.sort((a, b) {
            if (a.locationId == preferredLocationId) return -1;
            if (b.locationId == preferredLocationId) return 1;
            // Then by expiry (FEFO)
            if (a.expiryDate == null && b.expiryDate == null) return 0;
            if (a.expiryDate == null) return 1;
            if (b.expiryDate == null) return -1;
            return a.expiryDate!.compareTo(b.expiryDate!);
          });
        }
        
        for (final stock in availableStock) {
          if (remainingQty <= 0) break;
          
          final deductQty = remainingQty > stock.availableQuantity
              ? stock.availableQuantity
              : remainingQty;
          
          // Deduct from stock
          await _stockRepo.decrementQuantity(stock.id, deductQty);
          
          // Create movement
          final movement = StockMovement(
            id: _generateId(),
            referenceNo: ref,
            itemId: itemId,
            movementType: MovementType.stockOut,
            quantity: deductQty,
            sourceLocationId: stock.locationId,
            sourceWarehouseId: stock.warehouseId,
            batchNumber: stock.batchNumber,
            expiryDate: stock.expiryDate,
            serialNumber: stock.serialNumber,
            reason: reason,
            status: MovementStatus.completed,
            createdBy: performedBy,
            notes: notes,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          
          await _movementRepo.insert(movement);
          movements.add(movement);
          
          remainingQty -= deductQty;
        }
        
        return movements;
      });
      return Result.success(createdMovements);
    } catch (e) {
      return Result.failure(Failure.database(
        'Stock out failed: $e',
      ));
    }
  }
  
  /// Issue stock from specific location (non-FEFO)
  Future<Result<StockMovement>> stockOutFromLocation({
    required String stockId,
    required double quantity,
    required String performedBy,
    MovementReason reason = MovementReason.sale,
    String? referenceNumber,
    String? notes,
  }) async {
    // Get the specific stock entry
    final stockResult = await _stockRepo.getById(stockId);
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final stock = (stockResult as Success).data;
    if (stock == null) {
      return Result.failure(Failure.notFound('Stock entry not found'));
    }
    
    if (quantity > stock.availableQuantity) {
      return Result.failure(Failure.business(
        'Insufficient stock. Available: ${stock.availableQuantity}, Requested: $quantity',
      ));
    }
    
    final ref = referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.stockOut))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'SO-${DateTime.now().millisecondsSinceEpoch}');
    
    try {
      final createdMovements = await _db.transaction<List<StockMovement>>((txn) async {
        await _stockRepo.decrementQuantity(stockId, quantity);
        
        final movement = StockMovement(
          id: _generateId(),
          referenceNo: ref,
          itemId: stock.itemId,
          movementType: MovementType.stockOut,
          quantity: quantity,
          sourceLocationId: stock.locationId,
          sourceWarehouseId: stock.warehouseId,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
          reason: reason,
          status: MovementStatus.completed,
          createdBy: performedBy,
          notes: notes,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        
        await _movementRepo.insert(movement);
        return movement;
      });
    } catch (e) {
      return Result.failure(Failure.database(
        'Stock out failed: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // TRANSFER OPERATIONS
  // =====================================================
  
  /// Transfer stock between locations
  Future<Result<StockMovement>> transfer({
    required String stockId,
    required String toLocationId,
    required String toWarehouseId,
    required double quantity,
    required String performedBy,
    String? referenceNumber,
    String? notes,
  }) async {
    // Get source stock
    final stockResult = await _stockRepo.getById(stockId);
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final sourceStock = (stockResult as Success).data;
    if (sourceStock == null) {
      return Result.failure(Failure.notFound('Stock', stockId));
    }
    
    if (quantity > sourceStock.availableQuantity) {
      return Result.failure(Failure.business(
        'Insufficient stock for transfer. Available: ${sourceStock.availableQuantity}',
      ));
    }
    
    // Validate destination location
    final destLocResult = await _locationRepo.getById(toLocationId);
    if (destLocResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    if ((destLocResult as Success).data == null) {
      return Result.failure(Failure.notFound('Location', toLocationId));
    }
    
    // Same location check
    if (sourceStock.locationId == toLocationId) {
      return Result.failure(Failure.validation(
        'Source and destination locations are the same',
      ));
    }
    
    // Generate reference
    final ref = (referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.transfer))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'TR-${DateTime.now().millisecondsSinceEpoch}'))!;
    
    try {
      return await _db.transaction<StockMovement>((txn) async {
        // Deduct from source
        await _stockRepo.decrementQuantity(stockId, quantity);
        
        // Check if destination has same item+batch
        final destStockResult = await _stockRepo.getStockAtLocation(
          sourceStock.itemId,
          toLocationId,
          batchNumber: sourceStock.batchNumber,
        );
        
        if (destStockResult case Success(:final data) when data != null) {
          // Add to existing
          await _stockRepo.incrementQuantity(data.id, quantity);
        } else {
          // Create new stock at destination
          final newStock = Stock(
            id: _generateId(),
            itemId: sourceStock.itemId,
            locationId: toLocationId,
            locationType: 'bin',
            warehouseId: toWarehouseId,
            quantity: quantity,
            reservedQuantity: 0,
            batchNumber: sourceStock.batchNumber,
            expiryDate: sourceStock.expiryDate,
            serialNumber: quantity == sourceStock.quantity ? sourceStock.serialNumber : null,
            lotCostPrice: sourceStock.lotCostPrice,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          await _stockRepo.insert(newStock);
        }
        
        // Create movement record
        final movement = StockMovement(
          id: _generateId(),
          referenceNo: ref,
          itemId: sourceStock.itemId,
          movementType: MovementType.transfer,
          quantity: quantity,
          sourceLocationId: sourceStock.locationId,
          sourceWarehouseId: sourceStock.warehouseId,
          destinationLocationId: toLocationId,
          destinationWarehouseId: toWarehouseId,
          batchNumber: sourceStock.batchNumber,
          expiryDate: sourceStock.expiryDate,
          status: MovementStatus.completed,
          createdBy: performedBy,
          notes: notes,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        
        await _movementRepo.insert(movement);
        return movement;
      });
    } catch (e) {
      return Result.failure(Failure.database(
        'Transfer failed: $e',
        error: e,
      ));
    }
  }
  
  /// Bulk transfer (move all stock from one location to another)
  Future<Result<List<StockMovement>>> bulkTransfer({
    required String fromLocationId,
    required String toLocationId,
    required String toWarehouseId,
    required String performedBy,
    String? groupReference,
    String? notes,
  }) async {
    // Get all stock at source location
    final stockResult = await _stockRepo.getStockAtLocation_All(fromLocationId);
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final stocks = (stockResult as Success).data;
    if (stocks.isEmpty) {
      return Result.failure(Failure.business('No stock at source location'));
    }
    
    final movements = <StockMovement>[];
    
    for (final stock in stocks) {
      final result = await transfer(
        stockId: stock.id,
        toLocationId: toLocationId,
        toWarehouseId: toWarehouseId,
        quantity: stock.quantity,
        performedBy: performedBy,
        referenceNumber: groupReference,
        notes: notes,
      );
      
      if (result case Success(:final data)) {
        movements.add(data);
      }
    }
    
    return Result.success(movements);
  }
  
  // =====================================================
  // ADJUSTMENT OPERATIONS
  // =====================================================
  
  /// Adjust stock quantity (for discrepancies)
  Future<Result<StockMovement>> adjust({
    required String stockId,
    required double newQuantity,
    required String performedBy,
    required MovementReason reason,
    String? referenceNumber,
    String? notes,
  }) async {
    final stockResult = await _stockRepo.getById(stockId);
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    if (stock == null) {
      return Result.failure(Failure.notFound('Stock', stockId));
    }
    
    if (newQuantity < 0) {
      return Result.failure(Failure.validation('Quantity cannot be negative'));
    }
    
    final difference = newQuantity - stock.quantity;
    if (difference == 0) {
      return Result.failure(Failure.validation('No change in quantity'));
    }
    
    final ref = (referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.adjustment))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'ADJ-${DateTime.now().millisecondsSinceEpoch}'))!;
    
    try {
      final createdMovement = await _db.transaction<StockMovement>((txn) async {
        await _stockRepo.updateQuantity(stockId, newQuantity);
        
        final movement = StockMovement(
          id: _generateId(),
          referenceNo: ref,
          itemId: stock.itemId,
          movementType: MovementType.adjustment,
          quantity: difference.abs(),
          previousQuantity: stock.quantity,
          newQuantity: newQuantity,
          sourceLocationId: difference < 0 ? stock.locationId : null,
          destinationLocationId: difference > 0 ? stock.locationId : null,
          sourceWarehouseId: difference < 0 ? stock.warehouseId : null,
          destinationWarehouseId: difference > 0 ? stock.warehouseId : null,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
          reason: reason,
          status: MovementStatus.completed,
          createdBy: performedBy,
          notes: notes ?? 'Adjusted from ${stock.quantity} to $newQuantity',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        
        await _movementRepo.insert(movement);
        return movement;
      });
      return Result.success(createdMovement);
    } catch (e) {
      return Result.failure(Failure.database(
        'Adjustment failed: $e',
      ));
    }
  }
  
  // =====================================================
  // CYCLE COUNT OPERATIONS
  // =====================================================
  
  /// Record cycle count
  Future<Result<StockMovement>> cycleCount({
    required String stockId,
    required double countedQuantity,
    required String performedBy,
    String? referenceNumber,
    String? notes,
  }) async {
    final stockResult = await _stockRepo.getById(stockId);
    if (stockResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final stock = (stockResult as Success).data;
    if (stock == null) {
      return Result.failure(Failure.notFound('Stock', stockId));
    }
    
    final difference = countedQuantity - stock.quantity;
    
    final ref = (referenceNumber ?? 
        (await _movementRepo.generateReferenceNumber(MovementType.cycleCount))
            .fold(onSuccess: (d) => d, onFailure: (f) => 'CC-${DateTime.now().millisecondsSinceEpoch}'))!;
    
    try {
      final createdMovement = await _db.transaction<StockMovement>((txn) async {
        // Update stock to counted quantity
        await _stockRepo.updateQuantity(stockId, countedQuantity);
        
        final movement = StockMovement(
          id: _generateId(),
          referenceNo: ref,
          itemId: stock.itemId,
          movementType: MovementType.cycleCount,
          quantity: difference.abs(),
          previousQuantity: stock.quantity,
          newQuantity: countedQuantity,
          sourceLocationId: stock.locationId,
          destinationLocationId: stock.locationId,
          sourceWarehouseId: stock.warehouseId,
          destinationWarehouseId: stock.warehouseId,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
          reason: difference != 0 ? MovementReason.audit : null,
          status: MovementStatus.completed,
          createdBy: performedBy,
          notes: notes ?? (difference == 0 
              ? 'Cycle count verified: no variance' 
              : 'Cycle count variance: $difference'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        
        await _movementRepo.insert(movement);
        return movement;
      });
      return Result.success(createdMovement);
    } catch (e) {
      return Result.failure(Failure.database(
        'Cycle count failed: $e',
      ));
    }
  }
  
  // =====================================================
  // QUERY OPERATIONS
  // =====================================================
  
  /// Get current stock for an item
  Future<Result<ItemStockSummary>> getItemStockSummary(String itemId) async {
    return _stockRepo.getItemSummary(itemId);
  }
  
  /// Get stock at a location
  Future<Result<List<LocationStock>>> getLocationStock(String locationId) async {
    return _stockRepo.getLocationStockWithDetails(locationId);
  }
  
  /// Get expiring stock
  Future<Result<List<Stock>>> getExpiringStock({
    int days = 30,
    String? warehouseId,
  }) async {
    return _stockRepo.getExpiringStock(days, warehouseId: warehouseId);
  }
  
  /// Get expired stock
  Future<Result<List<Stock>>> getExpiredStock({String? warehouseId}) async {
    return _stockRepo.getExpiredStock(warehouseId: warehouseId);
  }
  
  /// Get low stock items
  Future<Result<List<Map<String, dynamic>>>> getLowStockItems({
    String? warehouseId,
  }) async {
    return _stockRepo.getLowStockItems(warehouseId: warehouseId);
  }
  
  /// Get out of stock items
  Future<Result<List<Map<String, dynamic>>>> getOutOfStockItems() async {
    return _stockRepo.getOutOfStockItems();
  }
  
  // =====================================================
  // VALIDATION
  // =====================================================
  
  Future<Failure?> _validateStockIn({
    required String itemId,
    required String locationId,
    required double quantity,
    String? batchNumber,
    DateTime? expiryDate,
  }) async {
    // Validate quantity
    if (quantity <= 0) {
      return Failure.validation('Quantity must be greater than 0');
    }
    
    // Validate item exists
    final itemResult = await _itemRepo.getById(itemId);
    if (itemResult case Failed(:final failure)) {
      return failure;
    }
    final item = (itemResult as Success).data;
    if (item == null) {
      return Failure.notFound('Item', itemId);
    }
    
    // Validate location exists
    final locationResult = await _locationRepo.getById(locationId);
    if (locationResult case Failed(:final failure)) {
      return failure;
    }
    if ((locationResult as Success).data == null) {
      return Failure.notFound('Location', locationId);
    }
    
    // Validate batch if required
    if (item.isBatchRequired && (batchNumber == null || batchNumber.isEmpty)) {
      return Failure.validation('Batch number is required for this item');
    }
    
    // Validate expiry if required
    if (item.isExpiryRequired && expiryDate == null) {
      return Failure.validation('Expiry date is required for this item');
    }
    
    // Validate expiry date is not in past (unless specifically allowed)
    if (expiryDate != null) {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      if (expiryDate.isBefore(today)) {
        return Failure.validation('Expiry date cannot be in the past');
      }
    }
    
    return null;
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  String _generateId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }
}

/// DTO for bulk stock in
class StockInItem {
  final String itemId;
  final double quantity;
  final String? batchNumber;
  final DateTime? expiryDate;
  final String? serialNumber;
  final double? unitCost;
  
  const StockInItem({
    required this.itemId,
    required this.quantity,
    this.batchNumber,
    this.expiryDate,
    this.serialNumber,
    this.unitCost,
  });
}
