/// ============================================================
/// WAREHOUSE SERVICE - Business logic for location management
/// ============================================================
/// 
/// Handles warehouse and location hierarchy operations.
/// Supports creating nested location structures.
/// 
/// Architecture: Service Layer
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/warehouse.dart';
import '../repositories/location_repository.dart';
import '../database/database_connection.dart';

/// Service for managing warehouses and locations
class WarehouseService {
  final WarehouseRepository _warehouseRepo = WarehouseRepository();
  final LocationRepository _locationRepo = LocationRepository();
  final DatabaseConnection _db = DatabaseConnection.instance;
  
  // =====================================================
  // WAREHOUSE OPERATIONS
  // =====================================================
  
  /// Create a new warehouse
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
    double? latitude,
    double? longitude,
  }) async {
    // Validate
    if (name.trim().isEmpty) {
      return Result.failure(Failure.validation('Warehouse name is required'));
    }
    
    // Generate code if not provided
    final warehouseCode = code ?? await _generateWarehouseCode(name);
    
    // Check code uniqueness
    final codeExistsResult = await _warehouseRepo.codeExists(warehouseCode);
    if (codeExistsResult case Success(:final data) when data) {
      return Result.failure(Failure.validation('Warehouse code already exists'));
    }
    
    final warehouse = Warehouse(
      id: _generateId(),
      code: warehouseCode.toUpperCase(),
      name: name.trim(),
      description: description,
      address: address,
      city: city,
      state: state,
      country: country,
      postalCode: postalCode,
      contactPhone: phone,
      contactEmail: email,
      contactPerson: managerName,
      latitude: latitude,
      longitude: longitude,
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    
    final result = await _warehouseRepo.insert(warehouse);
    return result.map((_) => warehouse);
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
    double? latitude,
    double? longitude,
    bool? isActive,
  }) async {
    final existingResult = await _warehouseRepo.getById(warehouseId);
    if (existingResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final existing = (existingResult as Success).data;
    if (existing == null) {
      return Result.failure(Failure.notFound('Warehouse', warehouseId));
    }
    
    final updated = existing.copyWith(
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
      latitude: latitude,
      longitude: longitude,
      isActive: isActive,
      updatedAt: DateTime.now(),
    );
    
    final result = await _warehouseRepo.update(updated, warehouseId);
    return result.map((_) => updated);
  }
  
  /// Delete warehouse (soft)
  Future<Result<void>> deleteWarehouse(String warehouseId) async {
    // Check if warehouse has stock
    final database = await _db.database;
    final stockCheck = await database.rawQuery(
      'SELECT 1 FROM stock WHERE warehouseId = ? AND quantity > 0 LIMIT 1',
      [warehouseId],
    );
    
    if (stockCheck.isNotEmpty) {
      return Result.failure(Failure.business(
        'Cannot delete warehouse with existing stock',
      ));
    }
    
    // Check for active locations
    final locationsResult = await _locationRepo.getByWarehouse(warehouseId);
    if (locationsResult case Success(:final data) when data.isNotEmpty) {
      return Result.failure(Failure.business(
        'Cannot delete warehouse with existing locations. Delete locations first.',
      ));
    }
    
    return _warehouseRepo.softDelete(warehouseId, null);
  }
  
  /// Get all warehouses
  Future<Result<List<Warehouse>>> getWarehouses({bool activeOnly = true}) async {
    if (activeOnly) {
      return _warehouseRepo.getActiveWarehouses();
    }
    return _warehouseRepo.getAll(
      where: 'isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Get warehouse by ID
  Future<Result<Warehouse?>> getWarehouseById(String id) async {
    return _warehouseRepo.getById(id);
  }
  
  /// Get warehouse by code
  Future<Result<Warehouse?>> getWarehouseByCode(String code) async {
    return _warehouseRepo.getByCode(code);
  }
  
  /// Get warehouse statistics
  Future<Result<Map<String, dynamic>>> getWarehouseStats(String warehouseId) async {
    return _warehouseRepo.getWarehouseStats(warehouseId);
  }
  
  // =====================================================
  // LOCATION OPERATIONS
  // =====================================================
  
  /// Create a storage location
  Future<Result<StorageLocation>> createLocation({
    required String warehouseId,
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
    // Validate warehouse exists
    final warehouseResult = await _warehouseRepo.getById(warehouseId);
    if (warehouseResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    if ((warehouseResult as Success).data == null) {
      return Result.failure(Failure.notFound('Warehouse', warehouseId));
    }
    
    // Validate parent if provided
    if (parentId != null) {
      final parentResult = await _locationRepo.getById(parentId);
      if (parentResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      final parent = (parentResult as Success).data;
      if (parent == null) {
        return Result.failure(Failure.notFound('Parent location', parentId));
      }
      if (parent.warehouseId != warehouseId) {
        return Result.failure(Failure.validation(
          'Parent location must be in the same warehouse',
        ));
      }
      
      // Validate type hierarchy
      final validChild = _isValidChildType(parent.type, type);
      if (!validChild) {
        return Result.failure(Failure.validation(
          'Invalid location hierarchy: ${type.name} cannot be under ${parent.type.name}',
        ));
      }
    }
    
    // Generate code if not provided
    final locationCode = code ?? await _generateLocationCode(warehouseId, type);
    
    // Check code uniqueness within warehouse
    final codeExistsResult = await _locationRepo.codeExists(warehouseId, locationCode);
    if (codeExistsResult case Success(:final data) when data) {
      return Result.failure(Failure.validation('Location code already exists in this warehouse'));
    }
    
    // Check barcode uniqueness if provided
    if (barcode != null && barcode.isNotEmpty) {
      final barcodeExistsResult = await _locationRepo.barcodeExists(barcode);
      if (barcodeExistsResult case Success(:final data) when data) {
        return Result.failure(Failure.validation('Location barcode already exists'));
      }
    }
    
    // Use the provided location type directly
    
    final location = StorageLocation(
      id: _generateId(),
      warehouseId: warehouseId,
      parentId: parentId,
      code: locationCode.toUpperCase(),
      name: name.trim(),
      locationType: type,
      level: level,
      row: row,
      column: column,
      capacity: maxCapacity,
      capacityUnit: capacityUnit,
      temperatureZone: temperatureZone,
      sortOrder: sortOrder,
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    
    final result = await _locationRepo.insert(location);
    return result.map((_) => location);
  }
  
  /// Create a complete location structure (Zone > Racks > Shelves > Bins)
  Future<Result<List<StorageLocation>>> createLocationStructure({
    required String warehouseId,
    required String zoneName,
    required int rackCount,
    required int shelvesPerRack,
    required int binsPerShelf,
    String? zoneCode,
    double? binCapacity,
    String? temperatureZone,
  }) async {
    final locations = <StorageLocation>[];
    
    try {
      final createdLocations = await _db.transaction<List<StorageLocation>>((txn) async {
        // Create zone
        final zoneResult = await createLocation(
          warehouseId: warehouseId,
          name: zoneName,
          type: LocationType.zone,
          code: zoneCode,
          temperatureZone: temperatureZone,
          isPickable: false,
        );
        
        if (zoneResult case Failed(:final failure)) {
          throw Exception(failure.message);
        }
        
        final zone = (zoneResult as Success).data;
        locations.add(zone);
        
        // Create racks
        for (int r = 1; r <= rackCount; r++) {
          final rackName = 'Rack $r';
          final rackResult = await createLocation(
            warehouseId: warehouseId,
            name: rackName,
            type: LocationType.rack,
            parentId: zone.id,
            sortOrder: r,
            isPickable: false,
          );
          
          if (rackResult case Failed(:final failure)) {
            throw Exception(failure.message);
          }
          
          final rack = (rackResult as Success).data;
          locations.add(rack);
          
          // Create shelves
          for (int s = 1; s <= shelvesPerRack; s++) {
            final shelfName = 'Shelf $s';
            final shelfResult = await createLocation(
              warehouseId: warehouseId,
              name: shelfName,
              type: LocationType.shelf,
              parentId: rack.id,
              sortOrder: s,
              level: s,
              isPickable: false,
            );
            
            if (shelfResult case Failed(:final failure)) {
              throw Exception(failure.message);
            }
            
            final shelf = (shelfResult as Success).data;
            locations.add(shelf);
            
            // Create bins
            for (int b = 1; b <= binsPerShelf; b++) {
              final binName = 'Bin $b';
              final binResult = await createLocation(
                warehouseId: warehouseId,
                name: binName,
                type: LocationType.bin,
                parentId: shelf.id,
                sortOrder: b,
                column: b,
                maxCapacity: binCapacity,
                temperatureZone: temperatureZone,
                isPickable: true,
              );
              
              if (binResult case Failed(:final failure)) {
                throw Exception(failure.message);
              }
              
              locations.add((binResult as Success).data);
            }
          }
        }
        
        return locations;
      });
      return Result.success(createdLocations);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to create location structure: $e',
        error: e,
      ));
    }
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
    final existingResult = await _locationRepo.getById(locationId);
    if (existingResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final existing = (existingResult as Success).data;
    if (existing == null) {
      return Result.failure(Failure.notFound('Location', locationId));
    }
    
    // Check barcode uniqueness if changing
    if (barcode != null && barcode != existing.barcode && barcode.isNotEmpty) {
      final barcodeExistsResult = await _locationRepo.barcodeExists(
        barcode,
        excludeId: locationId,
      );
      if (barcodeExistsResult case Success(:final data) when data) {
        return Result.failure(Failure.validation('Location barcode already exists'));
      }
    }
    
    // Rebuild full path if name changed
    String? newFullPath;
    if (name != null && name != existing.name) {
      if (existing.parentId == null) {
        newFullPath = name;
      } else {
        final ancestorsResult = await _locationRepo.getAncestors(locationId);
        if (ancestorsResult case Success(:final data)) {
          newFullPath = [...data.map((a) => a.name), name].join(' > ');
        }
      }
    }
    
    final updated = existing.copyWith(
      name: name,
      barcode: barcode,
      fullPath: newFullPath,
      sortOrder: sortOrder,
      row: row,
      column: column,
      locationLevel: level,
      maxCapacity: maxCapacity,
      capacityUnit: capacityUnit,
      maxWeight: maxWeight,
      weightUnit: weightUnit,
      temperatureZone: temperatureZone,
      isPickable: isPickable,
      isActive: isActive,
      updatedAt: DateTime.now(),
    );
    
    final result = await _locationRepo.update(updated, locationId);
    
    // Rebuild descendant paths if name changed
    if (name != null && name != existing.name) {
      await _locationRepo.rebuildPaths(locationId);
    }
    
    return result.map((_) => updated);
  }
  
  /// Delete location
  Future<Result<void>> deleteLocation(String locationId) async {
    // Check for stock
    final hasStockResult = await _locationRepo.hasStock(locationId);
    if (hasStockResult case Success(:final data) when data) {
      return Result.failure(Failure.business(
        'Cannot delete location with existing stock',
      ));
    }
    
    // Check for children
    final hasChildrenResult = await _locationRepo.hasChildren(locationId);
    if (hasChildrenResult case Success(:final data) when data) {
      return Result.failure(Failure.business(
        'Cannot delete location with child locations. Delete children first.',
      ));
    }
    
    return _locationRepo.softDelete(locationId, null);
  }
  
  // =====================================================
  // LOCATION QUERIES
  // =====================================================
  
  /// Get location by ID
  Future<Result<StorageLocation?>> getLocationById(String id) async {
    return _locationRepo.getById(id);
  }
  
  /// Get location by barcode
  Future<Result<StorageLocation?>> getLocationByBarcode(String barcode) async {
    return _locationRepo.getByBarcode(barcode);
  }
  
  /// Get locations in warehouse
  Future<Result<List<StorageLocation>>> getLocations(
    String warehouseId, {
    LocationType? type,
    bool activeOnly = true,
  }) async {
    return _locationRepo.getByWarehouse(
      warehouseId,
      type: type,
      activeOnly: activeOnly,
    );
  }
  
  /// Get location hierarchy (tree structure)
  Future<Result<List<StorageLocation>>> getLocationTree(String warehouseId) async {
    return _locationRepo.getHierarchy(warehouseId);
  }
  
  /// Get root locations (zones)
  Future<Result<List<StorageLocation>>> getRootLocations(String warehouseId) async {
    return _locationRepo.getRootLocations(warehouseId);
  }
  
  /// Get children of a location
  Future<Result<List<StorageLocation>>> getChildLocations(String parentId) async {
    return _locationRepo.getChildren(parentId);
  }
  
  /// Get pickable (bin) locations
  Future<Result<List<StorageLocation>>> getPickableLocations(String warehouseId) async {
    return _locationRepo.getPickableLocations(warehouseId);
  }
  
  /// Get empty locations
  Future<Result<List<StorageLocation>>> getEmptyLocations(String warehouseId) async {
    return _locationRepo.getEmptyLocations(warehouseId);
  }
  
  /// Search locations
  Future<Result<List<StorageLocation>>> searchLocations(
    String query, {
    String? warehouseId,
    LocationType? type,
    int limit = 50,
  }) async {
    return _locationRepo.search(
      query,
      warehouseId: warehouseId,
      type: type,
      limit: limit,
    );
  }
  
  /// Get location utilization
  Future<Result<Map<String, dynamic>>> getLocationUtilization(String warehouseId) async {
    return _locationRepo.getUtilization(warehouseId);
  }
  
  // =====================================================
  // VALIDATION & HELPERS
  // =====================================================
  
  bool _isValidChildType(LocationType parent, LocationType child) {
    return switch (parent) {
      LocationType.warehouse => child == LocationType.zone,
      LocationType.zone => child == LocationType.rack || child == LocationType.bin,
      LocationType.rack => child == LocationType.shelf || child == LocationType.bin,
      LocationType.shelf => child == LocationType.bin,
      LocationType.bin => false, // Bins can't have children
    };
  }
  
  String _generateId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }
  
  Future<String> _generateWarehouseCode(String name) async {
    final prefix = name.length >= 3 ? name.substring(0, 3).toUpperCase() : name.toUpperCase();
    final sequence = await _db.getNextSequence('warehouse_code');
    return '$prefix${sequence.toString().padLeft(3, '0')}';
  }
  
  Future<String> _generateLocationCode(String warehouseId, LocationType type) async {
    final prefix = switch (type) {
      LocationType.warehouse => 'WH',
      LocationType.zone => 'ZN',
      LocationType.rack => 'RK',
      LocationType.shelf => 'SH',
      LocationType.bin => 'BN',
    };
    
    final sequence = await _db.getNextSequence('location_${warehouseId}_$prefix');
    return '$prefix-${sequence.toString().padLeft(4, '0')}';
  }
}
