/// ============================================================
/// INVENTORY PROVIDER - State management for inventory items
/// ============================================================
/// 
/// Manages item CRUD operations and filtering.
/// Wraps ItemService for UI consumption.
/// 
/// Architecture: Provider Layer (State Management)
/// ============================================================

import 'package:flutter/foundation.dart';

import '../../core/types/result.dart';
import '../../domain/entities/item.dart';
import '../../data/services/item_service.dart';
import '../../data/repositories/base_repository.dart';

/// Provider for inventory item management
class InventoryProvider extends ChangeNotifier {
  final ItemService _itemService = ItemService();
  
  // State
  List<Item> _items = [];
  List<Item> _filteredItems = [];
  List<String> _categories = [];
  List<String> _brands = [];
  Item? _selectedItem;
  bool _isLoading = false;
  String? _errorMessage;
  
  // Filters
  String _searchQuery = '';
  String? _categoryFilter;
  bool _showActiveOnly = true;
  
  // Pagination
  int _currentPage = 1;
  int _totalPages = 1;
  int _totalItems = 0;
  static const int _pageSize = 50;
  
  // Getters
  List<Item> get items => _filteredItems;
  List<String> get categories => _categories;
  List<String> get brands => _brands;
  Item? get selectedItem => _selectedItem;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  String? get categoryFilter => _categoryFilter;
  bool get showActiveOnly => _showActiveOnly;
  int get currentPage => _currentPage;
  int get totalPages => _totalPages;
  int get totalItems => _totalItems;
  bool get hasMorePages => _currentPage < _totalPages;
  
  // =====================================================
  // DATA LOADING
  // =====================================================
  
