/// ============================================================
/// BASE REPOSITORY - Repository pattern foundation
/// ============================================================
/// 
/// Defines the base repository interface and common query operations.
/// All entity-specific repositories extend this base.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../core/types/result.dart';
import '../database/database_connection.dart';

/// Pagination parameters
class PageRequest {
  final int page;
  final int size;
  final String? sortBy;
  final bool descending;
  
  const PageRequest({
    this.page = 1,
    this.size = 50,
    this.sortBy,
    this.descending = false,
  });
  
  int get offset => (page - 1) * size;
  
  String get orderClause {
    if (sortBy == null) return '';
    return 'ORDER BY $sortBy ${descending ? 'DESC' : 'ASC'}';
  }
}

/// Paginated result
class PageResult<T> {
  final List<T> items;
  final int totalCount;
  final int page;
  final int totalPages;
  final bool hasNext;
  final bool hasPrevious;
  
  const PageResult({
    required this.items,
    required this.totalCount,
    required this.page,
    required this.totalPages,
    required this.hasNext,
    required this.hasPrevious,
  });
  
  factory PageResult.fromList(List<T> items, int totalCount, PageRequest request) {
    final totalPages = (totalCount / request.size).ceil();
    return PageResult(
      items: items,
      totalCount: totalCount,
      page: request.page,
      totalPages: totalPages,
      hasNext: request.page < totalPages,
      hasPrevious: request.page > 1,
    );
  }
  
  PageResult<R> map<R>(R Function(T) mapper) {
    return PageResult<R>(
      items: items.map(mapper).toList(),
      totalCount: totalCount,
      page: page,
      totalPages: totalPages,
      hasNext: hasNext,
      hasPrevious: hasPrevious,
    );
  }
}

/// Query filter
class QueryFilter {
  final String field;
  final FilterOperator operator;
  final dynamic value;
  
  const QueryFilter({
    required this.field,
    required this.operator,
    required this.value,
  });
  
  String toSql() {
    switch (operator) {
      case FilterOperator.equals:
        return '$field = ?';
      case FilterOperator.notEquals:
        return '$field != ?';
      case FilterOperator.greaterThan:
        return '$field > ?';
      case FilterOperator.greaterOrEqual:
        return '$field >= ?';
      case FilterOperator.lessThan:
        return '$field < ?';
      case FilterOperator.lessOrEqual:
        return '$field <= ?';
      case FilterOperator.like:
        return '$field LIKE ?';
      case FilterOperator.notLike:
        return '$field NOT LIKE ?';
      case FilterOperator.isNull:
        return '$field IS NULL';
      case FilterOperator.isNotNull:
        return '$field IS NOT NULL';
      case FilterOperator.inList:
        final placeholders = List.filled((value as List).length, '?').join(', ');
        return '$field IN ($placeholders)';
      case FilterOperator.notInList:
        final placeholders = List.filled((value as List).length, '?').join(', ');
        return '$field NOT IN ($placeholders)';
      case FilterOperator.between:
        return '$field BETWEEN ? AND ?';
    }
  }
  
  List<dynamic> getValues() {
    switch (operator) {
      case FilterOperator.isNull:
      case FilterOperator.isNotNull:
        return [];
      case FilterOperator.inList:
      case FilterOperator.notInList:
        return value as List;
      case FilterOperator.between:
        final range = value as List;
        return [range[0], range[1]];
      default:
        return [value];
    }
  }
}

enum FilterOperator {
  equals,
  notEquals,
  greaterThan,
  greaterOrEqual,
  lessThan,
  lessOrEqual,
  like,
  notLike,
  isNull,
  isNotNull,
  inList,
  notInList,
  between,
}

/// Base repository interface
abstract class BaseRepository<T> {
  String get tableName;
  T fromMap(Map<String, dynamic> map);
  Map<String, dynamic> toMap(T entity);
  
  DatabaseConnection get db => DatabaseConnection.instance;
  
