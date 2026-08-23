import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'unified_database_manager.dart';

// ─── Role constants ───────────────────────────────────────────────────────────
class UserRole {
  static const String admin   = 'admin';
  static const String manager = 'manager';
  static const String staff   = 'staff';
  static const String viewer  = 'viewer';

  static const List<String> all = [admin, manager, staff, viewer];

  static String label(String role) {
    switch (role) {
      case admin:   return 'Administrator';
      case manager: return 'Manager';
      case staff:   return 'Staff';
      case viewer:  return 'Viewer (Read-only)';
      default:      return role;
    }
  }
}

// ─── AuthService ─────────────────────────────────────────────────────────────
class AuthService {
  static const String _keyIsLoggedIn      = 'is_logged_in';
  static const String _keyUserId          = 'user_id';
  static const String _keyUserEmail       = 'user_email';
  static const String _keyUserName        = 'user_name';
  static const String _keyUserRole        = 'user_role';
  static const String _keyPinEnabled      = 'pin_enabled';
  static const String _keyUserPinHash     = 'user_pin_hash';
  static const String _keyPinSetupSkipped = 'pin_setup_skipped';

  // ── Hashing ────────────────────────────────────────────────────────────────
  String _hashPassword(String password) =>
      sha256.convert(utf8.encode('tracInvent_pw_salt:$password')).toString();

  String _hashPin(String pin) =>
      sha256.convert(utf8.encode('tracInvent_pin_salt:$pin')).toString();

  // ── User mapper ────────────────────────────────────────────────────────────
  Map<String, String> _mapUser(Map<String, Object?> row) => {
        'id':    row['id']          as String,
        'email': (row['email']      as String?) ?? (row['username'] as String? ?? ''),
        'name':  (row['displayName'] as String?) ?? (row['username'] as String? ?? ''),
        'role':  (row['role']       as String?) ?? UserRole.staff,
      };

  // ── First-run detection ────────────────────────────────────────────────────
  /// Returns true when no user accounts exist yet (first install).
  Future<bool> hasAnyUsers() async {
    final db = await DatabaseManager.instance.database;
    final r = await db.rawQuery(
        "SELECT COUNT(*) as cnt FROM users WHERE isDeleted = 0");
    return ((r.first['cnt'] as int?) ?? 0) > 0;
  }

