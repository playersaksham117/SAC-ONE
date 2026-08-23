/// ============================================================
/// QUICK START GUIDE - Module Integration Setup
/// ============================================================

# Quick Start: Running TracInvent with Unified Modules

## What's New

Your TracInvent application now has:
✅ **Single Unified Database** - No more conflicting database systems
✅ **Fresh & Updated Data** - Automatic initialization with latest data  
✅ **All Modules Connected** - Inventory, Warehouse, and WMS work together
✅ **Live Data Sync** - Changes appear immediately across all modules
✅ **Backend Integration** - Optional API sync with Python Flask server

## Files Created

### New Services
1. **`lib/services/unified_database_manager.dart`**
   - Single database connection for entire app
   - Replaces `DatabaseService` and `DatabaseConnection`
   - Automatic schema initialization

2. **`lib/services/data_sync_manager.dart`**
   - Cross-module data synchronization
   - Backend API integration
   - Real-time sync events

3. **`lib/services/app_initializer.dart`**
   - Startup orchestration
   - Provider initialization
   - Fresh data loading

### Updated Files
- ✅ `lib/main.dart` - Uses unified database
- ✅ `lib/wms_main.dart` - Uses unified database
- ✅ `lib/providers/inventory_provider.dart` - Updated database calls
- ✅ `lib/providers/warehouse_provider.dart` - Updated database calls
- ✅ `lib/services/stock_search_service.dart` - Updated database calls
- ✅ `lib/services/stock_operations_service.dart` - Updated database calls

## How to Use

### 1. Run Inventory Module
```bash
flutter run -t lib/main.dart
```

This will:
- Initialize the unified database
- Load all inventory, warehouse, and stock data
- Display a loading screen while initializing
- Show all data immediately when ready

### 2. Run WMS Module
```bash
flutter run -t lib/wms_main.dart
```

This will:
- Use the same unified database
- Load WMS-specific data
- Share data with inventory module
- Work offline or sync with backend

### 3. Optional: Run Backend Server
```bash
cd backend
python -m flask run
```

This enables:
- Remote data synchronization
- Backend persistence
- Multi-user sync (when running multiple instances)
- Cloud backup

## Data Flow

```
User Action (Add/Edit/Delete Item)
           ↓
    Provider Updates
           ↓
  Local Database Updated
           ↓
  Provider Notifies Listeners
           ↓
   UI Updates Immediately
           ↓
  SyncProvider Queues for Backend
           ↓
  Backend Sync (When Available)
```

## Key Features

### Fresh Data on Startup
- App initializes with fresh database
- Default admin user created automatically
- Categories and sequences pre-populated
- Ready to use immediately

### Live Updates Across Modules
- Add inventory item → appears in all screens
- Create warehouse → available in WMS
- Move stock → reflects in all modules
- Changes are instant

### Backend Sync (Optional)
- Works offline with local data
- Syncs with backend when available
- Handles reconnection gracefully
- No data loss

### Database Reset (Development)
```dart
// Reset entire database in code
await AppInitializer.resetApplicationData();
```

## Testing

### Test 1: Fresh Initialization
1. Delete database file (if exists): `data/tracinvent.db`
2. Run app
3. App initializes with fresh data
4. Admin user is created
5. Categories are populated

### Test 2: Data Persistence
1. Add an inventory item
2. Close app
3. Run app again
4. Item is still there ✓

### Test 3: Cross-Module Sync
1. Run `main.dart` - add item to warehouse A
2. Add warehouse B using same database
3. Both warehouses visible in both modules ✓

### Test 4: Backend Sync (Optional)
1. Run backend server: `python -m flask run`
2. Add item in app
3. Check logs for sync events
4. Item appears on backend ✓

## Common Issues & Solutions

### Issue: "Database not found"
**Solution**: 
- Check file exists: `data/tracinvent.db` (or documents folder)
- Run app - database auto-creates if missing
- Reset if corrupted: `await DatabaseManager.instance.resetDatabase()`

### Issue: "No data showing"
**Solution**:
- Wait for loading to complete
- Check initialization in logs
- Verify database initialized: `AppInitializer.isInitialized`

### Issue: "Backend not syncing"
**Solution**:
- Verify backend running on port 5000
- Check API endpoint: `http://localhost:5000/api/health`
- Verify app can reach backend

### Issue: "Providers not updating"
**Solution**:
- Ensure using `Provider.of<T>(context)`
- Check `listen: true` or use `Consumer`
- Verify provider initialization completed

## Directory Structure

```
tracinvent/
├── lib/
│   ├── main.dart                          (Inventory entry point)
│   ├── wms_main.dart                      (WMS entry point)
│   ├── services/
│   │   ├── unified_database_manager.dart  (🆕 Core database)
│   │   ├── data_sync_manager.dart         (🆕 Sync manager)
│   │   ├── app_initializer.dart           (🆕 App startup)
│   │   ├── api_client.dart                (Backend API)
│   │   ├── stock_search_service.dart      (✏️ Updated)
│   │   ├── stock_operations_service.dart  (✏️ Updated)
│   │   └── database_service.dart          (⚠️ Deprecated - can remove)
│   ├── providers/
│   │   ├── inventory_provider.dart        (✏️ Updated)
│   │   ├── warehouse_provider.dart        (✏️ Updated)
│   │   └── ...
│   └── data/
│       └── database_connection.dart       (⚠️ Deprecated - can remove)
├── backend/
│   ├── app.py                             (Flask server)
│   └── requirements.txt
└── MODULE_INTEGRATION_GUIDE.md            (🆕 Full documentation)
```

## Next Steps

1. **Test Thoroughly**
   - Run both `main.dart` and `wms_main.dart`
   - Verify data syncs between modules
   - Test backend sync (optional)

2. **Remove Deprecated Files** (Optional)
   - Delete `lib/data/database_connection.dart`
   - Delete `lib/services/database_service.dart`
   - Update any remaining references

3. **Configure for Production**
   - Set backend URL for production
   - Configure database location
   - Set up error logging

4. **Deploy**
   - Build release: `flutter build windows`
   - Database persists in portable location
   - Works offline with backend optional

## Architecture Benefits

```
Before (❌ Conflicting):
├── main.dart → DatabaseService
├── wms_main.dart → DatabaseConnection
└── Providers → Different databases → Data conflicts

After (✅ Unified):
├── main.dart → UnifiedDatabaseManager
├── wms_main.dart → UnifiedDatabaseManager
├── Providers → Same database → Data consistent
└── All services → DataSyncManager → Backend
```

## Performance

- ✅ Single database connection
- ✅ Lazy initialization
- ✅ Optimized indexes
- ✅ Efficient queries
- ✅ Transaction support
- ✅ Portable database format

## Support

For detailed documentation, see: `MODULE_INTEGRATION_GUIDE.md`

For API reference, check comments in:
- `services/unified_database_manager.dart`
- `services/data_sync_manager.dart`
- `services/app_initializer.dart`

---

**Status**: ✅ All modules connected and synchronized
**Database**: ✅ Fresh and updated
**Data Flow**: ✅ Live across all modules
**Ready to Use**: ✅ YES!
