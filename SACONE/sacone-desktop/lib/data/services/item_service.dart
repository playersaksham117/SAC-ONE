/// ============================================================
/// ITEM SERVICE - Business logic for inventory items
/// ============================================================
/// 
/// Handles item CRUD operations with validation,
/// SKU generation, and stock integration.
/// 
/// Architecture: Service Layer
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/item.dart';
import '../repositories/item_repository.dart';
import '../repositories/base_repository.dart';
import '../database/database_connection.dart';

/// Service for managing inventory items
class ItemService {
  final ItemRepository _repository = ItemRepository();
  final DatabaseConnection _db = DatabaseConnection.instance;
  
  // =====================================================
  // CRUD OPERATIONS
  // =====================================================
  
  /// Create a new item with validation
  Future<Result<Item>> createItem({
    required String name,
    required String category,
    required String unit,
    String? sku,
    String? barcode,
    String? description,
    String? brand,
    double? purchasePrice,
    double? sellingPrice,
    double? minStockLevel,
    double? maxStockLevel,
    double? reorderPoint,
    double? reorderQuantity,
    bool isBatchRequired = false,
    bool isExpiryRequired = false,
    bool isSerialRequired = false,
    double? weight,
    double? length,
    double? width,
    double? height,
    String? imageUrl,
    Map<String, dynamic>? customFields,
  }) async {
    // Validate required fields
    final validationResult = _validateItem(
      name: name,
      category: category,
      unit: unit,
      purchasePrice: purchasePrice,
      sellingPrice: sellingPrice,
    );
    
    if (validationResult != null) {
      return Result.failure(validationResult);
    }
    
    // Generate SKU if not provided
    final finalSku = sku ?? await _generateSku(category);
    
    // Check if SKU exists
    final skuExistsResult = await _repository.codeExists(finalSku);
    if (skuExistsResult case Success(:final data)) {
      if (data) {
        return Result.failure(Failure.validation('SKU already exists: $finalSku'));
      }
    }
    
    // Check if barcode exists (if provided)
    if (barcode != null && barcode.isNotEmpty) {
      final barcodeExistsResult = await _repository.barcodeExists(barcode);
      if (barcodeExistsResult case Success(:final data)) {
        if (data) {
          return Result.failure(Failure.validation('Barcode already exists: $barcode'));
        }
      }
    }
    
    // Create item
    final item = Item(
      id: _generateId(),
      code: finalSku.toUpperCase(),
      name: name.trim(),
      category: category,
      unit: unit,
      barcode: barcode,
      costPrice: purchasePrice ?? 0,
      sellingPrice: sellingPrice ?? 0,
      reorderLevel: reorderPoint ?? 0,
      minimumLevel: minStockLevel ?? 0,
      maximumLevel: maxStockLevel,
      isBatchRequired: isBatchRequired,
      isExpiryRequired: isExpiryRequired,
      isSerialRequired: isSerialRequired,
      weight: weight,
      imageUrl: imageUrl,
      notes: description?.trim(),
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    
    final insertResult = await _repository.insert(item);
    return insertResult.map((_) => item);
  }
  
  /// Update an existing item
  Future<Result<Item>> updateItem(
    String itemId, {
    String? name,
    String? description,
    String? category,
    String? brand,
    String? unit,
    String? barcode,
    double? purchasePrice,
    double? sellingPrice,
    double? minStockLevel,
    double? maxStockLevel,
    double? reorderPoint,
    double? reorderQuantity,
    bool? isBatchRequired,
    bool? isExpiryRequired,
    bool? isSerialRequired,
    double? weight,
    double? length,
    double? width,
    double? height,
    String? imageUrl,
    Map<String, dynamic>? customFields,
    bool? isActive,
  }) async {
    // Get existing item
    final existingResult = await _repository.getById(itemId);
    if (existingResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final existing = (existingResult as Success).data;
    if (existing == null) {
      return Result.failure(Failure.notFound('Item', itemId));
    }
    
    // Check barcode uniqueness (if changing)
    if (barcode != null && barcode != existing.barcode && barcode.isNotEmpty) {
      final barcodeExistsResult = await _repository.barcodeExists(
        barcode,
        excludeId: itemId,
      );
      if (barcodeExistsResult case Success(:final data)) {
        if (data) {
          return Result.failure(Failure.validation('Barcode already exists: $barcode'));
        }
      }
    }
    
    // Build updated item
    final updated = existing.copyWith(
      name: name,
      category: category,
      unit: unit,
      barcode: barcode,
      costPrice: purchasePrice,
      sellingPrice: sellingPrice,
      reorderLevel: reorderPoint,
      minimumLevel: minStockLevel,
      maximumLevel: maxStockLevel,
      isBatchRequired: isBatchRequired,
      isExpiryRequired: isExpiryRequired,
      isSerialRequired: isSerialRequired,
      weight: weight,
      imageUrl: imageUrl,
      notes: description,
      isActive: isActive,
      updatedAt: DateTime.now(),
    );
    
    final updateResult = await _repository.update(updated, itemId);
    return updateResult.map((_) => updated);
  }
  
  /// Delete an item (soft delete)
  Future<Result<void>> deleteItem(String itemId) async {
    // Check if item has stock
    // Note: In production, we'd want to inject StockRepository
    // For now, we check via raw query
    final database = await _db.database;
    final stockCheck = await database.rawQuery(
      'SELECT 1 FROM stock WHERE itemId = ? AND quantity > 0 LIMIT 1',
      [itemId],
    );
    
    if (stockCheck.isNotEmpty) {
      return Result.failure(Failure.business(
        'Cannot delete item with existing stock. Please clear stock first.',
      ));
    }
    
    return _repository.softDelete(itemId, null);
  }
  
  /// Permanently delete an item
  Future<Result<void>> permanentDelete(String itemId) async {
    return _repository.delete(itemId);
  }
  
  // =====================================================
  // QUERY OPERATIONS
  // =====================================================
  
  /// Get item by ID
  Future<Result<Item?>> getById(String itemId) async {
    return _repository.getById(itemId);
  }
  
  /// Get item by SKU
  Future<Result<Item?>> getByCode(String code) async {
    return _repository.getByCode(code);
  }
  
  /// Get item by barcode
  Future<Result<Item?>> getByBarcode(String barcode) async {
    return _repository.getByBarcode(barcode);
  }
  
  /// Search items
  Future<Result<List<Item>>> search(
    String query, {
    String? category,
    bool? activeOnly,
    int limit = 50,
  }) async {
    return _repository.search(
      query,
      category: category,
      isActive: activeOnly,
      limit: limit,
    );
  }
  
  /// Get all items with pagination
  Future<Result<PageResult<Item>>> getItems({
    PageRequest? page,
    String? category,
    bool activeOnly = true,
  }) async {
    final pageRequest = page ?? PageRequest(page: 1, size: 50);
    
    String where = 'isDeleted = 0';
    List<Object?> whereArgs = [];
    
    if (category != null) {
      where += ' AND category = ?';
      whereArgs.add(category);
    }
    
    if (activeOnly) {
      where += ' AND isActive = 1';
    }
    
    return _repository.getPaginated(
      pageRequest,
      where: where,
      whereArgs: whereArgs.isEmpty ? null : whereArgs,
      orderBy: 'name ASC',
    );
  }
  
  /// Get items by category
  Future<Result<List<Item>>> getByCategory(String category) async {
    return _repository.getByCategory(category);
  }
  
  /// Get all categories
  Future<Result<List<String>>> getCategories() async {
    return _repository.getCategories();
  }
  
  /// Get all brands
  Future<Result<List<String>>> getBrands() async {
    return _repository.getBrands();
  }
  
  /// Get items requiring batch tracking
  Future<Result<List<Item>>> getBatchRequiredItems() async {
    return _repository.getBatchRequiredItems();
  }
  
  /// Get items requiring expiry tracking
  Future<Result<List<Item>>> getExpiryRequiredItems() async {
    return _repository.getExpiryRequiredItems();
  }
  
  /// Get recently updated items
  Future<Result<List<Item>>> getRecentItems({int limit = 10}) async {
    return _repository.getRecentlyUpdated(limit: limit);
  }
  
  // =====================================================
  // STATISTICS
  // =====================================================
  
  /// Get total item count
  Future<Result<int>> getTotalCount({bool activeOnly = true}) async {
    return _repository.getTotalCount(activeOnly: activeOnly);
  }
  
  /// Get item count by category
  Future<Result<Map<String, int>>> getCountByCategory() async {
    return _repository.getCountByCategory();
  }
  
  // =====================================================
  // BULK OPERATIONS
  // =====================================================
  
  /// Import items from list
  Future<Result<int>> importItems(List<Map<String, dynamic>> itemsData) async {
    final items = <Item>[];
    final errors = <String>[];
    
    for (int i = 0; i < itemsData.length; i++) {
      final data = itemsData[i];
      try {
        // Validate required fields
        if (data['name'] == null || data['category'] == null || data['unit'] == null) {
          errors.add('Row ${i + 1}: Missing required fields (name, category, unit)');
          continue;
        }
        
        // Check for duplicate SKU in batch
        final sku = data['code'] ?? data['sku'] ?? await _generateSku(data['category']);
        if (items.any((item) => item.code == sku)) {
          errors.add('Row ${i + 1}: Duplicate SKU in import: $sku');
          continue;
        }
        
        // Check SKU in database
        final exists = await _repository.codeExists(sku);
        if (exists case Success(:final data) when data) {
          errors.add('Row ${i + 1}: SKU already exists: $sku');
          continue;
        }
        
        items.add(Item(
          id: _generateId(),
          code: sku.toString().toUpperCase(),
          name: data['name'],
          category: data['category'],
          unit: data['unit'],
          barcode: data['barcode'],
          costPrice: (data['purchasePrice'] as num?)?.toDouble() ?? 0,
          sellingPrice: (data['sellingPrice'] as num?)?.toDouble() ?? 0,
          reorderLevel: (data['reorderPoint'] as num?)?.toDouble() ?? 0,
          minimumLevel: (data['minStockLevel'] as num?)?.toDouble() ?? 0,
          maximumLevel: (data['maxStockLevel'] as num?)?.toDouble(),
          isBatchRequired: data['isBatchRequired'] ?? false,
          isExpiryRequired: data['isExpiryRequired'] ?? false,
          isSerialRequired: data['isSerialRequired'] ?? false,
          isActive: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ));
      } catch (e) {
        errors.add('Row ${i + 1}: Error parsing data - $e');
      }
    }
    
    if (items.isEmpty && errors.isNotEmpty) {
      return Result.failure(Failure.validation(errors.join('\n')));
    }
    
    // Insert all valid items
    final insertResult = await _repository.insertBatch(items);
    
    if (insertResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    if (errors.isNotEmpty) {
      // Partial success
      return Result.success(items.length);
      // Note: In production, we'd want to return errors too
    }
    
    return Result.success(items.length);
  }
  
  // =====================================================
  // VALIDATION
  // =====================================================
  
  Failure? _validateItem({
    required String name,
    required String category,
    required String unit,
    double? purchasePrice,
    double? sellingPrice,
  }) {
    if (name.trim().isEmpty) {
      return Failure.validation('Item name is required');
    }
    
    if (name.trim().length < 2) {
      return Failure.validation('Item name must be at least 2 characters');
    }
    
    if (category.trim().isEmpty) {
      return Failure.validation('Category is required');
    }
    
    if (unit.trim().isEmpty) {
      return Failure.validation('Unit is required');
    }
    
    if (purchasePrice != null && purchasePrice < 0) {
      return Failure.validation('Purchase price cannot be negative');
    }
    
    if (sellingPrice != null && sellingPrice < 0) {
      return Failure.validation('Selling price cannot be negative');
    }
    
    return null;
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  String _generateId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }
  
  Future<String> _generateSku(String category) async {
    final prefix = category.substring(0, 3).toUpperCase();
    final sequence = await _db.getNextSequence('item_sku');
    return '$prefix-${sequence.toString().padLeft(5, '0')}';
  }
}
