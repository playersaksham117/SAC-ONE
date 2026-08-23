import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/sync_provider.dart';
import '../providers/navigation_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/license_provider.dart';
import 'user_management_screen.dart';
import 'dashboard_screen.dart';
import 'inventory_screen.dart';
import 'warehouses_screen.dart';
import 'transactions_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';
import 'stock_location_screen.dart';
import 'daily_transactions_screen.dart';
import 'cell_stock_view_screen.dart';
import 'adjustment_screen.dart';
import 'qr_barcode_scanner_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final List<Widget> _screens = [
    const DashboardScreen(),
    const InventoryScreen(),
    // Index kept for backward compatibility; merged with inventory.
    const InventoryScreen(),
    const StockLocationScreen(),
    const CellStockViewScreen(),
    const DailyTransactionsScreen(),
    const AdjustmentScreen(),
    const WarehousesScreen(),
    const TransactionsScreen(),
    const ReportsScreen(),
    const SettingsScreen(),
    const QrBarcodeScanner(),
    const SizedBox.shrink(), // legacy POS slot
    const SizedBox.shrink(),
    const SizedBox.shrink(),
    const SizedBox.shrink(),
    const SizedBox.shrink(),
    const SizedBox.shrink(), // legacy mobile slots
    const SizedBox.shrink(),
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final inventoryProvider =
        Provider.of<InventoryProvider>(context, listen: false);
    final warehouseProvider =
        Provider.of<WarehouseProvider>(context, listen: false);

    await inventoryProvider.loadInventoryItems();
    await warehouseProvider.loadWarehouses();
  }

  @override
  Widget build(BuildContext context) {
    final navigationProvider = Provider.of<NavigationProvider>(context);
    final selectedIndex = navigationProvider.selectedIndex;

    return Scaffold(
      body: Row(
        children: [
          // Enhanced Sidebar Navigation
          Container(
            width: 280,
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                right: BorderSide(color: Colors.grey.shade200, width: 1),
              ),
            ),
            child: Column(
              children: [
                // Logo + App Name
                Container(
                  padding: const EdgeInsets.all(24),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.inventory_2,
                          size: 32,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TracInvent',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          Text(
                            'Inventory System',
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                Divider(height: 1, color: Colors.grey.shade200),

                // Navigation Items
                Expanded(
                  child: Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      return ListView(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 16),
                        children: [
                          // ── Always visible ──────────────────────────────
                          _buildNavItem(context, 0,
                              Icons.dashboard_outlined, Icons.dashboard,
                              'Dashboard'),
                          _buildNavItem(context, 1,
                              Icons.inventory_outlined, Icons.inventory,
                              'Inventory'),

                          // ── STOCK TRACKING (staff+) ─────────────────────
                          if (auth.isStaff) ...[
                            const SizedBox(height: 8),
                            _sectionLabel('STOCK TRACKING'),
                            _buildNavItem(context, 3,
                                Icons.location_on_outlined, Icons.location_on,
                                'Stock Locations'),
                            _buildNavItem(context, 4,
                                Icons.grid_view_outlined, Icons.grid_view,
                                'Cell Stock View'),
                            _buildNavItem(context, 5,
                                Icons.calendar_today_outlined, Icons.calendar_today,
                                'Daily Log'),
                          ],

                          // ── ADJUSTMENTS (staff+) ────────────────────────
                          if (auth.isStaff) ...[
                            const SizedBox(height: 8),
                            _sectionLabel('ADJUSTMENTS'),
                            _buildNavItem(context, 6,
                                Icons.tune_outlined, Icons.tune,
                                'Adjustments & Batches'),
                          ],

                          // ── MANAGEMENT (manager+) ───────────────────────
                          if (auth.isManager) ...[
                            const SizedBox(height: 8),
                            _sectionLabel('MANAGEMENT'),
                            _buildNavItem(context, 7,
                                Icons.warehouse_outlined, Icons.warehouse,
                                'Warehouses'),
                            _buildNavItem(context, 8,
                                Icons.add_shopping_cart_outlined,
                                Icons.add_shopping_cart, 'Stock In/Out'),
                            _buildNavItem(context, 9,
                                Icons.assessment_outlined, Icons.assessment,
                                'Reports'),
                          ],

                          // ── TOOLS (staff+) ──────────────────────────────
                          if (auth.isStaff) ...[
                            const SizedBox(height: 8),
                            _sectionLabel('TOOLS'),
                            _buildNavItem(context, 11,
                                Icons.qr_code_scanner_outlined, Icons.qr_code_2,
                                'QR/Barcode Scanner'),
                          ],

                          // ── SYSTEM (admin only) ─────────────────────────
                          if (auth.isAdmin) ...[
                            const SizedBox(height: 8),
                            _sectionLabel('SYSTEM'),
                            _buildNavItem(context, 10,
                                Icons.settings_outlined, Icons.settings,
                                'Settings'),
                            // User Management inline button
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: () {
                                    Navigator.of(context).push(MaterialPageRoute(
                                      builder: (_) => const UserManagementScreen(),
                                    ));
                                  },
                                  borderRadius: BorderRadius.circular(8),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 12),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Row(
                                      children: [
                                        Icon(Icons.manage_accounts_outlined,
                                            color: Color(0xFF64748B),
                                            size: 22),
                                        SizedBox(width: 12),
                                        Text('User Management',
                                            style: TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.w500,
                                                color: Color(0xFF475569))),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      );
                    },
                  ),
                ),

                // User Profile Section
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(color: Colors.grey.shade200, width: 1),
                    ),
                  ),
                  child: Column(
                    children: [
                      // Sync Status
                      Consumer<SyncProvider>(
                        builder: (context, syncProvider, _) {
                          return Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: syncProvider.isOnline
                                  ? const Color(0xFFD1FAE5)
                                  : const Color(0xFFFEE2E2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  syncProvider.isOnline
                                      ? Icons.cloud_done
                                      : Icons.cloud_off,
                                  size: 16,
                                  color: syncProvider.isOnline
                                      ? const Color(0xFF10B981)
                                      : const Color(0xFFEF4444),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    syncProvider.isOnline
                                        ? 'Online'
                                        : 'Offline',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: syncProvider.isOnline
                                          ? const Color(0xFF10B981)
                                          : const Color(0xFFEF4444),
                                    ),
                                  ),
                                ),
                                if (syncProvider.pendingChangesCount > 0)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFF59E0B),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      '${syncProvider.pendingChangesCount}',
                                      style: const TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                if (syncProvider.syncStatus ==
                                    SyncStatus.syncing)
                                  const SizedBox(
                                    width: 12,
                                    height: 12,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  ),
                                if (syncProvider.isOnline &&
                                    syncProvider.syncStatus !=
                                        SyncStatus.syncing)
                                  IconButton(
                                    icon: const Icon(Icons.sync, size: 16),
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(),
                                    onPressed: () =>
                                        syncProvider.forceSyncNow(),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),

                      // User Profile
                      Consumer<AuthProvider>(
                        builder: (context, auth, _) {
                          final name    = auth.currentUser?['name']  ?? 'User';
                          final role    = auth.userRole;
                          final initial = name.isNotEmpty
                              ? name.substring(0, 1).toUpperCase()
                              : 'U';

                          return Row(
                            children: [
                              CircleAvatar(
                                radius: 20,
                                backgroundColor:
                                    const Color(0xFF2563EB).withValues(alpha: 0.1),
                                child: Text(initial,
                                    style: const TextStyle(
                                        color: Color(0xFF2563EB),
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name,
                                        style: const TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFF0F172A)),
                                        overflow: TextOverflow.ellipsis),
                                    Text(
                                      _roleLabel(role),
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: _roleColor(role)),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'Sign out',
                                icon: Icon(Icons.logout, size: 18,
                                    color: Colors.grey.shade600),
                                onPressed: () async { await auth.logout(); },
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Main Content
          Expanded(
            child: _screens[selectedIndex],
          ),
        ],
      ),
    );
  }

  String _roleLabel(String role) {
    const map = {
      'admin':   'Administrator',
      'manager': 'Manager',
      'staff':   'Staff',
      'viewer':  'Viewer',
    };
    return map[role] ?? role;
  }

  Color _roleColor(String role) {
    switch (role) {
      case 'admin':   return const Color(0xFF2563EB);
      case 'manager': return const Color(0xFF7C3AED);
      case 'staff':   return const Color(0xFF059669);
      default:        return const Color(0xFF6B7280);
    }
  }

  Widget _sectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: Colors.grey.shade500,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    int index,
    IconData icon,
    IconData selectedIcon,
    String label, {
    String? feature,
  }) {
    final navigationProvider =
        Provider.of<NavigationProvider>(context, listen: false);
    final license = Provider.of<LicenseProvider>(context, listen: false);
    final isSelected = navigationProvider.selectedIndex == index;
    final locked = feature != null && !license.canAccess(feature);

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            if (locked) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(license.upgradeMessage(feature))),
              );
              return;
            }
            navigationProvider.navigateTo(index);
          },
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isSelected
                  ? const Color(0xFF2563EB).withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  isSelected ? selectedIcon : icon,
                  color: locked
                      ? Colors.grey.shade400
                      : isSelected
                          ? const Color(0xFF2563EB)
                          : const Color(0xFF64748B),
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: locked
                          ? Colors.grey.shade400
                          : isSelected
                              ? const Color(0xFF2563EB)
                              : const Color(0xFF475569),
                    ),
                  ),
                ),
                if (locked) Icon(Icons.lock, size: 14, color: Colors.grey.shade400),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
