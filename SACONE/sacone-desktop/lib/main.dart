import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'dart:io';

import 'providers/inventory_provider.dart';
import 'providers/warehouse_provider.dart';
import 'providers/sync_provider.dart';
import 'providers/settings_provider.dart';
import 'providers/stock_entry_provider.dart';
import 'providers/update_provider.dart';
import 'providers/stock_search_provider.dart';
import 'providers/adjustment_provider.dart';
import 'providers/navigation_provider.dart';
import 'providers/reports_provider.dart';
import 'providers/retail_providers.dart';
import 'providers/phase2_providers.dart';
import 'providers/auth_provider.dart';
import 'providers/license_provider.dart';
import 'screens/licensing/license_gate.dart';
import 'screens/home_screen.dart';
import 'screens/auth/auth_gate.dart';
import 'widgets/update_dialog.dart';
import 'services/unified_database_manager.dart';
import 'services/app_initializer.dart';

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

class _AppInitializer extends StatefulWidget {
  final Widget child;
  
  const _AppInitializer({required this.child});

  @override
  State<_AppInitializer> createState() => _AppInitializerState();
}

class _AppInitializerState extends State<_AppInitializer> {
  bool _initialized = false;
  
  @override
  void initState() {
    super.initState();
    _initialize();
  }
  
  Future<void> _initialize() async {
    try {
      // Initialize all providers
      if (mounted) {
        await AppInitializer.initializeProviders(context);
      }
      
      // Check for updates (after a short delay)
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) {
          final updateProvider = Provider.of<UpdateProvider>(context, listen: false);
          updateProvider.checkForUpdates(silent: true).then((_) {
            if (mounted && updateProvider.hasUpdate) {
              // Show update dialog
              showUpdateDialog(context);
            }
          });
        }
      });
      
      setState(() => _initialized = true);
    } catch (e) {
      debugPrint('Error initializing app: $e');
      setState(() => _initialized = true); // Still show app
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return const Scaffold(
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
      );
    }
    return widget.child;
  }
}

class TracInventApp extends StatelessWidget {
  const TracInventApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => SupplierProvider()),
        ChangeNotifierProvider(create: (_) => CustomerProvider()),
        ChangeNotifierProvider(create: (_) => PurchaseProvider()),
        ChangeNotifierProvider(create: (_) => PosProvider()),
        ChangeNotifierProvider(create: (_) => LedgerProvider()),
        ChangeNotifierProvider(create: (_) => RetailReportsProvider()),
        ChangeNotifierProvider(create: (_) => Phase2Provider()),
        ChangeNotifierProvider(create: (_) => LicenseProvider()..initialize()),
        ChangeNotifierProvider(create: (_) => SettingsProvider()..loadSettings()),
        ChangeNotifierProvider(create: (_) => InventoryProvider()),
        ChangeNotifierProvider(create: (_) => WarehouseProvider()),
        ChangeNotifierProvider(create: (_) => ReportsProvider()),
        ChangeNotifierProvider(create: (_) => SyncProvider()),
        ChangeNotifierProvider(create: (_) => StockEntryProvider()),
        ChangeNotifierProvider(create: (_) => StockSearchProvider()),
        ChangeNotifierProvider(create: (_) => UpdateProvider()),
        ChangeNotifierProvider(create: (_) => AdjustmentProvider()),
        ChangeNotifierProvider(create: (_) => NavigationProvider()),
      ],
      child: MaterialApp(
        title: 'TracInvent - Inventory Tracker',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF2563EB),
            brightness: Brightness.light,
          ),
          textTheme: GoogleFonts.interTextTheme(),
          useMaterial3: true,
          cardTheme: CardThemeData(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        home: const AuthGate(
          child: LicenseGate(
            child: _AppInitializer(
              child: HomeScreen(),
            ),
          ),
        ),
      ),
    );
  }
}