  // ── Session ────────────────────────────────────────────────────────────────
  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyIsLoggedIn) ?? false;
  }

  Future<Map<String, String>?> getCurrentUser() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool(_keyIsLoggedIn) ?? false)) return null;
    return {
      'id':    prefs.getString(_keyUserId)    ?? '',
      'email': prefs.getString(_keyUserEmail) ?? '',
      'name':  prefs.getString(_keyUserName)  ?? '',
      'role':  prefs.getString(_keyUserRole)  ?? UserRole.staff,
    };
  }

  Future<bool> isPinEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyPinEnabled) ?? false;
  }

  Future<String?> getSavedUserId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyUserId);
  }

  Future<bool> isPinSetupSkipped() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyPinSetupSkipped) ?? false;
  }

  Future<void> markPinSetupSkipped() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyPinSetupSkipped, true);
  }

  Future<bool> currentUserHasPinInDb(String userId) async {
    final db = await DatabaseManager.instance.database;
    final r = await db.query('users', columns: ['pinHash'],
        where: 'id = ?', whereArgs: [userId]);
    if (r.isEmpty) return false;
    final pin = r.first['pinHash'] as String?;
    return pin != null && pin.isNotEmpty;
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> loginWithPin(String pin) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedPinHash = prefs.getString(_keyUserPinHash);
      final userId       = prefs.getString(_keyUserId);
      if (savedPinHash == null || userId == null) {
        return {'success': false, 'message': 'PIN not configured. Use password login.'};
      }
      if (savedPinHash != _hashPin(pin)) {
        return {'success': false, 'message': 'Incorrect PIN'};
      }
      final db = await DatabaseManager.instance.database;
      final rows = await db.query('users',
          where: 'id = ? AND isDeleted = 0 AND isActive = 1',
          whereArgs: [userId]);
      if (rows.isEmpty) return {'success': false, 'message': 'User not found'};
      await _saveSession(prefs, rows.first);
      return {'success': true, 'user': _mapUser(rows.first)};
    } catch (e) {
      return {'success': false, 'message': 'PIN login failed: $e'};
    }
  }

  Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final db = await DatabaseManager.instance.database;
      final hash = _hashPassword(password);
      final rows = await db.query(
        'users',
        where:
            '(email = ? OR username = ?) AND passwordHash = ? AND isDeleted = 0 AND isActive = 1',
        whereArgs: [identifier, identifier, hash],
      );
      if (rows.isEmpty) {
        return {'success': false, 'message': 'Invalid username/email or password'};
      }
      final prefs = await SharedPreferences.getInstance();
      await _saveSession(prefs, rows.first);
      return {'success': true, 'user': _mapUser(rows.first)};
    } catch (e) {
      return {'success': false, 'message': 'Login failed: $e'};
    }
  }

  // ── First-run admin setup (replaces signup) ────────────────────────────────
  Future<Map<String, dynamic>> createFirstAdmin({
    required String name,
    required String username,
    required String password,
  }) async {
    try {
      final db = await DatabaseManager.instance.database;
      // Safety: only allowed when no users exist
      final count = await db.rawQuery(
          "SELECT COUNT(*) as cnt FROM users WHERE isDeleted = 0");
      if (((count.first['cnt'] as int?) ?? 0) > 0) {
        return {'success': false, 'message': 'Users already exist. Use login.'};
      }
      return _insertUser(
          db: db, name: name, username: username,
          password: password, role: UserRole.admin, isFirstAdmin: true);
    } catch (e) {
      return {'success': false, 'message': 'Setup failed: $e'};
    }
  }

  // ── Admin: create additional users ────────────────────────────────────────
  Future<Map<String, dynamic>> createUser({
    required String name,
    required String username,
    required String password,
    required String role,
  }) async {
    if (!UserRole.all.contains(role)) {
      return {'success': false, 'message': 'Invalid role'};
    }
    final db = await DatabaseManager.instance.database;
    final existing = await db.query('users',
        where: '(email = ? OR username = ?) AND isDeleted = 0',
        whereArgs: [username, username]);
    if (existing.isNotEmpty) {
      return {'success': false, 'message': 'Username already taken'};
    }
    return _insertUser(
        db: db, name: name, username: username, password: password, role: role);
  }

  Future<Map<String, dynamic>> _insertUser({
    required Database db,
    required String name,
    required String username,
    required String password,
    required String role,
    bool isFirstAdmin = false,
  }) async {
    final now = DateTime.now().toIso8601String();
    final id  = DateTime.now().millisecondsSinceEpoch.toString();
    await db.insert('users', {
      'id':           id,
      'username':     username,
      'email':        username,
      'displayName':  name,
      'passwordHash': _hashPassword(password),
      'role':         role,
      'isActive':     1,
      'isDeleted':    0,
      'loginAttempts': 0,
      'createdAt':    now,
      'updatedAt':    now,
      'syncStatus':   'local',
    }, conflictAlgorithm: ConflictAlgorithm.abort);

    if (isFirstAdmin) {
      final prefs = await SharedPreferences.getInstance();
      final row = {
        'id': id, 'username': username, 'email': username,
        'displayName': name, 'role': role, 'pinHash': null as Object?,
      };
      await _saveSession(prefs, row);
      return {
        'success': true,
        'user': _mapUser(row),
        'needsPinSetup': true,
      };
    }
    return {'success': true, 'message': 'User created'};
  }

  // ── Admin: update user ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> updateUser({
    required String userId,
    String? name,
    String? role,
    String? newPassword,
  }) async {
    try {
      final db = await DatabaseManager.instance.database;
      final updates = <String, Object?>{
        'updatedAt': DateTime.now().toIso8601String(),
      };
      if (name != null)        updates['displayName']  = name;
      if (role != null)        updates['role']          = role;
      if (newPassword != null) updates['passwordHash']  = _hashPassword(newPassword);

      await db.update('users', updates, where: 'id = ?', whereArgs: [userId]);
      return {'success': true};
    } catch (e) {
      return {'success': false, 'message': e.toString()};
    }
  }

  Future<Map<String, dynamic>> deleteUser(String userId) async {
    try {
      final db = await DatabaseManager.instance.database;
      await db.update('users',
          {'isDeleted': 1, 'updatedAt': DateTime.now().toIso8601String()},
          where: 'id = ?', whereArgs: [userId]);
      return {'success': true};
    } catch (e) {
      return {'success': false, 'message': e.toString()};
    }
  }

  // ── PIN management ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> setPin(String userId, String pin) async {
    if (!RegExp(r'^\d{4,6}$').hasMatch(pin)) {
      return {'success': false, 'message': 'PIN must be 4–6 digits'};
    }
    final pinHash = _hashPin(pin);
    final db = await DatabaseManager.instance.database;
    await db.update('users',
        {'pinHash': pinHash, 'updatedAt': DateTime.now().toIso8601String()},
        where: 'id = ?', whereArgs: [userId]);

    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_keyUserId) == userId) {
      await prefs.setBool(_keyPinEnabled, true);
      await prefs.setString(_keyUserPinHash, pinHash);
      await prefs.remove(_keyPinSetupSkipped);
    }
    return {'success': true};
  }

  Future<Map<String, dynamic>> enablePin(String userId, String pin) =>
      setPin(userId, pin);

  Future<Map<String, dynamic>> disablePin(String userId) async {
    final db = await DatabaseManager.instance.database;
    await db.update('users',
        {'pinHash': null, 'updatedAt': DateTime.now().toIso8601String()},
        where: 'id = ?', whereArgs: [userId]);
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_keyUserId) == userId) {
      await prefs.setBool(_keyPinEnabled, false);
      await prefs.remove(_keyUserPinHash);
    }
    return {'success': true};
  }

  // ── User list (admin) ──────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getAllUsers() async {
    final db = await DatabaseManager.instance.database;
    final rows =
        await db.query('users', where: 'isDeleted = 0', orderBy: 'displayName ASC');
    return rows.map((r) => {
          'id':       r['id'],
          'name':     r['displayName'] ?? r['username'],
          'email':    r['email'] ?? r['username'],
          'username': r['username'],
          'role':     r['role'] ?? UserRole.staff,
          'hasPin':   (r['pinHash'] as String?)?.isNotEmpty ?? false,
          'isActive': r['isActive'] == 1,
        }).toList();
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyIsLoggedIn, false);
  }

  Future<void> completeLogout() async {
    final prefs = await SharedPreferences.getInstance();
    for (final k in [
      _keyIsLoggedIn, _keyUserId, _keyUserEmail, _keyUserName,
      _keyUserRole,   _keyPinEnabled, _keyUserPinHash, _keyPinSetupSkipped,
    ]) {
      await prefs.remove(k);
    }
    await prefs.setBool(_keyIsLoggedIn, false);
  }

  // ── Compatibility shims (used by existing AuthProvider) ───────────────────
  Future<void> initializeUsersTable() async {
    // Nothing to do — schema created by DatabaseManager.
  }

  Future<Map<String, dynamic>> signup(
      String name, String email, String password) async {
    return createFirstAdmin(name: name, username: email, password: password);
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  Future<void> _saveSession(
      SharedPreferences prefs, Map<String, Object?> user) async {
    final pinHash = user['pinHash'] as String?;
    final hasPin  = pinHash != null && pinHash.isNotEmpty;

    await prefs.setBool(_keyIsLoggedIn,  true);
    await prefs.setString(_keyUserId,    user['id'] as String);
    await prefs.setString(_keyUserEmail,
        (user['email'] as String?) ?? (user['username'] as String? ?? ''));
    await prefs.setString(_keyUserName,
        (user['displayName'] as String?) ?? (user['username'] as String? ?? ''));
    await prefs.setString(_keyUserRole, user['role'] as String? ?? UserRole.staff);
    await prefs.setBool(_keyPinEnabled, hasPin);
    if (hasPin) {
      await prefs.setString(_keyUserPinHash, pinHash);
    } else {
      await prefs.remove(_keyUserPinHash);
    }
  }
}
