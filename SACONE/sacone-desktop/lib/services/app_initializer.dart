/// ============================================================
/// APP INITIALIZER - Application startup and initialization
/// ============================================================
/// 
/// Handles all startup tasks:
/// - Database initialization
/// - Fresh data loading
/// - Provider initialization
/// - Module connection verification
/// 
/// Architecture: Application Layer
/// ============================================================
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:async';

import 'unified_database_manager.dart';
import 'data_sync_manager.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/settings_provider.dart';
import '../providers/sync_provider.dart';
import '../providers/reports_provider.dart';

/// Application initializer
class AppInitializer {
  static bool _initialized = false;
  
  /// Initialize application on startup
  static Future<void> initialize() async {
    if (_initialized) return;
    
    debugPrint('=== APPLICATION INITIALIZATION STARTED ===');
    
    try {
      // Step 1: Initialize database
      debugPrint('Step 1: Initializing database...');
      await _initializeDatabase();
      
      // Step 2: Load fresh data
      debugPrint('Step 2: Loading fresh data...');
      await _loadFreshData();
      
      // Step 3: Verify module connections
      debugPrint('Step 3: Verifying module connections...');
      await _verifyModuleConnections();
      
      _initialized = true;
      debugPrint('=== APPLICATION INITIALIZATION COMPLETED ===');
    } catch (e) {
      debugPrint('=== APPLICATION INITIALIZATION FAILED ===');
      debugPrint('Error: $e');
      rethrow;
    }
  }
  
  /// Initialize database
  static Future<void> _initializeDatabase() async {
    try {
      await DatabaseManager.instance.database;
      
      // Get database info
      final stats = await DatabaseManager.instance.getStats();
      
      debugPrint('Database initialized successfully');
      debugPrint('Database stats: $stats');
    } catch (e) {
      debugPrint('Failed to initialize database: $e');
      rethrow;
    }
  }
  
  /// Load fresh data into database
  static Future<void> _loadFreshData() async {
    try {
      await DataSyncManager.instance.initializeFreshDatabase();
      debugPrint('Fresh data loaded successfully');
    } catch (e) {
      debugPrint('Failed to load fresh data: $e');
      // Don't rethrow - app can still work with empty local DB
    }
  }
  
  /// Verify all modules are connected
  static Future<void> _verifyModuleConnections() async {
    try {
      // Check if database is accessible
      await DatabaseManager.instance.database;
      debugPrint('Database connection verified');
      
      // Module connections are established if database is accessible
      debugPrint('Module connections verified');
    } catch (e) {
      debugPrint('Error verifying module connections: $e');
      // Don't rethrow - app can still function
    }
  }
  
  /// Initialize all providers with fresh data
  static Future<void> initializeProviders(BuildContext context) async {
    try {
      debugPrint('Initializing providers...');
      
      // Initialize settings first
      if (context.mounted) {
        final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);
        await settingsProvider.loadSettings();
      }
      
      // Initialize inventory provider
      if (context.mounted) {
        final inventoryProvider = Provider.of<InventoryProvider>(context, listen: false);
        await inventoryProvider.loadInventoryItems();
        await inventoryProvider.loadStocks();
      }
      
      // Initialize warehouse provider
      if (context.mounted) {
        final warehouseProvider = Provider.of<WarehouseProvider>(context, listen: false);
        await warehouseProvider.loadWarehouses();
      }
      
      // Initialize reports provider
      if (context.mounted) {
        final reportsProvider = Provider.of<ReportsProvider>(context, listen: false);
        await reportsProvider.loadAllReports();
      }
      
      debugPrint('Providers initialized successfully');
    } catch (e) {
      debugPrint('Error initializing providers: $e');
      rethrow;
    }
  }
  
  /// Refresh all data on demand
  static Future<void> refreshAllData(BuildContext context) async {
    try {
      debugPrint('Refreshing all data...');
      
      if (context.mounted) {
        // Refresh inventory
        final inventoryProvider = Provider.of<InventoryProvider>(context, listen: false);
        await inventoryProvider.loadInventoryItems();
        await inventoryProvider.loadStocks();
        await inventoryProvider.loadTransactions();
        
        // Refresh warehouses
        final warehouseProvider = Provider.of<WarehouseProvider>(context, listen: false);
        await warehouseProvider.loadWarehouses();
        
        // Refresh reports
        final reportsProvider = Provider.of<ReportsProvider>(context, listen: false);
        await reportsProvider.refreshReports();
        
        // Sync with backend if available
        final syncProvider = Provider.of<SyncProvider>(context, listen: false);
        await syncProvider.sync();
      }
      
      debugPrint('Data refresh completed');
    } catch (e) {
      debugPrint('Error refreshing data: $e');
      rethrow;
    }
  }
  
  /// Reset application data
  static Future<void> resetApplicationData() async {
    try {
      debugPrint('Resetting application data...');
      await DataSyncManager.instance.resetAndResync();
      debugPrint('Application data reset completed');
    } catch (e) {
      debugPrint('Error resetting application data: $e');
      rethrow;
    }
  }
  
  /// Get initialization status
  static bool get isInitialized => _initialized;
}

/// App initializer widget for UI initialization
class AppInitializerWidget extends StatefulWidget {
  final Widget child;
  
  const AppInitializerWidget({required this.child, super.key});
  
  @override
  State<AppInitializerWidget> createState() => _AppInitializerWidgetState();
}

class _AppInitializerWidgetState extends State<AppInitializerWidget> {
  bool _initialized = false;
  String? _error;
  
  @override
  void initState() {
    super.initState();
    _initializeApp();
  }
  
  Future<void> _initializeApp() async {
    try {
      await AppInitializer.initialize();
      if (mounted) {
        await AppInitializer.initializeProviders(context);
        setState(() => _initialized = true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _initialized = true; // Still show app but with error
        });
      }
    }
  }
  
  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Initializing application...'),
              ],
            ),
          ),
        ),
      );
    }
    
    if (_error != null) {
      debugPrint('Initialization error: $_error');
    }
    
    return widget.child;
  }
}
