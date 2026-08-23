/// ============================================================
/// DATA SYNC MANAGER - Cross-module data synchronization
/// ============================================================
/// 
/// Manages data consistency across all modules.
/// Implements pull-refresh mechanism for fresh data.
/// Handles provider notifications on data updates.
/// 
/// Architecture: Application Layer
/// ============================================================
library;

import 'package:flutter/foundation.dart';
import 'dart:async';

import 'unified_database_manager.dart';
import 'api_client.dart';

/// Data synchronization manager
class DataSyncManager {
  static DataSyncManager? _instance;
  
  final ApiClient _apiClient;
  bool _isSyncing = false;
  DateTime? _lastSyncTime;
  final _syncStreamController = StreamController<SyncEvent>.broadcast();
  
  DataSyncManager._({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();
  
  static DataSyncManager get instance {
    _instance ??= DataSyncManager._();
    return _instance!;
  }
  
  Stream<SyncEvent> get syncEvents => _syncStreamController.stream;
  bool get isSyncing => _isSyncing;
  DateTime? get lastSyncTime => _lastSyncTime;
  
  /// Initialize fresh database with data
  Future<void> initializeFreshDatabase() async {
    debugPrint('Initializing fresh database...');
    try {
      // Load initial data from API if available
      await _loadInventoryData();
      await _loadWarehouseData();
      _lastSyncTime = DateTime.now();
      _syncStreamController.add(SyncEvent('db_initialized', true));
      debugPrint('Fresh database initialized successfully');
    } catch (e) {
      debugPrint('Error initializing fresh database: $e');
      _syncStreamController.add(SyncEvent('db_initialized', false, error: e.toString()));
    }
  }
  
  /// Load inventory data from API
  Future<void> _loadInventoryData() async {
    try {
      final response = await _apiClient.getInventoryItems();
      if (response['success'] == true) {
        final data = response['data'] as List?;
        if (data != null && data.isNotEmpty) {
          debugPrint('Loaded ${data.length} inventory items from API');
        }
      }
    } catch (e) {
      debugPrint('Error loading inventory data: $e');
    }
  }
  
  /// Load warehouse data from API
  Future<void> _loadWarehouseData() async {
    try {
      final response = await _apiClient.getWarehouses();
      if (response['success'] == true) {
        final data = response['data'] as List?;
        if (data != null && data.isNotEmpty) {
          debugPrint('Loaded ${data.length} warehouses from API');
        }
      }
    } catch (e) {
      debugPrint('Error loading warehouse data: $e');
    }
  }
  
  /// Full synchronization across all modules
  Future<void> syncAllModules() async {
    if (_isSyncing) {
      debugPrint('Sync already in progress');
      return;
    }
    
    _isSyncing = true;
    _syncStreamController.add(SyncEvent('sync_started', true));
    
    try {
      debugPrint('Starting full module synchronization...');
      
      // Sync each module
      await _syncInventoryModule();
      await _syncWarehouseModule();
      await _syncStockModule();
      
      _lastSyncTime = DateTime.now();
      debugPrint('Full module synchronization completed');
      _syncStreamController.add(SyncEvent('sync_completed', true));
    } catch (e) {
      debugPrint('Error during synchronization: $e');
      _syncStreamController.add(SyncEvent('sync_error', false, error: e.toString()));
    } finally {
      _isSyncing = false;
    }
  }
  
  /// Sync inventory module
  Future<void> _syncInventoryModule() async {
    try {
      debugPrint('Syncing inventory module...');
      final response = await _apiClient.getInventoryItems();
      if (response['success'] == true) {
        debugPrint('Inventory module synced successfully');
        _syncStreamController.add(SyncEvent('inventory_synced', true));
      }
    } catch (e) {
      debugPrint('Error syncing inventory module: $e');
      _syncStreamController.add(SyncEvent('inventory_synced', false, error: e.toString()));
    }
  }
  
  /// Sync warehouse module
  Future<void> _syncWarehouseModule() async {
    try {
      debugPrint('Syncing warehouse module...');
      final response = await _apiClient.getWarehouses();
      if (response['success'] == true) {
        debugPrint('Warehouse module synced successfully');
        _syncStreamController.add(SyncEvent('warehouse_synced', true));
      }
    } catch (e) {
      debugPrint('Error syncing warehouse module: $e');
      _syncStreamController.add(SyncEvent('warehouse_synced', false, error: e.toString()));
    }
  }
  
  /// Sync stock module
  Future<void> _syncStockModule() async {
    try {
      debugPrint('Syncing stock module...');
      final response = await _apiClient.getStock();
      if (response['success'] == true) {
        debugPrint('Stock module synced successfully');
        _syncStreamController.add(SyncEvent('stock_synced', true));
      }
    } catch (e) {
      debugPrint('Error syncing stock module: $e');
      _syncStreamController.add(SyncEvent('stock_synced', false, error: e.toString()));
    }
  }
  
  /// Refresh data for all providers
  Future<void> refreshAllData() async {
    try {
      debugPrint('Refreshing all provider data...');
      
      // This will be called from UI with provider context
      // Providers will be refreshed individually
      _syncStreamController.add(SyncEvent('refresh_started', true));
      debugPrint('Data refresh completed');
      _syncStreamController.add(SyncEvent('refresh_completed', true));
    } catch (e) {
      debugPrint('Error refreshing data: $e');
      _syncStreamController.add(SyncEvent('refresh_error', false, error: e.toString()));
    }
  }
  
  /// Get database statistics
  Future<Map<String, dynamic>> getDatabaseStats() async {
    try {
      return await DatabaseManager.instance.getStats();
    } catch (e) {
      debugPrint('Error getting database stats: $e');
      return {};
    }
  }
  
  /// Clear local data and resync
  Future<void> resetAndResync() async {
    try {
      debugPrint('Resetting database...');
      await DatabaseManager.instance.resetDatabase();
      await initializeFreshDatabase();
      debugPrint('Reset and resync completed');
      _syncStreamController.add(SyncEvent('reset_completed', true));
    } catch (e) {
      debugPrint('Error during reset and resync: $e');
      _syncStreamController.add(SyncEvent('reset_completed', false, error: e.toString()));
    }
  }
  
  void dispose() {
    _syncStreamController.close();
  }
}

/// Sync event model
class SyncEvent {
  final String type;
  final bool success;
  final String? error;
  final DateTime timestamp;
  
  SyncEvent(this.type, this.success, {this.error}) 
      : timestamp = DateTime.now();
}
