import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();

  bool _isLoggedIn   = false;
  bool _isLoading    = true;
  bool _isFirstRun   = false;
  Map<String, String>? _currentUser;
  String? _errorMessage;
  bool _pinEnabled   = false;
  String? _savedUserId;
  bool _needsPinSetup = false;

  // ── Getters ────────────────────────────────────────────────────────────────
  bool get isLoggedIn    => _isLoggedIn;
  bool get isLoading     => _isLoading;
  bool get isFirstRun    => _isFirstRun;
  Map<String, String>? get currentUser => _currentUser;
  String? get errorMessage => _errorMessage;
  bool get pinEnabled     => _pinEnabled;
  String? get savedUserId => _savedUserId;
  bool get needsPinSetup  => _needsPinSetup;

  String get userId   => _currentUser?['id']   ?? '';
  String get userName => _currentUser?['name']  ?? 'User';
  String get userRole => _currentUser?['role']  ?? UserRole.staff;

  // ── Role helpers ───────────────────────────────────────────────────────────
  bool get isAdmin   => userRole == UserRole.admin;
  bool get isManager => userRole == UserRole.manager || isAdmin;
  bool get isStaff   => userRole == UserRole.staff   || isManager;
  bool get isViewer  => userRole == UserRole.viewer;

  /// Can the current user access the given capability?
  bool can(String capability) {
    switch (capability) {
      case 'settings':      return isAdmin;
      case 'reports':       return isManager;
      case 'adjustments':   return isStaff;
      case 'warehouses':    return isManager;
      case 'user_mgmt':     return isAdmin;
      case 'inventory':     return !isViewer; // viewer gets read-only view
      default:              return true;
    }
  }

  // ── Initialization ─────────────────────────────────────────────────────────
  AuthProvider() { _initializeAuth(); }

  Future<void> _initializeAuth() async {
    _isLoading = true;
    notifyListeners();

    await _authService.initializeUsersTable();

    _isFirstRun  = !(await _authService.hasAnyUsers());
    _isLoggedIn  = await _authService.isLoggedIn();
    _pinEnabled  = await _authService.isPinEnabled();
    _savedUserId = await _authService.getSavedUserId();

    if (_isLoggedIn) {
      _currentUser = await _authService.getCurrentUser();
      if (_currentUser != null) {
        final hasPin    = await _authService.currentUserHasPinInDb(_currentUser!['id']!);
        final skipped   = await _authService.isPinSetupSkipped();
        _needsPinSetup  = !hasPin && !skipped;
      }
    }

    _isLoading = false;
    notifyListeners();
  }

  // ── First-run admin setup ──────────────────────────────────────────────────
  Future<bool> createFirstAdmin({
    required String name,
    required String username,
    required String password,
  }) async {
    _errorMessage = null;
    notifyListeners();

    final result = await _authService.createFirstAdmin(
        name: name, username: username, password: password);

    if (result['success'] == true) {
      _isFirstRun = false;
      _isLoggedIn = true;
      _currentUser = Map<String, String>.from(result['user'] as Map);
      _needsPinSetup = true;
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  Future<bool> loginWithPin(String pin) async {
    _errorMessage = null;
    notifyListeners();
    final result = await _authService.loginWithPin(pin);
    if (result['success'] == true) {
      _isLoggedIn  = true;
      _currentUser = Map<String, String>.from(result['user'] as Map);
      _needsPinSetup = false;
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  Future<bool> login(String email, String password) async {
    _errorMessage = null;
    notifyListeners();
    final result = await _authService.login(email, password);
    if (result['success'] == true) {
      _isLoggedIn  = true;
      _currentUser = Map<String, String>.from(result['user'] as Map);
      _pinEnabled  = await _authService.isPinEnabled();
      _savedUserId = _currentUser?['id'];
      if (_currentUser != null) {
        final hasPin  = await _authService.currentUserHasPinInDb(_currentUser!['id']!);
        final skipped = await _authService.isPinSetupSkipped();
        _needsPinSetup = !hasPin && !skipped;
      }
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  // ── Kept for signup_screen.dart backward compat ────────────────────────────
  Future<bool> signup(String name, String email, String password) async {
    return createFirstAdmin(name: name, username: email, password: password);
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  Future<bool> setPin(String pin) async {
    if (_currentUser == null) return false;
    final result = await _authService.setPin(_currentUser!['id']!, pin);
    if (result['success'] == true) {
      _pinEnabled    = true;
      _needsPinSetup = false;
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  Future<void> skipPinSetup() async {
    await _authService.markPinSetupSkipped();
    _needsPinSetup = false;
    notifyListeners();
  }

  Future<bool> enablePin(String userId, String pin) async {
    final result = await _authService.enablePin(userId, pin);
    if (result['success'] == true) {
      if (userId == _currentUser?['id']) _pinEnabled = true;
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  Future<bool> disablePin(String userId) async {
    final result = await _authService.disablePin(userId);
    if (result['success'] == true) {
      if (userId == _currentUser?['id']) _pinEnabled = false;
      notifyListeners();
      return true;
    }
    _errorMessage = result['message'] as String?;
    notifyListeners();
    return false;
  }

  // ── Admin: user management ─────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getAllUsers() async => _authService.getAllUsers();

  Future<bool> createUser({
    required String name,
    required String username,
    required String password,
    required String role,
  }) async {
    if (!isAdmin) { _errorMessage = 'Admin access required'; notifyListeners(); return false; }
    final result = await _authService.createUser(
        name: name, username: username, password: password, role: role);
    if (result['success'] != true) {
      _errorMessage = result['message'] as String?;
      notifyListeners();
      return false;
    }
    notifyListeners();
    return true;
  }

  Future<bool> updateUser({
    required String userId,
    String? name,
    String? role,
    String? newPassword,
  }) async {
    if (!isAdmin) return false;
    final result = await _authService.updateUser(
        userId: userId, name: name, role: role, newPassword: newPassword);
    notifyListeners();
    return result['success'] == true;
  }

  Future<bool> deleteUser(String userId) async {
    if (!isAdmin || userId == _currentUser?['id']) return false;
    final result = await _authService.deleteUser(userId);
    notifyListeners();
    return result['success'] == true;
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  Future<void> logout() async {
    await _authService.logout();
    _isLoggedIn = false;
    notifyListeners();
  }

  Future<void> completeLogout() async {
    await _authService.completeLogout();
    _isLoggedIn    = false;
    _currentUser   = null;
    _pinEnabled    = false;
    _savedUserId   = null;
    _needsPinSetup = false;
    notifyListeners();
  }

  void clearError() { _errorMessage = null; notifyListeners(); }
}