  /// Load all items with current filters
  Future<void> loadItems({bool refresh = false}) async {
    if (refresh) {
      _currentPage = 1;
    }
    
    _setLoading(true);
    
    final pageRequest = PageRequest(
      page: _currentPage,
      size: _pageSize,
      sortBy: 'name',
    );
    
    final result = await _itemService.getItems(
      page: pageRequest,
      category: _categoryFilter,
      activeOnly: _showActiveOnly,
    );
    
    switch (result) {
      case Success(:final data):
        if (refresh || _currentPage == 1) {
          _items = data.items;
        } else {
          _items.addAll(data.items);
        }
        _totalPages = data.totalPages;
        _totalItems = data.total;
        _applyLocalFilters();
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Load next page
  Future<void> loadNextPage() async {
    if (!hasMorePages || _isLoading) return;
    _currentPage++;
    await loadItems();
  }
  
  /// Refresh all data
  Future<void> refresh() async {
    await loadItems(refresh: true);
    await loadCategories();
    await loadBrands();
  }
  
  /// Load categories
  Future<void> loadCategories() async {
    final result = await _itemService.getCategories();
    if (result case Success(:final data)) {
      _categories = data;
      notifyListeners();
    }
  }
  
  /// Load brands
  Future<void> loadBrands() async {
    final result = await _itemService.getBrands();
    if (result case Success(:final data)) {
      _brands = data;
      notifyListeners();
    }
  }
  
  // =====================================================
  // FILTERING & SEARCH
  // =====================================================
  
  /// Set search query and filter locally
  void setSearchQuery(String query) {
    _searchQuery = query;
    _applyLocalFilters();
    notifyListeners();
  }
  
  /// Set category filter and reload
  Future<void> setCategoryFilter(String? category) async {
    _categoryFilter = category;
    await loadItems(refresh: true);
  }
  
  /// Toggle active only filter
  Future<void> setShowActiveOnly(bool value) async {
    _showActiveOnly = value;
    await loadItems(refresh: true);
  }
  
  /// Clear all filters
  Future<void> clearFilters() async {
    _searchQuery = '';
    _categoryFilter = null;
    _showActiveOnly = true;
    await loadItems(refresh: true);
  }
  
  /// Apply local filters (search)
  void _applyLocalFilters() {
    if (_searchQuery.isEmpty) {
      _filteredItems = List.from(_items);
    } else {
      final query = _searchQuery.toLowerCase();
      _filteredItems = _items.where((item) {
        return item.name.toLowerCase().contains(query) ||
               item.code.toLowerCase().contains(query) ||
               (item.barcode?.contains(query) ?? false) ||
               (item.description?.toLowerCase().contains(query) ?? false);
      }).toList();
    }
  }
  
  /// Search items (server-side for more results)
  Future<List<Item>> search(String query, {int limit = 20}) async {
    final result = await _itemService.search(query, limit: limit);
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  // =====================================================
  // CRUD OPERATIONS
  // =====================================================
  
  /// Select an item for viewing/editing
  void selectItem(Item? item) {
    _selectedItem = item;
    notifyListeners();
  }
  
  /// Get item by ID
  Future<Item?> getItemById(String id) async {
    final result = await _itemService.getById(id);
    return switch (result) {
      Success(:final data) => data,
      Failed() => null,
    };
  }
  
  /// Get item by barcode
  Future<Item?> getItemByBarcode(String barcode) async {
    final result = await _itemService.getByBarcode(barcode);
    return switch (result) {
      Success(:final data) => data,
      Failed() => null,
    };
  }
  
  /// Get item by SKU
  Future<Item?> getItemByCode(String code) async {
    final result = await _itemService.getByCode(code);
    return switch (result) {
      Success(:final data) => data,
      Failed() => null,
    };
  }
  
  /// Create new item
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
  }) async {
    _setLoading(true);
    
    final result = await _itemService.createItem(
      name: name,
      category: category,
      unit: unit,
      sku: sku,
      barcode: barcode,
      description: description,
      brand: brand,
      purchasePrice: purchasePrice,
      sellingPrice: sellingPrice,
      minStockLevel: minStockLevel,
      maxStockLevel: maxStockLevel,
      reorderPoint: reorderPoint,
      reorderQuantity: reorderQuantity,
      isBatchRequired: isBatchRequired,
      isExpiryRequired: isExpiryRequired,
      isSerialRequired: isSerialRequired,
    );
    
    if (result case Success(:final data)) {
      _items.insert(0, data);
      _applyLocalFilters();
      _totalItems++;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Update existing item
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
    bool? isActive,
  }) async {
    _setLoading(true);
    
    final result = await _itemService.updateItem(
      itemId,
      name: name,
      description: description,
      category: category,
      brand: brand,
      unit: unit,
      barcode: barcode,
      purchasePrice: purchasePrice,
      sellingPrice: sellingPrice,
      minStockLevel: minStockLevel,
      maxStockLevel: maxStockLevel,
      reorderPoint: reorderPoint,
      reorderQuantity: reorderQuantity,
      isBatchRequired: isBatchRequired,
      isExpiryRequired: isExpiryRequired,
      isSerialRequired: isSerialRequired,
      isActive: isActive,
    );
    
    if (result case Success(:final data)) {
      final index = _items.indexWhere((i) => i.id == itemId);
      if (index != -1) {
        _items[index] = data;
        _applyLocalFilters();
      }
      if (_selectedItem?.id == itemId) {
        _selectedItem = data;
      }
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Delete item
  Future<Result<void>> deleteItem(String itemId) async {
    _setLoading(true);
    
    final result = await _itemService.deleteItem(itemId);
    
    if (result case Success()) {
      _items.removeWhere((i) => i.id == itemId);
      _applyLocalFilters();
      _totalItems--;
      if (_selectedItem?.id == itemId) {
        _selectedItem = null;
      }
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // STATISTICS
  // =====================================================
  
  /// Get item count by category
  Future<Map<String, int>> getCountByCategory() async {
    final result = await _itemService.getCountByCategory();
    return switch (result) {
      Success(:final data) => data,
      Failed() => {},
    };
  }
  
  /// Get total item count
  Future<int> getTotalCount({bool activeOnly = true}) async {
    final result = await _itemService.getTotalCount(activeOnly: activeOnly);
    return switch (result) {
      Success(:final data) => data,
      Failed() => 0,
    };
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
