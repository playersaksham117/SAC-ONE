/// ============================================================
/// USER REPOSITORY - Data access for users and authentication
/// ============================================================
/// 
/// Handles all database operations for users, sessions,
/// and role-based access control.
/// 
/// Architecture: Data Layer (Repository Pattern)
/// ============================================================

import '../../core/types/result.dart';
import '../../domain/entities/user.dart';
import 'base_repository.dart';

/// Repository for User entities
class UserRepository extends BaseRepository<User> {
  @override
  String get tableName => 'users';
  
  @override
  User fromMap(Map<String, dynamic> map) => User.fromMap(map);
  
  @override
  Map<String, dynamic> toMap(User entity) => entity.toMap();
  
  // =====================================================
  // AUTHENTICATION QUERIES
  // =====================================================
  
  /// Get user by username (for login)
  Future<Result<User?>> getByUsername(String username) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'username = ? AND isDeleted = 0',
        whereArgs: [username.toLowerCase()],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch user by username: $e',
        error: e,
      ));
    }
  }
  
  /// Get user by employee ID
  Future<Result<User?>> getByEmployeeId(String employeeId) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'employeeId = ? AND isDeleted = 0',
        whereArgs: [employeeId],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch user by employee ID: $e',
        error: e,
      ));
    }
  }
  
  /// Get user by PIN (for quick access)
  Future<Result<User?>> getByPin(String pinHash) async {
    try {
      final database = await db.database;
      final results = await database.query(
        tableName,
        where: 'pinHash = ? AND isActive = 1 AND isDeleted = 0',
        whereArgs: [pinHash],
        limit: 1,
      );
      
      if (results.isEmpty) {
        return Result.success(null);
      }
      
      return Result.success(fromMap(results.first));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to fetch user by PIN: $e',
        error: e,
      ));
    }
  }
  
  /// Update last login time
  Future<Result<void>> updateLastLogin(String userId) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'lastLoginAt': DateTime.now().toIso8601String(),
          'loginAttempts': 0, // Reset on successful login
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update last login: $e',
        error: e,
      ));
    }
  }
  
  /// Increment login attempts (for lockout)
  Future<Result<int>> incrementLoginAttempts(String userId) async {
    try {
      final database = await db.database;
      await database.rawUpdate('''
        UPDATE $tableName 
        SET loginAttempts = loginAttempts + 1,
            updatedAt = ?
        WHERE id = ?
      ''', [DateTime.now().toIso8601String(), userId]);
      
      // Get new attempts count
      final result = await database.query(
        tableName,
        columns: ['loginAttempts'],
        where: 'id = ?',
        whereArgs: [userId],
      );
      
      final attempts = result.isNotEmpty
          ? (result.first['loginAttempts'] as int)
          : 0;
      
      return Result.success(attempts);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to increment login attempts: $e',
        error: e,
      ));
    }
  }
  
  /// Lock user account
  Future<Result<void>> lockAccount(String userId, DateTime until) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'lockedUntil': until.toIso8601String(),
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to lock account: $e',
        error: e,
      ));
    }
  }
  
  /// Unlock user account
  Future<Result<void>> unlockAccount(String userId) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'lockedUntil': null,
          'loginAttempts': 0,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to unlock account: $e',
        error: e,
      ));
    }
  }
  
  /// Reset login attempts
  Future<Result<void>> resetLoginAttempts(String userId) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'loginAttempts': 0,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to reset login attempts: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // ROLE-BASED QUERIES
  // =====================================================
  
  /// Get users by role
  Future<Result<List<User>>> getByRole(
    UserRole role, {
    bool activeOnly = true,
  }) async {
    String where = 'role = ? AND isDeleted = 0';
    List<Object?> whereArgs = [role.name];
    
    if (activeOnly) {
      where += ' AND isActive = 1';
    }
    
    return getAll(
      where: where,
      whereArgs: whereArgs,
      orderBy: 'name ASC',
    );
  }
  
  /// Get all admins
  Future<Result<List<User>>> getAdmins() async {
    return getByRole(UserRole.admin);
  }
  
  /// Get all managers
  Future<Result<List<User>>> getManagers() async {
    return getByRole(UserRole.manager);
  }
  
  /// Get all operators
  Future<Result<List<User>>> getOperators() async {
    return getByRole(UserRole.operator);
  }
  
  // =====================================================
  // WAREHOUSE ASSIGNMENT QUERIES
  // =====================================================
  
  /// Get users assigned to a warehouse
  Future<Result<List<User>>> getByWarehouse(
    String warehouseId, {
    UserRole? role,
    bool activeOnly = true,
  }) async {
    try {
      final database = await db.database;
      
      String where = "(assignedWarehouses LIKE '%\"$warehouseId\"%' OR assignedWarehouses LIKE '%$warehouseId%') AND isDeleted = 0";
      List<Object?> whereArgs = [];
      
      if (role != null) {
        where += ' AND role = ?';
        whereArgs.add(role.name);
      }
      
      if (activeOnly) {
        where += ' AND isActive = 1';
      }
      
      final results = await database.query(
        tableName,
        where: where,
        whereArgs: whereArgs.isEmpty ? null : whereArgs,
        orderBy: 'name ASC',
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get users by warehouse: $e',
        error: e,
      ));
    }
  }
  
  /// Update user's assigned warehouses
  Future<Result<void>> updateAssignedWarehouses(
    String userId,
    List<String> warehouseIds,
  ) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'assignedWarehouses': warehouseIds.join(','),
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update assigned warehouses: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // USER MANAGEMENT
  // =====================================================
  
  /// Get all active users
  Future<Result<List<User>>> getActiveUsers() async {
    return getAll(
      where: 'isActive = 1 AND isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Get inactive users
  Future<Result<List<User>>> getInactiveUsers() async {
    return getAll(
      where: 'isActive = 0 AND isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Get locked users
  Future<Result<List<User>>> getLockedUsers() async {
    try {
      final database = await db.database;
      final now = DateTime.now().toIso8601String();
      
      final results = await database.query(
        tableName,
        where: 'lockedUntil IS NOT NULL AND lockedUntil > ? AND isDeleted = 0',
        whereArgs: [now],
        orderBy: 'name ASC',
      );
      
      return Result.success(results.map((row) => fromMap(row)).toList());
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get locked users: $e',
        error: e,
      ));
    }
  }
  
  /// Set user active/inactive
  Future<Result<void>> setActive(String userId, bool isActive) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'isActive': isActive ? 1 : 0,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to set user active state: $e',
        error: e,
      ));
    }
  }
  
  /// Update user role
  Future<Result<void>> updateRole(String userId, UserRole newRole) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'role': newRole.name,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update user role: $e',
        error: e,
      ));
    }
  }
  
  /// Update password hash
  Future<Result<void>> updatePassword(
    String userId,
    String newPasswordHash,
  ) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'passwordHash': newPasswordHash,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update password: $e',
        error: e,
      ));
    }
  }
  
  /// Update PIN hash
  Future<Result<void>> updatePin(String userId, String? newPinHash) async {
    try {
      final database = await db.database;
      await database.update(
        tableName,
        {
          'pinHash': newPinHash,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [userId],
      );
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to update PIN: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // VALIDATION
  // =====================================================
  
  /// Check if username exists
  Future<Result<bool>> usernameExists(
    String username, {
    String? excludeId,
  }) async {
    try {
      final database = await db.database;
      String where = 'LOWER(username) = ?';
      List<Object?> whereArgs = [username.toLowerCase()];
      
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
        'Failed to check username: $e',
        error: e,
      ));
    }
  }
  
  /// Check if employee ID exists
  Future<Result<bool>> employeeIdExists(
    String employeeId, {
    String? excludeId,
  }) async {
    try {
      final database = await db.database;
      String where = 'employeeId = ?';
      List<Object?> whereArgs = [employeeId];
      
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
        'Failed to check employee ID: $e',
        error: e,
      ));
    }
  }
  
  // =====================================================
  // STATISTICS
  // =====================================================
  
  /// Get user count by role
  Future<Result<Map<UserRole, int>>> getCountByRole() async {
    try {
      final database = await db.database;
      final results = await database.rawQuery('''
        SELECT role, COUNT(*) as count 
        FROM $tableName 
        WHERE isDeleted = 0 
        GROUP BY role
      ''');
      
      final map = <UserRole, int>{};
      for (final row in results) {
        final role = UserRole.values.firstWhere(
          (r) => r.name == row['role'],
          orElse: () => UserRole.viewer,
        );
        map[role] = row['count'] as int;
      }
      
      return Result.success(map);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get count by role: $e',
        error: e,
      ));
    }
  }
  
  /// Get total active user count
  Future<Result<int>> getActiveCount() async {
    return count(where: 'isActive = 1 AND isDeleted = 0');
  }
  
  /// Search users by name or username
  Future<Result<List<User>>> search(
    String query, {
    UserRole? role,
    bool activeOnly = true,
    int limit = 50,
  }) async {
    try {
      final database = await db.database;
      final searchPattern = '%${query.toLowerCase()}%';
      
      String where = '(LOWER(name) LIKE ? OR LOWER(username) LIKE ? OR employeeId LIKE ?) AND isDeleted = 0';
      List<Object?> whereArgs = [searchPattern, searchPattern, query];
      
      if (role != null) {
        where += ' AND role = ?';
        whereArgs.add(role.name);
      }
      
      if (activeOnly) {
        where += ' AND isActive = 1';
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
        'Failed to search users: $e',
        error: e,
      ));
    }
  }
}

