/// ============================================================
/// LOCATION REPOSITORY - Data access for warehouses and locations
/// ============================================================
/// 
/// Handles all database operations for warehouses and their
/// hierarchical storage locations.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/warehouse.dart';
import 'base_repository.dart';

/// Repository for Warehouse entities
class WarehouseRepository extends BaseRepository<Warehouse> {
  @override
  String get tableName => 'warehouses';
  
  @override
  Warehouse fromMap(Map<String, dynamic> map) => Warehouse.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(Warehouse entity) => entity.toMap();
  
  /// Get warehouse by code
  Future<Result<Warehouse?>> getByCode(String code) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'code = ? AND isDeleted = 0',
        whereArgs: [code.toUpperCase()],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch warehouse by code: $e',
        error: e,
      ));
    }
  }
  
  /// Get all active warehouses
  Future<Result<List<Warehouse>>> getActiveWarehouses() async {
    return getAll(
      where: 'isActive = 1 AND isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Check if warehouse code exists
  Future<Result<bool>> codeExists(String code, {String? excludeId}) async {
    try {
      final database = await db.database;
      String where = 'code = ?';
      List<Object?> whereArgs = [code.toUpperCase()];
      
      if (excludeId != null) {
        where += ' AND id != ?';
        whereArgs.add(excludeId);
      }
      
      final result = await database.rawQuery(
        'SELECT 1 FROM $tableName WHERE $where LIMIT 1',
        whereArgs,
      );
      
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check warehouse code: $e',
        error: e,
      ));
    }
  }
  
  /// Get warehouse statistics
  Future<Result<Map<String, dynamic>>> getWarehouseStats(String warehouseId) async {
    try {
      final database = await db.database;
      
      final result = await database.rawQuery('''
        SELECT 
          (SELECT COUNT(*) FROM locations WHERE warehouseId = ? AND isDeleted = 0) as locationCount,
          (SELECT COUNT(DISTINCT itemId) FROM stock WHERE warehouseId = ? AND quantity > 0) as itemCount,
          (SELECT COALESCE(SUM(quantity), 0) FROM stock WHERE warehouseId = ?) as totalStock
      ''', [warehouseId, warehouseId, warehouseId]);
      
      return Result.success(Map<String, dynamic>.from(result.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get warehouse stats: $e',
        error: e,
      ));
    }
  }
}

/// Repository for StorageLocation entities
class LocationRepository extends BaseRepository<StorageLocation> {
  @override
  String get tableName => 'locations';
  
  @override
  StorageLocation fromMap(Map<String, dynamic> map) => StorageLocation.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(StorageLocation entity) => entity.toMap();
  
  // =====================================================
  // BASIC QUERIES
  // =====================================================
  
