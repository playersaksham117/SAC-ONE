import 'package:flutter/foundation.dart';
import '../services/stock_search_service.dart';

class StockSearchProvider with ChangeNotifier {
  List<StockSearchResult> _searchResults = [];
  StockSearchResult? _selectedResult;
  bool _isSearching = false;
  String? _lastError;
  
  List<StockSearchResult> get searchResults => _searchResults;
  StockSearchResult? get selectedResult => _selectedResult;
  bool get isSearching => _isSearching;
  String? get lastError => _lastError;

  /// Global search by SKU, name, or barcode
  Future<void> search(String query) async {
    if (query.trim().isEmpty) {
      _searchResults = [];
      _lastError = null;
      notifyListeners();
      return;
    }

    _isSearching = true;
    _lastError = null;
    notifyListeners();

    try {
      _searchResults = await StockSearchService.globalSearch(query);
    } catch (e) {
      _lastError = e.toString();
      _searchResults = [];
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Quick search by SKU
  Future<void> searchBySku(String sku) async {
    _isSearching = true;
    _lastError = null;
    notifyListeners();

    try {
      final result = await StockSearchService.searchBySku(sku);
      if (result != null) {
        _searchResults = [result];
        _selectedResult = result;
      } else {
        _searchResults = [];
        _lastError = 'SKU not found';
      }
    } catch (e) {
      _lastError = e.toString();
      _searchResults = [];
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Quick search by barcode
  Future<void> searchByBarcode(String barcode) async {
    _isSearching = true;
    _lastError = null;
    notifyListeners();

    try {
      final result = await StockSearchService.searchByBarcode(barcode);
      if (result != null) {
        _searchResults = [result];
        _selectedResult = result;
      } else {
        _searchResults = [];
        _lastError = 'Barcode not found';
      }
    } catch (e) {
      _lastError = e.toString();
      _searchResults = [];
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Advanced search with filters
  Future<void> advancedSearch({
    String? skuPattern,
    String? namePattern,
    String? category,
    String? warehouseId,
    bool? isLowStock,
    bool? isCritical,
  }) async {
    _isSearching = true;
    _lastError = null;
    notifyListeners();

    try {
      _searchResults = await StockSearchService.advancedSearch(
        skuPattern: skuPattern,
        namePattern: namePattern,
        category: category,
        warehouseId: warehouseId,
        isLowStock: isLowStock,
        isCritical: isCritical,
      );
    } catch (e) {
      _lastError = e.toString();
      _searchResults = [];
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Select a result to view details
  void selectResult(StockSearchResult result) {
    _selectedResult = result;
    notifyListeners();
  }

  /// Clear search
  void clearSearch() {
    _searchResults = [];
    _selectedResult = null;
    _lastError = null;
    notifyListeners();
  }

  /// Adjust stock quantity at a specific location (+ or -)
  Future<void> adjustStockQuantity({
    required String stockId,
    required double adjustment,
    String reason = 'Manual adjustment',
  }) async {
    try {
      await StockSearchService.adjustStockQuantity(
        stockId: stockId,
        adjustment: adjustment,
        reason: reason,
      );
      
      // Refresh search results if we have any
      if (_searchResults.isNotEmpty && _selectedResult != null) {
        // Reload by searching for the same item
        await searchBySku(_selectedResult!.sku);
      }
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      rethrow;
    }
  }
}
