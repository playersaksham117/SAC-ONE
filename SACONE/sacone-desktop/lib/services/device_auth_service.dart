import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Device registration and token storage for secure sync.
class DeviceAuthService {
  static const _keyToken = 'sync_api_token';
  static const _keyDeviceId = 'sync_device_id';
  static const _keyTenantId = 'sync_tenant_id';

  final ApiClient _api;

  DeviceAuthService({ApiClient? api}) : _api = api ?? ApiClient();

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyToken);
  }

  Future<void> saveSession({
    required String token,
    required String deviceId,
    required String tenantId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, token);
    await prefs.setString(_keyDeviceId, deviceId);
    await prefs.setString(_keyTenantId, tenantId);
    _api.setAuthToken(token);
  }

  Future<bool> loadSession() async {
    final token = await getToken();
    if (token == null || token.isEmpty) return false;
    _api.setAuthToken(token);
    return true;
  }

  Future<Map<String, dynamic>> loginAndRegisterDevice({
    required String username,
    required String password,
    required String deviceName,
    required String deviceType,
    String role = 'operator',
  }) async {
    final login = await _api.login(username: username, password: password);
    if (login['success'] != true) {
      throw Exception(login['error'] ?? 'Login failed');
    }

    final reg = await _api.registerDevice(
      name: deviceName,
      deviceType: deviceType,
      role: role,
    );
    if (reg['success'] != true) {
      throw Exception(reg['error'] ?? 'Device registration failed');
    }

    final data = reg['data'] as Map<String, dynamic>;
    await saveSession(
      token: data['api_token'] as String,
      deviceId: data['device_id'] as String,
      tenantId: data['tenant_id'] as String,
    );

    return {'login': login['data'], 'device': data};
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyDeviceId);
    await prefs.remove(_keyTenantId);
    _api.setAuthToken(null);
  }
}