/// Repository for audit log entries
class AuditLogRepository extends BaseRepository<Map<String, dynamic>> {
  @override
  String get tableName => 'audit_log';
  
  @override
  Map<String, dynamic> fromMap(Map<String, dynamic> map) => map;
  
  @override
  Map<String, dynamic> toMap(Map<String, dynamic> entity) => entity;
  
  /// Log an action
  Future<Result<void>> logAction({
    required String userId,
    required String action,
    required String tableName,
    String? recordId,
    Map<String, dynamic>? oldValues,
    Map<String, dynamic>? newValues,
  }) async {
    try {
      final database = await db.database;
      
      await database.insert('audit_log', {
        'id': DateTime.now().microsecondsSinceEpoch.toString(),
        'userId': userId,
        'action': action,
        'tableName': tableName,
        'recordId': recordId,
        'oldValues': oldValues?.toString(),
        'newValues': newValues?.toString(),
        'createdAt': DateTime.now().toIso8601String(),
      });
      
      return Result.success(null);
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to log action: $e',
        error: e,
      ));
    }
  }
  
  /// Get audit log for a record
  Future<Result<List<Map<String, dynamic>>>> getForRecord(
    String tableName,
    String recordId, {
    PageRequest? page,
  }) async {
    try {
      final database = await db.database;
      
      final results = await database.query(
        'audit_log',
        where: 'tableName = ? AND recordId = ?',
        whereArgs: [tableName, recordId],
        orderBy: 'createdAt DESC',
        limit: page?.size,
        offset: page?.offset,
      );
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get audit log: $e',
        error: e,
      ));
    }
  }
  
  /// Get audit log for a user
  Future<Result<List<Map<String, dynamic>>>> getForUser(
    String userId, {
    DateTime? startDate,
    DateTime? endDate,
    PageRequest? page,
  }) async {
    try {
      final database = await db.database;
      
      String where = 'userId = ?';
      List<Object?> whereArgs = [userId];
      
      if (startDate != null) {
        where += ' AND createdAt >= ?';
        whereArgs.add(startDate.toIso8601String());
      }
      
      if (endDate != null) {
        where += ' AND createdAt <= ?';
        whereArgs.add(endDate.toIso8601String());
      }
      
      final results = await database.query(
        'audit_log',
        where: where,
        whereArgs: whereArgs,
        orderBy: 'createdAt DESC',
        limit: page?.size,
        offset: page?.offset,
      );
      
      return Result.success(List<Map<String, dynamic>>.from(results));
    } catch (e) {
      return Result.failure(Failure.database(
        'Failed to get user audit log: $e',
        error: e,
      ));
    }
  }
}
