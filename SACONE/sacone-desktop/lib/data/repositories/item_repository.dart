/// ============================================================
/// ITEM REPOSITORY - Data access for inventory items
/// ============================================================
/// 
/// Handles all database operations for inventory items.
/// Includes search, filtering, and stock status queries.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/item.dart';
import 'base_repository.dart';

/// Repository for Item entities
class ItemRepository extends BaseRepository<Item> {
  @override
  String get tableName => 'items';
  
  @override
  Item fromMap(Map<String, dynamic> map) => Item.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(Item entity) => entity.toMap();
  
  /// Get item by SKU/code
  Future<Result<Item?>> getByCode(String code) async {
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
        'Failed to fetch item by code: $e',
        error: e,
      ));
    }
  }
  
  /// Get item by barcode
  Future<Result<Item?>> getByBarcode(String barcode) async {
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
        'Failed to fetch item by barcode: $e',
        error: e,
      ));
    }
  }
  
  /// Search items by name, code, or barcode
  Future<Result<List<Item>>> search(
    String query, {
    int limit = 50,
    String? category,
    bool? isActive,
  }) async {
    try {
      final database = await db.database;
      final searchPattern = '%${query.toLowerCase()}%';
      
      String where = '(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR barcode LIKE ?) AND isDeleted = 0';
      List<Object?> whereArgs = [searchPattern, searchPattern, query];
      
      if (category != null) {
        where += ' AND category = ?';
        whereArgs.add(category);
      }
      
      if (isActive != null) {
        where += ' AND isActive = ?';
        whereArgs.add(isActive ? 1 : 0);
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: 'name ASC',
        limit: limit,
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to search items: $e',
        error: e,
      ));
    }
  }
  
  /// Get items by category
  Future<Result<List<Item>>> getByCategory(
    String category, {
    PageRequest? page,
  }) async {
    return getAll(
      where: 'category = ? AND isDeleted = 0',
      whereArgs: [category],
      orderBy: 'name ASC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get all active items
  Future<Result<List<Item>>> getActiveItems({
    PageRequest? page,
    String? orderBy,
  }) async {
    return getAll(
      where: 'isActive = 1 AND isDeleted = 0',
      orderBy: orderBy ?? 'name ASC',
      limit: page?.size,
      offset: page?.offset,
    );
  }
  
  /// Get all categories
  Future<Result<List<String>>> getCategories() async {
    try {
      final database = await db.database;
      final results = await database.rawQuery(
        'SELECT DISTINCT category FROM $tableName WHERE isDeleted = 0 ORDER BY category',
      );
      
      return Result.success(
        results.map((row) => row['category'] as String).toList(),
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch categories: $e',
        error: e,
      ));
    }
  }
  
  /// Get all brands
  Future<Result<List<String>>> getBrands() async {
    try {
      final database = await db.database;
      final results = await database.rawQuery(
        'SELECT DISTINCT brand FROM $tableName WHERE brand IS NOT NULL AND isDeleted = 0 ORDER BY brand',
      );
      
      return Result.success(
        results.map((row) => row['brand'] as String).toList(),
      );
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch brands: $e',
        error: e,
      ));
    }
  }
  
  /// Get items requiring batch tracking
  Future<Result<List<Item>>> getBatchRequiredItems() async {
    return getAll(
      where: 'isBatchRequired = 1 AND isActive = 1 AND isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Get items requiring expiry tracking
  Future<Result<List<Item>>> getExpiryRequiredItems() async {
    return getAll(
      where: 'isExpiryRequired = 1 AND isActive = 1 AND isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Check if SKU exists
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
        'Failed to check code existence: $e',
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
        'Failed to check barcode existence: $e',
        error: e,
      ));
    }
  }
  
  /// Get item count by category
  Future<Result<Map<String, int>>> getCountByCategory() async {
    try {
      final database = await db.database;
      final results = await database.rawQuery('''
        SELECT category, COUNT(*) as count 
        FROM $tableName 
        WHERE isDeleted = 0 
        GROUP BY category 
        ORDER BY count DESC
      ''');
      
      final map = <String, int>{};
      for (final row in results) {
        map[row['category'] as String] = row['count'] as int;
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get count by category: $e',
        error: e,
      ));
    }
  }
  
  /// Get total item count
  Future<Result<int>> getTotalCount({bool activeOnly = true}) async {
    String where = 'isDeleted = 0';
    if (activeOnly) {
      where += ' AND isActive = 1';
    }
    return count(where: where);
  }
  
  /// Get recently updated items
  Future<Result<List<Item>>> getRecentlyUpdated({int limit = 10}) async {
    return getAll(
      where: 'isDeleted = 0',
      orderBy: 'updatedAt DESC',
      limit: limit,
    );
  }
}
