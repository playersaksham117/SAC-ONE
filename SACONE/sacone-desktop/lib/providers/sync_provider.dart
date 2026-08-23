import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import '../services/api_client.dart';
import '../services/sync_engine.dart';
import '../services/sync_queue_service.dart';
import '../services/device_auth_service.dart';

enum SyncStatus { idle, syncing, success, error }

class SyncProvider with ChangeNotifier {
  late final SyncEngine _engine;
  late final DeviceAuthService _deviceAuth;
  late final ApiClient _api;

  SyncStatus _syncStatus = SyncStatus.idle;
  String? _lastSyncTime;
  String? _errorMessage;
  bool _isOnline = false;
  int _pendingCount = 0;

  StreamSubscription? _connectivitySubscription;
  Timer? _autoSyncTimer;

  SyncProvider({ApiClient? apiClient}) {
    _setup(apiClient);
  }

  SyncStatus get syncStatus => _syncStatus;
  String? get lastSyncTime => _lastSyncTime;
  String? get errorMessage => _errorMessage;
  bool get isOnline => _isOnline;
  int get pendingChangesCount => _pendingCount;

  Future<void> _setup(ApiClient? apiClient) async {
    final url = await ApiClient.loadBaseUrl();
    _api = apiClient ?? ApiClient(baseUrl: url);
    _engine = SyncEngine(apiClient: _api);
    _deviceAuth = DeviceAuthService(api: _api);
    await _initialize();
  }

  Future<void> _initialize() async {
    await _deviceAuth.loadSession();
    await _refreshPendingCount();
    await _checkConnectivity();
    _setupConnectivityListener();
    _setupAutoSync();
  }

  Future<void> _refreshPendingCount() async {
    _pendingCount = await SyncQueueService.pendingCount();
    notifyListeners();
  }

  Future<void> _checkConnectivity() async {
    try {
      _isOnline = await _api.checkHealth();
      notifyListeners();
      if (_isOnline && _pendingCount > 0) await sync();
    } catch (_) {
      _isOnline = false;
      notifyListeners();
    }
  }

  void _setupConnectivityListener() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((result) async {
      if (result != ConnectivityResult.none) {
        await _checkConnectivity();
      } else {
        _isOnline = false;
        notifyListeners();
      }
    });
  }

  void _setupAutoSync() {
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 5), (_) {
      if (_isOnline && _syncStatus != SyncStatus.syncing) sync();
    });
  }

  Future<void> sync() async {
    if (_syncStatus == SyncStatus.syncing) return;
    _syncStatus = SyncStatus.syncing;
    _errorMessage = null;
    notifyListeners();

    final result = await _engine.runFullSync();
    if (result.success) {
      _syncStatus = SyncStatus.success;
      _isOnline = true;
      _lastSyncTime = DateTime.now().toIso8601String();
    } else {
      _syncStatus = SyncStatus.error;
      _errorMessage = result.error;
      _isOnline = false;
    }
    await _refreshPendingCount();
    notifyListeners();
  }

  Future<void> queueChange(String table, Map<String, dynamic> data) async {
    await SyncQueueService.enqueue(
      tableName: table,
      recordId: data['id'] as String,
      operation: 'upsert',
      payload: data,
    );
    await _refreshPendingCount();
    if (_isOnline && _syncStatus != SyncStatus.syncing) await sync();
  }

  Future<void> registerDevice({
    required String username,
    required String password,
    required String deviceName,
    required String deviceType,
  }) async {
    final url = await ApiClient.loadBaseUrl();
    _api.updateBaseUrl(url);
    await _deviceAuth.loginAndRegisterDevice(
      username: username,
      password: password,
      deviceName: deviceName,
      deviceType: deviceType,
    );
    await sync();
  }

  Future<void> forceSyncNow() => sync();

  void clearError() {
    _errorMessage = null;
    _syncStatus = SyncStatus.idle;
    notifyListeners();
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    _autoSyncTimer?.cancel();
    super.dispose();
  }
}
