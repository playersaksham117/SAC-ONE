/// ============================================================
/// WAREHOUSE PROVIDER - State management for warehouses & locations
/// ============================================================
/// 
/// Manages warehouses and location hierarchy.
/// Wraps WarehouseService for UI consumption.
/// 
/// Architecture: Provider Layer (State Management)
/// ============================================================

import 'package:flutter/foundation.dart';

import '../../core/types/result.dart';
import '../../domain/entities/warehouse.dart';
import '../../data/services/warehouse_service.dart';

/// Provider for warehouse and location management
class WarehouseProvider extends ChangeNotifier {
  final WarehouseService _warehouseService = WarehouseService();
  
  // State
  List<Warehouse> _warehouses = [];
  Warehouse? _selectedWarehouse;
  List<StorageLocation> _locations = [];
  List<StorageLocation> _locationTree = [];
  StorageLocation? _selectedLocation;
  Map<String, dynamic>? _warehouseStats;
  Map<String, dynamic>? _locationUtilization;
  
  bool _isLoading = false;
  String? _errorMessage;
  String? _successMessage;
  
  // Getters
  List<Warehouse> get warehouses => _warehouses;
  Warehouse? get selectedWarehouse => _selectedWarehouse;
  List<StorageLocation> get locations => _locations;
  List<StorageLocation> get locationTree => _locationTree;
  StorageLocation? get selectedLocation => _selectedLocation;
  Map<String, dynamic>? get warehouseStats => _warehouseStats;
  Map<String, dynamic>? get locationUtilization => _locationUtilization;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get successMessage => _successMessage;
  
  /// Get pickable locations (bins)
  List<StorageLocation> get pickableLocations => 
      _locations.where((l) => l.isPickable && l.isActive).toList();
  
  /// Get zones (root locations)
  List<StorageLocation> get zones =>
      _locations.where((l) => l.type == LocationType.zone && l.parentId == null).toList();
  
  // =====================================================
  // WAREHOUSE OPERATIONS
  // =====================================================
  
