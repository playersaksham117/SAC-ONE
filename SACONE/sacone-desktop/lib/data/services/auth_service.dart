/// ============================================================
/// AUTH SERVICE - Authentication and authorization
/// ============================================================
/// 
/// Handles user authentication, session management,
/// and role-based access control.
/// 
/// Architecture: Service Layer
/// ============================================================

import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';

import '../../core/types/result.dart';
import '../../domain/entities/user.dart';
import '../repositories/user_repository.dart';

/// Service for authentication and authorization
class AuthService {
  final UserRepository _userRepo = UserRepository();
  final AuditLogRepository _auditRepo = AuditLogRepository();
  
  // Configuration
  static const int maxLoginAttempts = 5;
  static const Duration lockoutDuration = Duration(minutes: 15);
  static const Duration sessionTimeout = Duration(hours: 8);
  
  // Current session (in memory - for single-user desktop app)
  UserSession? _currentSession;
  User? _currentUser;
  
  /// Get current logged-in user
  User? get currentUser => _currentUser;
  
  /// Get current session
  UserSession? get currentSession => _currentSession;
  
  /// Check if user is logged in
  bool get isLoggedIn => _currentSession != null && _currentUser != null;
  
  // =====================================================
  // AUTHENTICATION
  // =====================================================
  
