/// ============================================================
/// DASHBOARD SCREEN - Overview and alerts
/// ============================================================
/// 
/// Displays key metrics, alerts, and recent activity.
/// Entry point after login.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import '../domain/entities/stock_movement.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().refreshIfNeeded();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<DashboardProvider>().forceRefresh();
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Consumer<DashboardProvider>(
        builder: (context, dashboard, _) {
          if (dashboard.isLoading && dashboard.lastRefresh == null) {
            return const Center(child: CircularProgressIndicator());
          }
          
          return RefreshIndicator(
            onRefresh: () => dashboard.forceRefresh(),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome header
                  _WelcomeHeader(),
                  const SizedBox(height: 24),
                  
                  // Stats cards
                  _StatsGrid(stats: dashboard.stats),
                  const SizedBox(height: 24),
                  
                  // Alerts section
                  _AlertsSection(
                    expiringCount: dashboard.stats.expiringItemsCount,
                    lowStockCount: dashboard.stats.lowStockCount,
                    outOfStockCount: dashboard.stats.outOfStockCount,
                  ),
                  const SizedBox(height: 24),
                  
                  // Two column layout for lists
                  LayoutBuilder(
                    builder: (context, constraints) {
                      if (constraints.maxWidth > 900) {
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: _RecentMovementsCard(
                                movements: dashboard.recentMovements,
                              ),
                            ),
                            const SizedBox(width: 24),
                            Expanded(
                              child: _LowStockCard(
                                items: dashboard.lowStockItems,
                              ),
                            ),
                          ],
                        );
                      }
                      return Column(
                        children: [
                          _RecentMovementsCard(
                            movements: dashboard.recentMovements,
                          ),
                          const SizedBox(height: 24),
                          _LowStockCard(
                            items: dashboard.lowStockItems,
                          ),
                        ],
                      );
                    },
                  ),
                  
                  // Last updated
                  if (dashboard.lastRefresh != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Text(
                        'Last updated: ${_formatDateTime(dashboard.lastRefresh!)}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
  
  String _formatDateTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
    if (diff.inHours < 24) return '${diff.inHours} hours ago';
    return '${dt.day}/${dt.month}/${dt.year} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _WelcomeHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.currentUser;
    final colorScheme = Theme.of(context).colorScheme;
    
    final greeting = _getGreeting();
    
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$greeting${user != null ? ', ${user.firstName}' : ''}',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Here\'s your warehouse overview',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: colorScheme.outline,
                ),
              ),
            ],
          ),
        ),
        // Quick actions
        FilledButton.tonalIcon(
          onPressed: () {
            // Navigate to stock in
          },
          icon: const Icon(Icons.add),
          label: const Text('Stock In'),
        ),
        const SizedBox(width: 12),
        OutlinedButton.icon(
          onPressed: () {
            // Navigate to stock out
          },
          icon: const Icon(Icons.remove),
          label: const Text('Stock Out'),
        ),
      ],
    );
  }
  
  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _StatsGrid extends StatelessWidget {
  final DashboardStats stats;
  
  const _StatsGrid({required this.stats});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth > 1200 ? 5 : 
                               constraints.maxWidth > 800 ? 4 : 
                               constraints.maxWidth > 500 ? 3 : 2;
        
        return GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: crossAxisCount,
          mainAxisSpacing: 16,
          crossAxisSpacing: 16,
          childAspectRatio: 1.5,
          children: [
            _StatCard(
              title: 'Total Items',
              value: stats.totalItems.toString(),
              icon: Icons.inventory_2_outlined,
              color: Colors.blue,
            ),
            _StatCard(
              title: 'Warehouses',
              value: stats.totalWarehouses.toString(),
              icon: Icons.warehouse_outlined,
              color: Colors.indigo,
            ),
            _StatCard(
              title: 'Locations',
              value: stats.totalLocations.toString(),
              icon: Icons.location_on_outlined,
              color: Colors.teal,
            ),
            _StatCard(
              title: 'Today Movements',
              value: stats.todayMovements.toString(),
              icon: Icons.swap_horiz,
              color: Colors.orange,
            ),
            _StatCard(
              title: 'Pending',
              value: stats.pendingMovements.toString(),
              icon: Icons.pending_actions,
              color: Colors.purple,
            ),
          ],
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  
  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colorScheme.outline,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertsSection extends StatelessWidget {
  final int expiringCount;
  final int lowStockCount;
  final int outOfStockCount;
  
  const _AlertsSection({
    required this.expiringCount,
    required this.lowStockCount,
    required this.outOfStockCount,
  });

  @override
  Widget build(BuildContext context) {
    final hasAlerts = expiringCount > 0 || lowStockCount > 0 || outOfStockCount > 0;
    
    if (!hasAlerts) {
      return Card(
        color: Colors.green.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green.shade700),
              const SizedBox(width: 12),
              Text(
                'All systems normal - no alerts',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.green.shade700,
                ),
              ),
            ],
          ),
        ),
      );
    }
    
    return Wrap(
      spacing: 16,
      runSpacing: 16,
      children: [
        if (outOfStockCount > 0)
          _AlertChip(
            label: '$outOfStockCount Out of Stock',
            icon: Icons.error_outline,
            color: Colors.red,
            onTap: () {
              // Navigate to out of stock items
            },
          ),
        if (lowStockCount > 0)
          _AlertChip(
            label: '$lowStockCount Low Stock',
            icon: Icons.warning_amber_rounded,
            color: Colors.orange,
            onTap: () {
              // Navigate to low stock items
            },
          ),
        if (expiringCount > 0)
          _AlertChip(
            label: '$expiringCount Expiring Soon',
            icon: Icons.schedule,
            color: Colors.amber.shade700,
            onTap: () {
              // Navigate to expiring items
            },
          ),
      ],
    );
  }
}