  /// Load all warehouses
  Future<void> loadWarehouses({bool activeOnly = true}) async {
    _setLoading(true);
    
    final result = await _warehouseService.getWarehouses(activeOnly: activeOnly);
    
    switch (result) {
      case Success(:final data):
        _warehouses = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
  }
  
  /// Select a warehouse
  Future<void> selectWarehouse(Warehouse? warehouse) async {
    _selectedWarehouse = warehouse;
    _selectedLocation = null;
    _locations = [];
    _locationTree = [];
    _warehouseStats = null;
    
    if (warehouse != null) {
      await loadLocations(warehouse.id);
      await loadWarehouseStats(warehouse.id);
    }
    
    notifyListeners();
  }
  
  /// Select warehouse by ID
  Future<void> selectWarehouseById(String warehouseId) async {
    final warehouse = _warehouses.firstWhere(
      (w) => w.id == warehouseId,
      orElse: () => _warehouses.first,
    );
    await selectWarehouse(warehouse);
  }
  
  /// Create warehouse
  Future<Result<Warehouse>> createWarehouse({
    required String name,
    String? code,
    String? description,
    String? address,
    String? city,
    String? state,
    String? country,
    String? postalCode,
    String? phone,
    String? email,
    String? managerName,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.createWarehouse(
      name: name,
      code: code,
      description: description,
      address: address,
      city: city,
      state: state,
      country: country,
      postalCode: postalCode,
      phone: phone,
      email: email,
      managerName: managerName,
    );
    
    switch (result) {
      case Success(:final data):
        _warehouses.add(data);
        _successMessage = 'Warehouse created: ${data.name}';
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Update warehouse
  Future<Result<Warehouse>> updateWarehouse(
    String warehouseId, {
    String? name,
    String? description,
    String? address,
    String? city,
    String? state,
    String? country,
    String? postalCode,
    String? phone,
    String? email,
    String? managerName,
    bool? isActive,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.updateWarehouse(
      warehouseId,
      name: name,
      description: description,
      address: address,
      city: city,
      state: state,
      country: country,
      postalCode: postalCode,
      phone: phone,
      email: email,
      managerName: managerName,
      isActive: isActive,
    );
    
    switch (result) {
      case Success(:final data):
        final index = _warehouses.indexWhere((w) => w.id == warehouseId);
        if (index != -1) {
          _warehouses[index] = data;
        }
        if (_selectedWarehouse?.id == warehouseId) {
          _selectedWarehouse = data;
        }
        _successMessage = 'Warehouse updated';
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Delete warehouse
  Future<Result<void>> deleteWarehouse(String warehouseId) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.deleteWarehouse(warehouseId);
    
    switch (result) {
      case Success():
        _warehouses.removeWhere((w) => w.id == warehouseId);
        if (_selectedWarehouse?.id == warehouseId) {
          _selectedWarehouse = null;
          _locations = [];
          _locationTree = [];
        }
        _successMessage = 'Warehouse deleted';
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Load warehouse statistics
  Future<void> loadWarehouseStats(String warehouseId) async {
    final result = await _warehouseService.getWarehouseStats(warehouseId);
    if (result case Success(:final data)) {
      _warehouseStats = data;
      notifyListeners();
    }
  }
  
  // =====================================================
  // LOCATION OPERATIONS
  // =====================================================
  
  /// Load locations for a warehouse
  Future<void> loadLocations(String warehouseId) async {
    _setLoading(true);
    
    final result = await _warehouseService.getLocations(warehouseId);
    final treeResult = await _warehouseService.getLocationTree(warehouseId);
    final utilizationResult = await _warehouseService.getLocationUtilization(warehouseId);
    
    switch (result) {
      case Success(:final data):
        _locations = data;
        _errorMessage = null;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    if (treeResult case Success(:final data)) {
      _locationTree = data;
    }
    
    if (utilizationResult case Success(:final data)) {
      _locationUtilization = data;
    }
    
    _setLoading(false);
  }
  
  /// Select a location
  void selectLocation(StorageLocation? location) {
    _selectedLocation = location;
    notifyListeners();
  }
  
  /// Get children of a location
  Future<List<StorageLocation>> getChildLocations(String parentId) async {
    final result = await _warehouseService.getChildLocations(parentId);
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  /// Create location
  Future<Result<StorageLocation>> createLocation({
    required String name,
    required LocationType type,
    String? code,
    String? parentId,
    String? barcode,
    int sortOrder = 0,
    int? row,
    int? column,
    int? level,
    double? maxCapacity,
    String? capacityUnit,
    double? maxWeight,
    String? weightUnit,
    String? temperatureZone,
    bool isPickable = true,
  }) async {
    if (_selectedWarehouse == null) {
      return Result.failure(Failure.validation('No warehouse selected'));
    }
    
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.createLocation(
      warehouseId: _selectedWarehouse!.id,
      name: name,
      type: type,
      code: code,
      parentId: parentId,
      barcode: barcode,
      sortOrder: sortOrder,
      row: row,
      column: column,
      level: level,
      maxCapacity: maxCapacity,
      capacityUnit: capacityUnit,
      maxWeight: maxWeight,
      weightUnit: weightUnit,
      temperatureZone: temperatureZone,
      isPickable: isPickable,
    );
    
    switch (result) {
      case Success(:final data):
        _locations.add(data);
        _successMessage = 'Location created: ${data.fullPath}';
        // Reload tree
        await loadLocations(_selectedWarehouse!.id);
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Create complete location structure
  Future<Result<List<StorageLocation>>> createLocationStructure({
    required String zoneName,
    required int rackCount,
    required int shelvesPerRack,
    required int binsPerShelf,
    String? zoneCode,
    double? binCapacity,
    String? temperatureZone,
  }) async {
    if (_selectedWarehouse == null) {
      return Result.failure(Failure.validation('No warehouse selected'));
    }
    
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.createLocationStructure(
      warehouseId: _selectedWarehouse!.id,
      zoneName: zoneName,
      rackCount: rackCount,
      shelvesPerRack: shelvesPerRack,
      binsPerShelf: binsPerShelf,
      zoneCode: zoneCode,
      binCapacity: binCapacity,
      temperatureZone: temperatureZone,
    );
    
    switch (result) {
      case Success(:final data):
        _successMessage = 'Created ${data.length} locations';
        await loadLocations(_selectedWarehouse!.id);
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Update location
  Future<Result<StorageLocation>> updateLocation(
    String locationId, {
    String? name,
    String? barcode,
    int? sortOrder,
    int? row,
    int? column,
    int? level,
    double? maxCapacity,
    String? capacityUnit,
    double? maxWeight,
    String? weightUnit,
    String? temperatureZone,
    bool? isPickable,
    bool? isActive,
  }) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.updateLocation(
      locationId,
      name: name,
      barcode: barcode,
      sortOrder: sortOrder,
      row: row,
      column: column,
      level: level,
      maxCapacity: maxCapacity,
      capacityUnit: capacityUnit,
      maxWeight: maxWeight,
      weightUnit: weightUnit,
      temperatureZone: temperatureZone,
      isPickable: isPickable,
      isActive: isActive,
    );
    
    switch (result) {
      case Success(:final data):
        final index = _locations.indexWhere((l) => l.id == locationId);
        if (index != -1) {
          _locations[index] = data;
        }
        if (_selectedLocation?.id == locationId) {
          _selectedLocation = data;
        }
        _successMessage = 'Location updated';
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  /// Delete location
  Future<Result<void>> deleteLocation(String locationId) async {
    _setLoading(true);
    _clearMessages();
    
    final result = await _warehouseService.deleteLocation(locationId);
    
    switch (result) {
      case Success():
        _locations.removeWhere((l) => l.id == locationId);
        if (_selectedLocation?.id == locationId) {
          _selectedLocation = null;
        }
        _successMessage = 'Location deleted';
        if (_selectedWarehouse != null) {
          await loadLocations(_selectedWarehouse!.id);
        }
        
      case Failed(:final failure):
        _errorMessage = failure.message;
    }
    
    _setLoading(false);
    return result;
  }
  
  // =====================================================
  // SEARCH & FILTER
  // =====================================================
  
  /// Search locations
  Future<List<StorageLocation>> searchLocations(
    String query, {
    LocationType? type,
  }) async {
    if (_selectedWarehouse == null) return [];
    
    final result = await _warehouseService.searchLocations(
      query,
      warehouseId: _selectedWarehouse!.id,
      type: type,
    );
    
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  /// Get location by barcode
  Future<StorageLocation?> getLocationByBarcode(String barcode) async {
    final result = await _warehouseService.getLocationByBarcode(barcode);
    return switch (result) {
      Success(:final data) => data,
      Failed() => null,
    };
  }
  
  /// Get empty locations in current warehouse
  Future<List<StorageLocation>> getEmptyLocations() async {
    if (_selectedWarehouse == null) return [];
    
    final result = await _warehouseService.getEmptyLocations(_selectedWarehouse!.id);
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  /// Get pickable locations in current warehouse
  Future<List<StorageLocation>> getPickableLocations() async {
    if (_selectedWarehouse == null) return [];
    
    final result = await _warehouseService.getPickableLocations(_selectedWarehouse!.id);
    return switch (result) {
      Success(:final data) => data,
      Failed() => [],
    };
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  /// Build hierarchical tree structure for UI
  List<LocationTreeNode> buildLocationTree() {
    final roots = _locations.where((l) => l.parentId == null).toList();
    return roots.map((root) => _buildTreeNode(root)).toList();
  }
  
  LocationTreeNode _buildTreeNode(StorageLocation location) {
    final children = _locations.where((l) => l.parentId == location.id).toList();
    return LocationTreeNode(
      location: location,
      children: children.map((child) => _buildTreeNode(child)).toList(),
    );
  }
  
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

/// Tree node for hierarchical location display
class LocationTreeNode {
  final StorageLocation location;
  final List<LocationTreeNode> children;
  bool isExpanded;
  
  LocationTreeNode({
    required this.location,
    this.children = const [],
    this.isExpanded = false,
  });
  
  bool get hasChildren => children.isNotEmpty;
  int get depth => location.level;
}