  /// Get all entities
  Future<Result<List<T>>> getAll({
    String? where,
    List<Object?>? whereArgs,
    String? orderBy,
    int? limit,
    int? offset,
  }) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: orderBy,
        limit: limit,
        offset: offset,
      );
      
      final entities = results.map((row) => fromMap(row)).toList();
      return Result.success(entities);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch from $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Get paginated entities
  Future<Result<PageResult<T>>> getPaginated(
    PageRequest request, {
    String? where,
    List<Object?>? whereArgs,
    String? orderBy,
  }) async {
    try {
      final database = await db.database;
      
      // Get total count
      final countResult = await database.rawQuery(
        'SELECT COUNT(*) as count FROM $tableName ${where != null ? 'WHERE $where' : ''}',
        whereArgs,
      );
      final totalCount = (countResult.isNotEmpty && countResult.first.containsKey('count')) 
          ? (countResult.first['count'] as int?) ?? 0 
          : 0;
      
      // Get page data
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs,
        orderBy: orderBy ?? (request.orderClause.isNotEmpty 
            ? request.orderClause.replaceFirst('ORDER BY ', '') 
            : null),
        limit: request.size,
        offset: request.offset,
      );
      
      final entities = results.map((row) => fromMap(row)).toList();
      return Result.success(PageResult.fromList(entities, totalCount, request));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch paginated from $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Get entity by ID
  Future<Result<T?>> getById(String id) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'id = ?',
        whereArgs: [id],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch $tableName by ID: $e',
        error: e,
      ));
    }
  }
  
  /// Insert entity
  Future<Result<T>> insert(T entity) async {
    try {
      final database = await db.database;
      final map = toMap(entity);
      await database.insert(tableName, map);
      return Result.success(entity);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to insert into $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Insert multiple entities
  Future<Result<int>> insertBatch(List<T> entities) async {
    try {
      final database = await db.database;
      int count = 0;
      
      await database.transaction((txn) async {
        final batch = txn.batch();
        for (final entity in entities) {
          batch.insert(tableName, toMap(entity));
          count++;
        }
        await batch.commit(noResult: true);
      });
      
      return Result.success(count);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to batch insert into $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Update entity
  Future<Result<int>> update(T entity, String id) async {
    try {
      final database = await db.database;
      final map = toMap(entity);
      final count = await database.update(
        tableName,
        map,
        where: 'id = ?',
        whereArgs: [id],
      );
      return Result.success(count);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Delete entity by ID
  Future<Result<int>> delete(String id) async {
    try {
      final database = await db.database;
      final count = await database.delete(
        tableName,
        where: 'id = ?',
        whereArgs: [id],
      );
      return Result.success(count);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to delete from $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Soft delete entity
  Future<Result<int>> softDelete(String id, String? deletedBy) async {
    try {
      final database = await db.database;
      final now = DateTime.now().toIso8601String();
      final count = await database.update(
        tableName,
        {
          'isDeleted': 1,
          'deletedAt': now,
          'deletedBy': deletedBy,
          'updatedAt': now,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
      return Result.success(count);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to soft delete from $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Count entities
  Future<Result<int>> count({String? where, List<Object?>? whereArgs}) async {
    try {
      final database = await db.database;
      final result = await database.rawQuery(
        'SELECT COUNT(*) as count FROM $tableName ${where != null ? 'WHERE $where' : ''}',
        whereArgs,
      );
      final count = (result.isNotEmpty && result.first.containsKey('count')) 
          ? (result.first['count'] as int?) ?? 0 
          : 0;
      return Result.success(count);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to count $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Check if entity exists
  Future<Result<bool>> exists(String id) async {
    try {
      final database = await db.database;
      final result = await database.rawQuery(
        'SELECT 1 FROM $tableName WHERE id = ? LIMIT 1',
        [id],
      );
      return Result.success(result.isNotEmpty);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to check existence in $tableName: $e',
        error: e,
      ));
    }
  }
  
  /// Execute raw query
  Future<Result<List<Map<String, dynamic>>>> rawQuery(
    String sql, [
    List<Object?>? arguments,
  ]) async {
    try {
      final database = await db.database;
      final results = await database.rawQuery(sql, arguments);
      return Result.success(results);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to execute raw query: $e',
        error: e,
      ));
    }
  }
  
  /// Execute in transaction
  Future<Result<T>> withTransaction<T>(
    Future<T> Function(Transaction txn) action,
  ) async {
    try {
      final database = await db.database;
      final result = await database.transaction(action);
      return Result.success(result);
    } catch (e) {
      return Result.failure(Failure.database(
        'Transaction failed: $e',
        error: e,
      ));
    }
  }
}