class _AlertChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  
  const _AlertChip({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(100),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(100),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: color, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentMovementsCard extends StatelessWidget {
  final List<StockMovement> movements;
  
  const _RecentMovementsCard({required this.movements});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Recent Movements',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                TextButton(
                  onPressed: () {
                    // Navigate to movements
                  },
                  child: const Text('View All'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (movements.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    'No recent movements',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.outline,
                    ),
                  ),
                ),
              )
            else
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: movements.take(5).length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final movement = movements[index];
                  return _MovementTile(movement: movement);
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _MovementTile extends StatelessWidget {
  final StockMovement movement;
  
  const _MovementTile({required this.movement});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    final (icon, color) = switch (movement.movementType) {
      MovementType.stockIn => (Icons.arrow_downward, Colors.green),
      MovementType.stockOut => (Icons.arrow_upward, Colors.red),
      MovementType.transfer => (Icons.swap_horiz, Colors.blue),
      MovementType.adjustment => (Icons.tune, Colors.orange),
      MovementType.cycleCount => (Icons.fact_check, Colors.purple),
      MovementType.return_ => (Icons.undo, Colors.teal),
      MovementType.write_off => (Icons.delete_outline, Colors.grey),
    };
    
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(
        movement.referenceNumber ?? movement.movementType.name,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        '${movement.movementType.name.toUpperCase()} - Qty: ${movement.quantity}',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: colorScheme.outline,
        ),
      ),
      trailing: Text(
        _formatTime(movement.createdAt),
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: colorScheme.outline,
        ),
      ),
    );
  }
  
  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${dt.day}/${dt.month}';
  }
}

class _LowStockCard extends StatelessWidget {
  final List items;
  
  const _LowStockCard({required this.items});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.warning_amber_rounded,
                      color: Colors.orange,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Low Stock Items',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () {
                    // Navigate to low stock
                  },
                  child: const Text('View All'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    'No low stock items',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.outline,
                    ),
                  ),
                ),
              )
            else
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: items.take(5).length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      item.itemName ?? 'Unknown Item',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    subtitle: Text(
                      'Available: ${item.availableQuantity}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.orange,
                      ),
                    ),
                    trailing: FilledButton.tonal(
                      onPressed: () {
                        // Stock in for this item
                      },
                      child: const Text('Restock'),
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}