  /// Login with username and password
  Future<Result<User>> login(String username, String password) async {
    // Get user by username
    final userResult = await _userRepo.getByUsername(username);
    if (userResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final user = (userResult as Success).data;
    if (user == null) {
      return Result.failure(Failure.authentication('Invalid username or password'));
    }
    
    // Check if account is locked
    if (user.isLocked) {
      final remaining = user.lockedUntil!.difference(DateTime.now());
      return Result.failure(Failure.authentication(
        'Account is locked. Try again in ${remaining.inMinutes} minutes.',
      ));
    }
    
    // Check if account is active
    if (!user.isActive) {
      return Result.failure(Failure.authentication('Account is disabled'));
    }
    
    // Verify password
    final passwordHash = _hashPassword(password);
    if (passwordHash != user.passwordHash) {
      // Increment failed attempts
      final attempts = await _userRepo.incrementLoginAttempts(user.id);
      
      // Lock account if too many attempts
      if (attempts case Success(:final data) when data >= maxLoginAttempts) {
        await _userRepo.lockAccount(
          user.id,
          DateTime.now().add(lockoutDuration),
        );
        
        await _auditRepo.logAction(
          userId: user.id,
          action: 'ACCOUNT_LOCKED',
          tableName: 'users',
          recordId: user.id,
        );
        
        return Result.failure(Failure.authentication(
          'Account locked due to too many failed attempts',
        ));
      }
      
      return Result.failure(Failure.authentication('Invalid username or password'));
    }
    
    // Successful login
    await _userRepo.updateLastLogin(user.id);
    
    // Create session
    _currentSession = UserSession(
      user: user,
      sessionToken: _generateSessionId(),
      expiresAt: DateTime.now().add(sessionTimeout),
      deviceId: 'desktop',
      deviceName: 'Desktop App',
    );
    _currentUser = user;
    
    // Log successful login
    await _auditRepo.logAction(
      userId: user.id,
      action: 'LOGIN',
      tableName: 'users',
      recordId: user.id,
    );
    
    return Result.success(user);
  }
  
  /// Login with PIN (quick access)
  Future<Result<User>> loginWithPin(String pin) async {
    final pinHash = _hashPin(pin);
    final userResult = await _userRepo.getByPin(pinHash);
    
    if (userResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final user = (userResult as Success).data;
    if (user == null) {
      return Result.failure(Failure.authentication('Invalid PIN'));
    }
    
    if (!user.isActive) {
      return Result.failure(Failure.authentication('Account is disabled'));
    }
    
    if (user.isLocked) {
      return Result.failure(Failure.authentication('Account is locked'));
    }
    
    await _userRepo.updateLastLogin(user.id);
    
    // Create session (shorter for PIN login)
    _currentSession = UserSession(
      user: user,
      sessionToken: _generateSessionId(),
      expiresAt: DateTime.now().add(const Duration(hours: 4)),
      deviceId: 'desktop',
      deviceName: 'Desktop App (PIN)',
    );
    _currentUser = user;
    
    await _auditRepo.logAction(
      userId: user.id,
      action: 'PIN_LOGIN',
      tableName: 'users',
      recordId: user.id,
    );
    
    return Result.success(user);
  }
  
  /// Logout current user
  Future<Result<void>> logout() async {
    if (_currentUser != null) {
      await _auditRepo.logAction(
        userId: _currentUser!.id,
        action: 'LOGOUT',
        tableName: 'users',
        recordId: _currentUser!.id,
      );
    }
    
    _currentSession = null;
    _currentUser = null;
    
    return Result.success(null);
  }
  
  /// Check if session is valid
  bool isSessionValid() {
    if (_currentSession == null) return false;
    return DateTime.now().isBefore(_currentSession!.expiresAt);
  }
  
  /// Refresh session
  Future<Result<void>> refreshSession() async {
    if (_currentSession == null || _currentUser == null) {
      return Result.failure(Failure.authentication('No active session'));
    }
    
    // Update expiration
    _currentSession = UserSession(
      user: _currentUser!,
      sessionToken: _currentSession!.sessionToken,
      expiresAt: DateTime.now().add(sessionTimeout),
      deviceId: _currentSession!.deviceId,
      deviceName: _currentSession!.deviceName,
    );
    
    return Result.success(null);
  }
  
  // =====================================================
  // USER MANAGEMENT
  // =====================================================
  
  /// Create a new user
  Future<Result<User>> createUser({
    required String username,
    required String password,
    required String name,
    required UserRole role,
    String? employeeId,
    String? email,
    String? phone,
    String? pin,
    List<String>? assignedWarehouses,
  }) async {
    // Validate permissions
    if (!_hasPermission('manage_users')) {
      return Result.failure(Failure.authorization('Not authorized to create users'));
    }
    
    // Validate inputs
    if (username.length < 3) {
      return Result.failure(Failure.validation('Username must be at least 3 characters'));
    }
    
    if (password.length < 6) {
      return Result.failure(Failure.validation('Password must be at least 6 characters'));
    }
    
    // Check username uniqueness
    final usernameExists = await _userRepo.usernameExists(username);
    if (usernameExists case Success(:final data) when data) {
      return Result.failure(Failure.validation('Username already exists'));
    }
    
    // Check employee ID uniqueness if provided
    if (employeeId != null && employeeId.isNotEmpty) {
      final empIdExists = await _userRepo.employeeIdExists(employeeId);
      if (empIdExists case Success(:final data) when data) {
        return Result.failure(Failure.validation('Employee ID already exists'));
      }
    }
    
    final user = User(
      id: _generateId(),
      username: username.toLowerCase(),
      displayName: name,
      passwordHash: _hashPassword(password),
      pinHash: pin != null ? _hashPin(pin) : null,
      email: email,
      phone: phone,
      role: role,
      assignedWarehouses: assignedWarehouses ?? [],
      isActive: true,
      loginAttempts: 0,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    
    final result = await _userRepo.insert(user);
    
    if (result case Success()) {
      await _auditRepo.logAction(
        userId: _currentUser?.id ?? 'system',
        action: 'CREATE_USER',
        tableName: 'users',
        recordId: user.id,
        newValues: {'username': username, 'role': role.name},
      );
    }
    
    return result.map((_) => user);
  }
  
  /// Update user
  Future<Result<User>> updateUser(
    String userId, {
    String? name,
    String? email,
    String? phone,
    String? employeeId,
    UserRole? role,
    List<String>? assignedWarehouses,
    bool? isActive,
  }) async {
    if (!_hasPermission('manage_users')) {
      return Result.failure(Failure.authorization('Not authorized to update users'));
    }
    
    final existingResult = await _userRepo.getById(userId);
    if (existingResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final existing = (existingResult as Success).data;
    if (existing == null) {
      return Result.failure(Failure.notFound('User', userId));
    }
    
    // Check employee ID uniqueness if changing
    if (employeeId != null && employeeId != existing.employeeId) {
      final empIdExists = await _userRepo.employeeIdExists(
        employeeId,
        excludeId: userId,
      );
      if (empIdExists case Success(:final data) when data) {
        return Result.failure(Failure.validation('Employee ID already exists'));
      }
    }
    
    final updated = existing.copyWith(
      displayName: name,
      email: email,
      phone: phone,
      role: role,
      assignedWarehouses: assignedWarehouses,
      isActive: isActive,
      updatedAt: DateTime.now(),
    );
    
    final result = await _userRepo.update(updated, userId);
    
    if (result case Success()) {
      await _auditRepo.logAction(
        userId: _currentUser?.id ?? 'system',
        action: 'UPDATE_USER',
        tableName: 'users',
        recordId: userId,
      );
    }
    
    return result.map((_) => updated);
  }
  
  /// Change user password
  Future<Result<void>> changePassword(
    String userId,
    String currentPassword,
    String newPassword,
  ) async {
    // Only user themselves or admin can change password
    if (_currentUser?.id != userId && !_currentUser!.role.canAdmin) {
      return Result.failure(Failure.authorization('Not authorized'));
    }
    
    final userResult = await _userRepo.getById(userId);
    if (userResult case Failed(:final failure)) {
      return Result.failure(failure);
    }
    
    final user = (userResult as Success).data;
    if (user == null) {
      return Result.failure(Failure.notFound('User', userId));
    }
    
    // Verify current password (skip for admin changing other's password)
    if (_currentUser?.id == userId) {
      if (_hashPassword(currentPassword) != user.passwordHash) {
        return Result.failure(Failure.authentication('Current password is incorrect'));
      }
    }
    
    if (newPassword.length < 6) {
      return Result.failure(Failure.validation('Password must be at least 6 characters'));
    }
    
    await _userRepo.updatePassword(userId, _hashPassword(newPassword));
    
    await _auditRepo.logAction(
      userId: _currentUser?.id ?? 'system',
      action: 'CHANGE_PASSWORD',
      tableName: 'users',
      recordId: userId,
    );
    
    return Result.success(null);
  }
  
  /// Set or update PIN
  Future<Result<void>> setPin(String userId, String? pin) async {
    if (_currentUser?.id != userId && !_currentUser!.role.canAdmin) {
      return Result.failure(Failure.authorization('Not authorized'));
    }
    
    if (pin != null && pin.length != 4) {
      return Result.failure(Failure.validation('PIN must be 4 digits'));
    }
    
    final pinHash = pin != null ? _hashPin(pin) : null;
    await _userRepo.updatePin(userId, pinHash);
    
    return Result.success(null);
  }
  
  /// Unlock user account
  Future<Result<void>> unlockAccount(String userId) async {
    if (!_hasPermission('manage_users')) {
      return Result.failure(Failure.authorization('Not authorized'));
    }
    
    await _userRepo.unlockAccount(userId);
    
    await _auditRepo.logAction(
      userId: _currentUser?.id ?? 'system',
      action: 'UNLOCK_ACCOUNT',
      tableName: 'users',
      recordId: userId,
    );
    
    return Result.success(null);
  }
  
  /// Delete user (soft)
  Future<Result<void>> deleteUser(String userId) async {
    if (!_hasPermission('manage_users')) {
      return Result.failure(Failure.authorization('Not authorized'));
    }
    
    // Can't delete yourself
    if (_currentUser?.id == userId) {
      return Result.failure(Failure.business('Cannot delete your own account'));
    }
    
    await _userRepo.softDelete(userId, _currentUser?.id ?? 'system');
    
    await _auditRepo.logAction(
      userId: _currentUser?.id ?? 'system',
      action: 'DELETE_USER',
      tableName: 'users',
      recordId: userId,
    );
    
    return Result.success(null);
  }
  
  // =====================================================
  // USER QUERIES
  // =====================================================
  
  /// Get all users
  Future<Result<List<User>>> getUsers({
    UserRole? role,
    bool activeOnly = true,
  }) async {
    if (role != null) {
      return _userRepo.getByRole(role, activeOnly: activeOnly);
    }
    
    if (activeOnly) {
      return _userRepo.getActiveUsers();
    }
    
    return _userRepo.getAll(
      where: 'isDeleted = 0',
      orderBy: 'name ASC',
    );
  }
  
  /// Get user by ID
  Future<Result<User?>> getUserById(String id) async {
    return _userRepo.getById(id);
  }
  
  /// Search users
  Future<Result<List<User>>> searchUsers(
    String query, {
    UserRole? role,
    bool activeOnly = true,
  }) async {
    return _userRepo.search(
      query,
      role: role,
      activeOnly: activeOnly,
    );
  }
  
  /// Get users assigned to warehouse
  Future<Result<List<User>>> getUsersByWarehouse(
    String warehouseId, {
    UserRole? role,
  }) async {
    return _userRepo.getByWarehouse(warehouseId, role: role);
  }
  
  // =====================================================
  // AUTHORIZATION
  // =====================================================
  
  /// Check if current user has permission
  bool hasPermission(String permission) {
    return _hasPermission(permission);
  }
  
  bool _hasPermission(String permission) {
    if (_currentUser == null) return false;
    
    return switch (permission) {
      'manage_users' => _currentUser!.role.canManageUsers,
      'manage_warehouses' => _currentUser!.role.level >= UserRole.manager.level,
      'manage_items' => _currentUser!.role.canManageInventory,
      'stock_in' => _currentUser!.role.canOperateStock,
      'stock_out' => _currentUser!.role.canOperateStock,
      'transfer' => _currentUser!.role.canOperateStock,
      'adjust' => _currentUser!.role.canAdjustStock,
      'cycle_count' => _currentUser!.role.canAdjustStock,
      'view_reports' => _currentUser!.role.canViewReports,
      'export_data' => _currentUser!.role.level >= UserRole.manager.level,
      _ => false,
    };
  }
  
  /// Check if user can access warehouse
  bool canAccessWarehouse(String warehouseId) {
    if (_currentUser == null) return false;
    
    // Admin can access all
    if (_currentUser!.role.canAdmin) return true;
    
    // Check assigned warehouses
    final assigned = _currentUser!.assignedWarehouses;
    return assigned == null || assigned.isEmpty || assigned.contains(warehouseId);
  }
  
  // =====================================================
  // BOOTSTRAP
  // =====================================================
  
  /// Create default admin user if none exists
  Future<Result<void>> ensureAdminExists() async {
    final admins = await _userRepo.getAdmins();
    
    if (admins case Success(:final data) when data.isEmpty) {
      // Create default admin
      final admin = User(
        id: _generateId(),
        username: 'admin',
        passwordHash: _hashPassword('admin123'),
        displayName: 'System Administrator',
        role: UserRole.admin,
        assignedWarehouses: [],
        isActive: true,
        loginAttempts: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      
      await _userRepo.insert(admin);
      
      print('Default admin user created (username: admin, password: admin123)');
    }
    
    return Result.success(null);
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  String _generateId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }
  
  String _generateSessionId() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return base64Url.encode(bytes);
  }
  
  String _hashPassword(String password) {
    final bytes = utf8.encode(password);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }
  
  String _hashPin(String pin) {
    final bytes = utf8.encode(pin);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }
}