  /// Get location by code within a warehouse
  Future<Result<StorageLocation?>> getByCode(
    String warehouseId,
    String code,
  ) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'warehouseId = ? AND code = ? AND isDeleted = 0',
        whereArgs: [warehouseId, code.toUpperCase()],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch location by code: $e',
        error: e,
      ));
    }
  }
  
  /// Get location by barcode
  Future<Result<StorageLocation?>> getByBarcode(String barcode) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'barcode = ? AND isDeleted = 0',
        whereArgs: [barcode],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch location by barcode: $e',
        error: e,
      ));
    }
  }
  
  /// Get all locations in a warehouse
  Future<Result<List<StorageLocation>>> getByWarehouse(
    String warehouseId, {
    LocationType? type,
    bool activeOnly = true,
  }) async {
    String where = 'warehouseId = ? AND isDeleted = 0';
    List<Object?> whereArgs = [warehouseId];
    
    if (type != null) {
      where += ' AND type = ?';
      whereArgs.add(type.name);
    }
    
    if (activeOnly) {
      where += ' AND isActive = 1';
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'fullPath ASC',
    );
  }
  
  // =====================================================
  // HIERARCHY QUERIES
  // =====================================================
  
  /// Get children of a location (direct descendants)
  Future<Result<List<StorageLocation>>> getChildren(String parentId) async {
    return getAll(
      where: 'parentId = ? AND isDeleted = 0',
      whereArgs: [parentId],
      orderBy: 'sortOrder ASC, name ASC',
    );
  }
  
  /// Get root locations (zones) in a warehouse
  Future<Result<List<StorageLocation>>> getRootLocations(
    String warehouseId,
  ) async {
    return getAll(
      where: 'warehouseId = ? AND parentId IS NULL AND isDeleted = 0',
      whereArgs: [warehouseId],
      orderBy: 'sortOrder ASC, name ASC',
    );
  }
  
  /// Get all descendants of a location (recursive)
  Future<Result<List<StorageLocation>>> getDescendants(String locationId) async {
    try {
      final database = await db.database;
      
      // Use recursive CTE to get all descendants
      final results = await database.rawQuery('''
        WITH RECURSIVE descendants AS (
          SELECT * FROM $tableName WHERE id = ?
          UNION ALL
          SELECT l.* FROM $tableName l
          INNER JOIN descendants d ON l.parentId = d.id
        )
        SELECT * FROM descendants WHERE id != ? AND isDeleted = 0
        ORDER BY level, fullPath
      ''', [locationId, locationId]);
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get descendants: $e',
        error: e,
      ));
    }
  }
  
  /// Get ancestors (path to root)
  Future<Result<List<StorageLocation>>> getAncestors(String locationId) async {
    try {
      final database = await db.database;
      
      // Use recursive CTE to get all ancestors
      final results = await database.rawQuery('''
        WITH RECURSIVE ancestors AS (
          SELECT * FROM $tableName WHERE id = ?
          UNION ALL
          SELECT l.* FROM $tableName l
          INNER JOIN ancestors a ON l.id = a.parentId
        )
        SELECT * FROM ancestors WHERE id != ?
        ORDER BY level ASC
      ''', [locationId, locationId]);
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get ancestors: $e',
        error: e,
      ));
    }
  }
  
  /// Get full hierarchy tree for a warehouse
  Future<Result<List<StorageLocation>>> getHierarchy(String warehouseId) async {
    return getAll(
      where: 'warehouseId = ? AND isDeleted = 0',
      whereArgs: [warehouseId],
      orderBy: 'level ASC, sortOrder ASC, name ASC',
    );
  }
  
  /// Get locations by type
  Future<Result<List<StorageLocation>>> getByType(
    String warehouseId,
    LocationType type,
  ) async {
    return getAll(
      where: 'warehouseId = ? AND type = ? AND isDeleted = 0',
      whereArgs: [warehouseId, type.name],
      orderBy: 'fullPath ASC',
    );
  }
  
  /// Get pickable locations (bins - leaf nodes)
  Future<Result<List<StorageLocation>>> getPickableLocations(
    String warehouseId,
  ) async {
    return getAll(
      where: 'warehouseId = ? AND isPickable = 1 AND isActive = 1 AND isDeleted = 0',
      whereArgs: [warehouseId],
      orderBy: 'fullPath ASC',
    );
  }
  
  // =====================================================
  // SEARCH & FILTER
  // =====================================================
  
  /// Search locations by name, code, or barcode
  Future<Result<List<StorageLocation>>> search(
    String query, {
    String? warehouseId,
    LocationType? type,
    int limit = 50,
  }) async {
    try {
      final database = await db.database;
      final searchPattern = '%${query.toLowerCase()}%';
      
      String where = '(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR barcode LIKE ?) AND isDeleted = 0';
      List<Object?> whereArgs = [searchPattern, searchPattern, query];
      
      if (warehouseId != null) {
        where += ' AND warehouseId = ?';
        whereArgs.add(warehouseId);
      }
      
      if (type != null) {
        where += ' AND type = ?';
        whereArgs.add(type.name);
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: 'fullPath ASC',
        limit: limit,
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to search locations: $e',
        error: e,
      ));
    }
  }
  
  /// Get empty locations (no stock)
  Future<Result<List<StorageLocation>>> getEmptyLocations(
    String warehouseId,
  ) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT l.* FROM $tableName l
        LEFT JOIN stock s ON l.id = s.locationId AND s.quantity > 0
        WHERE l.warehouseId = ? 
          AND l.isPickable = 1 
          AND l.isActive = 1 
          AND l.isDeleted = 0
          AND s.id IS NULL
        ORDER BY l.fullPath ASC
      ''', [warehouseId]);
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get empty locations: $e',
        error: e,
      ));
    }
  }
  
  /// Get locations with available capacity
  Future<Result<List<StorageLocation>>> getAvailableLocations(
    String warehouseId, {
    double? minCapacity,
  }) async {
    try {
      final database = await db.database;
      
      String sql = '''
        SELECT l.*, 
          COALESCE(SUM(s.quantity), 0) as usedCapacity,
          l.maxCapacity - COALESCE(SUM(s.quantity), 0) as availableCapacity
        FROM $tableName l
        LEFT JOIN stock s ON l.id = s.locationId
        WHERE l.warehouseId = ? 
          AND l.isPickable = 1 
          AND l.isActive = 1 
          AND l.isDeleted = 0
        GROUP BY l.id
        HAVING availableCapacity > 0
      ''';
      
      List<Object?> args = [warehouseId];
      
      if (minCapacity != null) {
        sql += ' AND availableCapacity >= ?';
        args.add(minCapacity);
      }
      
      sql += ' ORDER BY availableCapacity DESC';
      
      final results = await database.rawQuery(sql, args);
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get available locations: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // VALIDATION
  // =====================================================
  
  /// Check if location code exists in warehouse
  Future<Result<bool>> codeExists(
    String warehouseId,
    String code, {
    String? excludeId,
  }) async {
    try {
      final database = await db.database;
      String where = 'warehouseId = ? AND code = ?';
      List<Object?> whereArgs = [warehouseId, code.toUpperCase()];
      
      if (excludeId != null) {
        where += ' AND id != ?';
        whereArgs.add(excludeId);
      }
      
      final result = await database.rawQuery(
        'SELECT 1 FROM $tableName WHERE $where LIMIT 1',
        whereArgs,
      );
      
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check location code: $e',
        error: e,
      ));
    }
  }
  
  /// Check if barcode exists
  Future<Result<bool>> barcodeExists(String barcode, {String? excludeId}) async {
    try {
      final database = await db.database;
      String where = 'barcode = ?';
      List<Object?> whereArgs = [barcode];
      
      if (excludeId != null) {
        where += ' AND id != ?';
        whereArgs.add(excludeId);
      }
      
      final result = await database.rawQuery(
        'SELECT 1 FROM $tableName WHERE $where LIMIT 1',
        whereArgs,
      );
      
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check location barcode: $e',
        error: e,
      ));
    }
  }
  
  /// Check if location has stock (before deletion)
  Future<Result<bool>> hasStock(String locationId) async {
    try {
      final database = await db.database;
      
      final result = await database.rawQuery('''
        SELECT 1 FROM stock 
        WHERE locationId = ? AND quantity > 0 
        LIMIT 1
      ''', [locationId]);
      
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check location stock: $e',
        error: e,
      ));
    }
  }
  
  /// Check if location has children
  Future<Result<bool>> hasChildren(String locationId) async {
    try {
      final database = await db.database;
      
      final result = await database.rawQuery(
        'SELECT 1 FROM $tableName WHERE parentId = ? AND isDeleted = 0 LIMIT 1',
        [locationId],
      );
      
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check children: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // STATISTICS
  // =====================================================
  
  /// Get location count by type for a warehouse
  Future<Result<Map<LocationType, int>>> getCountByType(
    String warehouseId,
  ) async {
    try {
      final database = await db.database;
      
      final results = await database.rawQuery('''
        SELECT type, COUNT(*) as count 
        FROM $tableName 
        WHERE warehouseId = ? AND isDeleted = 0 
        GROUP BY type
      ''', [warehouseId]);
      
      final map = <LocationType, int>{};
      for (final row in results) {
        final type = LocationType.values.firstWhere(
          (t) => t.name == row['type'],
          orElse: () => LocationType.bin,
        );
        map[type] = row['count'] as int;
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get count by type: $e',
        error: e,
      ));
    }
  }
  
  /// Get location utilization statistics
  Future<Result<Map<String, dynamic>>> getUtilization(
    String warehouseId,
  ) async {
    try {
      final database = await db.database;
      
      final result = await database.rawQuery('''
        SELECT 
          COUNT(*) as totalLocations,
          SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeLocations,
          SUM(CASE WHEN isPickable = 1 THEN 1 ELSE 0 END) as pickableLocations,
          (
            SELECT COUNT(DISTINCT locationId) 
            FROM stock 
            WHERE warehouseId = ? AND quantity > 0
          ) as usedLocations
        FROM $tableName
        WHERE warehouseId = ? AND isDeleted = 0
      ''', [warehouseId, warehouseId]);
      
      return Result.success(Map<String, dynamic>.from(result.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get utilization: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // PATH MANAGEMENT
  // =====================================================
  
  /// Rebuild full path for location and descendants
  Future<Result<void>> rebuildPaths(String locationId) async {
    try {
      final database = await db.database;
      
      // Get the location
      final locResult = await getById(locationId);
      if (locResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      
      final location = (locResult as Success).data;
      if (location == null) {
        return Result.failure(Failure.notFound('Location', locationId));
      }
      
      // Build new path
      String newPath;
      if (location.parentId == null) {
        newPath = location.name;
      } else {
        final ancestorsResult = await getAncestors(locationId);
        if (ancestorsResult case Failed(:final failure)) {
          return Result.failure(failure);
        }
        
        final ancestors = (ancestorsResult as Success).data;
        newPath = [...ancestors.map((a) => a.name), location.name].join(' > ');
      }
      
      // Update this location
      await database.update(
        tableName,
        {'fullPath': newPath},
        where: 'id = ?',
        whereArgs: [locationId],
      );
      
      // Update all descendants recursively
      final descendantsResult = await getDescendants(locationId);
      if (descendantsResult case Failed(:final failure)) {
        return Result.failure(failure);
      }
      
      final descendants = (descendantsResult as Success).data;
      for (final desc in descendants) {
        await rebuildPaths(desc.id);
      }
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to rebuild paths: $e',
        error: e,
      ));
    }
  }
}
