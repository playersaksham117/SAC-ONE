/// ============================================================
/// AUTH PROVIDER - State management for authentication
/// ============================================================
/// 
/// Manages login state, current user, and permissions.
/// Wraps AuthService for UI consumption.
/// 
/// Architecture: Provider Layer (State Management)
/// ============================================================

import 'package:flutter/foundation.dart';

import '../../core/types/result.dart';
import '../../domain/entities/user.dart';
import '../../data/services/auth_service.dart';

/// Authentication state
enum AuthState {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
  error,
}

/// Provider for authentication state management
class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();
  
  // State
  AuthState _state = AuthState.initial;
  User? _user;
  String? _errorMessage;
  bool _isLoading = false;
  
  // Getters
  AuthState get state => _state;
  User? get user => _user;
  String? get errorMessage => _errorMessage;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _state == AuthState.authenticated;
  
  /// Get current user's role
  UserRole? get userRole => _user?.role;
  
  /// Get current user's name
  String get userName => _user?.displayName ?? 'Unknown';
  
  /// Get current user's assigned warehouses
  List<String> get assignedWarehouses => _user?.assignedWarehouses ?? [];
  
  // =====================================================
  // AUTHENTICATION ACTIONS
  // =====================================================
  
  /// Login with username and password
  Future<bool> login(String username, String password) async {
    _setLoading(true);
    _errorMessage = null;
    _state = AuthState.authenticating;
    notifyListeners();
    
    final result = await _authService.login(username, password);
    
    switch (result) {
      case Success(:final data):
        _user = data;
        _state = AuthState.authenticated;
        _setLoading(false);
        return true;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
        _state = AuthState.error;
        _setLoading(false);
        return false;
    }
  }
  
  /// Login with PIN
  Future<bool> loginWithPin(String pin) async {
    _setLoading(true);
    _errorMessage = null;
    _state = AuthState.authenticating;
    notifyListeners();
    
    final result = await _authService.loginWithPin(pin);
    
    switch (result) {
      case Success(:final data):
        _user = data;
        _state = AuthState.authenticated;
        _setLoading(false);
        return true;
        
      case Failed(:final failure):
        _errorMessage = failure.message;
        _state = AuthState.error;
        _setLoading(false);
        return false;
    }
  }
  
  /// Logout
  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    _state = AuthState.unauthenticated;
    _errorMessage = null;
    notifyListeners();
  }
  
  /// Clear any error state
  void clearError() {
    _errorMessage = null;
    if (_state == AuthState.error) {
      _state = AuthState.unauthenticated;
    }
    notifyListeners();
  }
  
  // =====================================================
  // PERMISSION CHECKS
  // =====================================================
  
  /// Check if user has specific permission
  bool hasPermission(String permission) {
    return _authService.hasPermission(permission);
  }
  
  /// Check if user can access a warehouse
  bool canAccessWarehouse(String warehouseId) {
    return _authService.canAccessWarehouse(warehouseId);
  }
  
  /// Check if user is admin
  bool get isAdmin => _user?.role.canAdmin ?? false;
  
  /// Check if user is manager or higher
  bool get isManagerOrAbove => 
      (_user?.role.level ?? 0) >= 75;
  
  /// Can manage inventory
  bool get canManageInventory => _user?.role.canManageInventory ?? false;
  
  /// Can manage stock operations
  bool get canManageStock => _user?.role.canOperateStock ?? false;
  
  /// Can adjust stock
  bool get canAdjustStock => _user?.role.canAdjustStock ?? false;
  
  /// Can view reports
  bool get canViewReports => _user?.role.canViewReports ?? false;
  
  // =====================================================
  // USER MANAGEMENT (Admin only)
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
    return _authService.createUser(
      username: username,
      password: password,
      name: name,
      role: role,
      employeeId: employeeId,
      email: email,
      phone: phone,
      pin: pin,
      assignedWarehouses: assignedWarehouses,
    );
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
    return _authService.updateUser(
      userId,
      name: name,
      email: email,
      phone: phone,
      employeeId: employeeId,
      role: role,
      assignedWarehouses: assignedWarehouses,
      isActive: isActive,
    );
  }
  
  /// Change password
  Future<Result<void>> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    if (_user == null) {
      return Result.failure(Failure.authentication('Not logged in'));
    }
    return _authService.changePassword(_user!.id, currentPassword, newPassword);
  }
  
  /// Set PIN
  Future<Result<void>> setPin(String? pin) async {
    if (_user == null) {
      return Result.failure(Failure.authentication('Not logged in'));
    }
    return _authService.setPin(_user!.id, pin);
  }
  
  /// Get all users
  Future<Result<List<User>>> getUsers({
    UserRole? role,
    bool activeOnly = true,
  }) async {
    return _authService.getUsers(role: role, activeOnly: activeOnly);
  }
  
  /// Search users
  Future<Result<List<User>>> searchUsers(String query) async {
    return _authService.searchUsers(query);
  }
  
  /// Unlock user account
  Future<Result<void>> unlockAccount(String userId) async {
    return _authService.unlockAccount(userId);
  }
  
  /// Delete user
  Future<Result<void>> deleteUser(String userId) async {
    return _authService.deleteUser(userId);
  }
  
  // =====================================================
  // INITIALIZATION
  // =====================================================
  
  /// Initialize auth service (create default admin if needed)
  Future<void> initialize() async {
    await _authService.ensureAdminExists();
    _state = AuthState.unauthenticated;
    notifyListeners();
  }
  
  // =====================================================
  // HELPERS
  // =====================================================
  
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
}
