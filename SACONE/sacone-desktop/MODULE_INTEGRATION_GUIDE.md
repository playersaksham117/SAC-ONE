/// ============================================================
/// INTEGRATION DOCUMENTATION
/// ============================================================
/// 
/// Complete guide for the unified database and module integration
/// system in TracInvent.
/// 
/// ============================================================

# TracInvent Module Integration Guide

## Overview

All modules in TracInvent are now unified with a single database system, shared data synchronization, and coordinated initialization. This ensures:

✅ **Fresh & Updated Database** - Single source of truth for all data
✅ **All Modules Connected** - Unified data flow across inventory, warehouse, and WMS modules
✅ **Updated Data Appears Everywhere** - Cross-module notifications and auto-refresh
✅ **Backend Integration** - API sync when available, offline mode when needed

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                    │
│  main.dart (Inventory) | wms_main.dart (WMS)          │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                   INITIALIZATION LAYER                  │
│     AppInitializer | AppInitializerWidget             │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                    PROVIDER LAYER                       │
│  InventoryProvider | WarehouseProvider | SyncProvider  │
│  StockSearchProvider | StockOperationsService          │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                  SYNCHRONIZATION LAYER                  │
│           DataSyncManager | SyncEvents                 │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                           │
│         UnifiedDatabaseManager | Database Files        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                  BACKEND LAYER                          │
│         ApiClient | Python Flask Server                │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### 1. UnifiedDatabaseManager (`services/unified_database_manager.dart`)

**Purpose**: Single database connection manager for entire application

**Features**:
- Singleton instance accessed via `DatabaseManager.instance`
- Lazy initialization on first access
- Portable database path (same directory as executable in release mode)
- Automatic schema creation with `WmsSchema`
- Initial data insertion (admin user, categories, sequences)
- Database statistics and reset functions
- Transaction support for atomic operations

**Usage**:
```dart
// Get database instance
final db = await DatabaseManager.instance.database;

// Get database path
final path = await DatabaseManager.instance.getDatabasePath();

// Get database statistics
final stats = await DatabaseManager.instance.getStats();

// Reset database (development only)
await DatabaseManager.instance.resetDatabase();
```

### 2. DataSyncManager (`services/data_sync_manager.dart`)

**Purpose**: Cross-module data synchronization and backend integration

**Features**:
- Module-specific sync methods (inventory, warehouse, stock)
- Event stream for real-time sync notifications
- Fresh database initialization
- Backend API integration
- Full synchronization orchestration
- Error handling and recovery

**Usage**:
```dart
// Initialize fresh database
await DataSyncManager.instance.initializeFreshDatabase();

// Sync all modules
await DataSyncManager.instance.syncAllModules();

// Listen to sync events
DataSyncManager.instance.syncEvents.listen((event) {
  print('Sync event: ${event.type} - ${event.success}');
});

// Reset and resync
await DataSyncManager.instance.resetAndResync();

// Get database stats
final stats = await DataSyncManager.instance.getDatabaseStats();
```

### 3. AppInitializer (`services/app_initializer.dart`)

**Purpose**: Coordinated application startup and provider initialization

**Features**:
- Database initialization sequence
- Fresh data loading coordination
- Module connection verification
- Provider initialization on startup
- On-demand data refresh
- Application reset functionality

**Usage**:
```dart
// Initialize app on startup (called automatically by main)
await AppInitializer.initialize();

// Initialize providers after widget tree is built
await AppInitializer.initializeProviders(context);

// Refresh all data on demand
await AppInitializer.refreshAllData(context);

// Reset entire application
await AppInitializer.resetApplicationData();

// Check initialization status
if (AppInitializer.isInitialized) {
  print('App is ready');
}
```

## Updated Entry Points

### main.dart (Inventory Module)
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize FFI for desktop
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }
  
  // Initialize unified database
  await DatabaseManager.instance.database;
  
  runApp(const TracInventApp());
}
```

### wms_main.dart (WMS Module)
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize FFI for desktop SQLite
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }
  
  // Initialize unified database
  await DatabaseManager.instance.database;
  
  runApp(const TracInventApp());
}
```

## Updated Providers

All providers now use the unified database manager:

### InventoryProvider
- ✅ Updated to use `DatabaseManager.instance.database`
- ✅ Supports fresh data loading
- ✅ Coordinates with SyncProvider

### WarehouseProvider
- ✅ Updated to use `DatabaseManager.instance.database`
- ✅ Manages warehouse and location data
- ✅ Notifies on data changes

### Other Services Updated
- ✅ stock_search_service.dart
- ✅ stock_operations_service.dart

## Backend Integration

The app supports optional backend synchronization with Python Flask API:

**Default Configuration**:
- API URL: `http://localhost:5000/api`
- Health check endpoint: `/health`
- Inventory endpoint: `/inventory`
- Warehouses endpoint: `/warehouses`
- Stock endpoint: `/stock`
- Transactions endpoint: `/transactions`

