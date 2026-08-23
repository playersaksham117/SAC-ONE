/// ============================================================
/// MAIN SHELL - Navigation scaffold for WMS
/// ============================================================
/// 
/// Desktop-optimized navigation with rail + content layout.
/// Responsive: rail on desktop, bottom nav on mobile.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import 'wms_dashboard_screen.dart';
import 'wms_inventory_screen.dart';
import 'wms_locations_screen.dart';
import 'wms_stock_operations_screen.dart';
import 'wms_movements_screen.dart';
import 'wms_users_screen.dart';
import 'wms_settings_screen.dart';

/// Navigation destinations
enum NavDestination {
  dashboard(
    icon: Icons.dashboard_outlined,
    selectedIcon: Icons.dashboard,
    label: 'Dashboard',
  ),
  inventory(
    icon: Icons.inventory_2_outlined,
    selectedIcon: Icons.inventory_2,
    label: 'Inventory',
  ),
  locations(
    icon: Icons.location_on_outlined,
    selectedIcon: Icons.location_on,
    label: 'Locations',
  ),
  operations(
    icon: Icons.swap_horiz_rounded,
    selectedIcon: Icons.swap_horiz,
    label: 'Operations',
  ),
  movements(
    icon: Icons.history_outlined,
    selectedIcon: Icons.history,
    label: 'Movements',
  ),
  users(
    icon: Icons.people_outline,
    selectedIcon: Icons.people,
    label: 'Users',
  ),
  settings(
    icon: Icons.settings_outlined,
    selectedIcon: Icons.settings,
    label: 'Settings',
  );

  const NavDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _selectedIndex = 0;
  bool _isRailExtended = false;

  @override
  void initState() {
    super.initState();
    // Load initial data
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().loadDashboard();
      context.read<WarehouseProvider>().loadWarehouses();
    });
  }

  /// Get available destinations based on user role
  List<NavDestination> get _destinations {
    final auth = context.watch<AuthProvider>();
    final user = auth.currentUser;
    
    if (user == null) return [];
    
    final destinations = <NavDestination>[
      NavDestination.dashboard,
      NavDestination.inventory,
      NavDestination.locations,
      NavDestination.operations,
      NavDestination.movements,
    ];
    
    // Only admin can manage users
    if (user.role.canManageUsers) {
      destinations.add(NavDestination.users);
    }
    
    destinations.add(NavDestination.settings);
    
    return destinations;
  }

  Widget _buildBody(NavDestination destination) {
    return switch (destination) {
      NavDestination.dashboard => const DashboardScreen(),
      NavDestination.inventory => const InventoryScreen(),
      NavDestination.locations => const LocationsScreen(),
      NavDestination.operations => const StockOperationsScreen(),
      NavDestination.movements => const MovementsScreen(),
      NavDestination.users => const UsersScreen(),
      NavDestination.settings => const SettingsScreen(),
    };
  }

  void _handleLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    
    if (confirm == true && mounted) {
      context.read<AuthProvider>().logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final destinations = _destinations;
    final colorScheme = Theme.of(context).colorScheme;
    final isNarrow = MediaQuery.of(context).size.width < 600;
    final auth = context.watch<AuthProvider>();
    
    // Ensure index is valid
    if (_selectedIndex >= destinations.length) {
      _selectedIndex = 0;
    }
    
    final currentDestination = destinations.isNotEmpty 
        ? destinations[_selectedIndex] 
        : NavDestination.dashboard;
    
    if (isNarrow) {
      // Mobile layout with bottom navigation
      return Scaffold(
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: _buildBody(currentDestination),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _selectedIndex,
          onDestinationSelected: (index) {
            setState(() => _selectedIndex = index);
          },
          destinations: destinations.map((d) => NavigationDestination(
            icon: Icon(d.icon),
            selectedIcon: Icon(d.selectedIcon),
            label: d.label,
          )).toList(),
        ),
      );
    }
    
    // Desktop layout with navigation rail
    return Scaffold(
      body: Row(
        children: [
          // Navigation Rail
          NavigationRail(
            extended: _isRailExtended,
            minExtendedWidth: 200,
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) {
              setState(() => _selectedIndex = index);
            },
            leading: Column(
              children: [
                const SizedBox(height: 8),
                // Expand/collapse button
                IconButton(
                  icon: Icon(_isRailExtended ? Icons.menu_open : Icons.menu),
                  onPressed: () {
                    setState(() => _isRailExtended = !_isRailExtended);
                  },
                  tooltip: _isRailExtended ? 'Collapse' : 'Expand',
                ),
                const SizedBox(height: 8),
              ],
            ),
            trailing: Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Divider(),
                    // User info
                    if (_isRailExtended && auth.currentUser != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              auth.currentUser!.fullName,
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              auth.currentUser!.role.displayName,
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: colorScheme.outline,
                              ),
                            ),
                          ],
                        ),
                      ),
                    // Logout button
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: _isRailExtended
                          ? TextButton.icon(
                              onPressed: _handleLogout,
                              icon: const Icon(Icons.logout),
                              label: const Text('Sign out'),
                              style: TextButton.styleFrom(
                                foregroundColor: colorScheme.error,
                              ),
                            )
                          : IconButton(
                              onPressed: _handleLogout,
                              icon: const Icon(Icons.logout),
                              tooltip: 'Sign out',
                              color: colorScheme.error,
                            ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
            destinations: destinations.map((d) => NavigationRailDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selectedIcon),
              label: Text(d.label),
            )).toList(),
          ),
          
          // Divider
          VerticalDivider(
            thickness: 1,
            width: 1,
            color: colorScheme.outlineVariant,
          ),
          
          // Main content
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: _buildBody(currentDestination),
            ),
          ),
        ],
      ),
    );
  }
}