**API Client Methods**:
```dart
// Check backend health
final isHealthy = await apiClient.checkHealth();

// Get inventory items
final items = await apiClient.getInventoryItems(since: lastSyncTime);

// Get warehouses
final warehouses = await apiClient.getWarehouses(since: lastSyncTime);

// Get stock
final stock = await apiClient.getStock(since: lastSyncTime);

// Create/update/delete operations
await apiClient.createInventoryItem(itemData);
await apiClient.updateInventoryItem(id, itemData);
await apiClient.deleteInventoryItem(id);
```

**Offline Mode**:
- App continues to work without backend
- Local data is preserved
- Changes are queued for sync when backend is available

## Database Schema

The unified system uses `WmsSchema` which includes:

**Core Tables**:
- `users` - User accounts and authentication
- `items` - Inventory items/products
- `warehouses` - Warehouse locations
- `locations` - Storage locations/cells within warehouses
- `stock` - Current stock at specific locations
- `stock_movements` - Audit trail of all movements
- `categories` - Product categories
- `sequences` - Auto-increment sequences for codes
- `audit_log` - Comprehensive audit trail
- `sync_queue` - Pending remote sync operations

**Key Features**:
- Foreign key constraints enabled
- Soft deletes with `deletedAt` timestamps
- Sync status tracking (`syncStatus` field)
- Server sync IDs for reconciliation
- Comprehensive audit logging

## Data Flow

### On Application Startup
1. `main()` initializes database
2. `DatabaseManager.instance.database` - creates/opens database
3. `_AppInitializer` - initializes providers
4. `AppInitializer.initializeProviders(context)` - loads data
5. Providers notified with fresh data
6. UI renders with loaded data

### On Data Update
1. User action triggers update (add/edit/delete)
2. Provider updates local database
3. Provider notifies listeners
4. UI updates immediately
5. `SyncProvider` queues for backend sync
6. When backend available, changes are synced
7. Other users can pull fresh data

### On Manual Refresh
```dart
// User taps refresh button
await AppInitializer.refreshAllData(context);
// OR
await DataSyncManager.instance.syncAllModules();
```

## Best Practices

### 1. Always Initialize on Startup
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await DatabaseManager.instance.database;
  runApp(const MyApp());
}
```

### 2. Initialize Providers After Widget Tree
```dart
@override
void initState() {
  super.initState();
  AppInitializer.initializeProviders(context);
}
```

### 3. Use Provider Getters for Data
```dart
// Good - automatically notified of changes
final inventory = Provider.of<InventoryProvider>(context);
final items = inventory.items;

// Bad - stale reference
final inventory = InventoryProvider();
```

### 4. Refresh on Reconnection
```dart
DataSyncManager.instance.syncEvents.listen((event) {
  if (event.type == 'sync_completed' && event.success) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Data synced successfully')),
    );
  }
});
```

### 5. Handle Errors Gracefully
```dart
try {
  await AppInitializer.refreshAllData(context);
} catch (e) {
  print('Error refreshing data: $e');
  // App continues with cached data
}
```

## Configuration

### Change API Base URL
```dart
// In api_client.dart
ApiClient({
  this.baseUrl = 'http://your-server:5000/api',  // Change this
  http.Client? client,
})
```

### Change Database Path
The database path is determined by:
- **Release mode**: `{exe_directory}/data/tracinvent.db`
- **Debug mode**: `{documents_directory}/TracInvent/tracinvent.db`

Override in `DatabaseManager._getDatabasePath()`

### Reset Database
```dart
// Completely reset and resync
await AppInitializer.resetApplicationData();
```

## Troubleshooting

### Database Not Found
```
→ Check database path: DatabaseManager.instance.getDatabasePath()
→ Ensure directory is writable
→ Try reset: await DatabaseManager.instance.resetDatabase()
```

### Data Not Syncing
```
→ Check API health: await apiClient.checkHealth()
→ Check sync events: DataSyncManager.instance.syncEvents
→ Try manual sync: await DataSyncManager.instance.syncAllModules()
```

### Providers Not Notifying
```
→ Ensure using Provider.of() in build method
→ Check listen: true (or use Consumer)
→ Verify provider initialization completed
```

### Module Connections Failing
```
→ Check database initialization: AppInitializer.isInitialized
→ Verify all providers created in MultiProvider
→ Check logs in output panel
```

## Summary

TracInvent now has:
✅ **Unified database** - Single source of truth
✅ **Connected modules** - Shared data layer
✅ **Fresh data** - Automatic initialization and refresh
✅ **Updated data** - Cross-module notifications
✅ **Backend sync** - Optional, handles offline mode
✅ **Error recovery** - Graceful degradation

All modules work together seamlessly with a clean, maintainable architecture.
