import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/inventory_provider.dart';
import '../../providers/warehouse_provider.dart';
import '../../providers/navigation_provider.dart';
import '../../providers/sync_provider.dart';
import '../../services/unified_database_manager.dart';
import '../retail/pos_billing_screen.dart';

/// Mobile inventory companion — stock lookup, transfer, adjustment, warehouse search.
class MobileInventoryHubScreen extends StatefulWidget {
  const MobileInventoryHubScreen({super.key});

  @override
  State<MobileInventoryHubScreen> createState() => _MobileInventoryHubScreenState();
}

class _MobileInventoryHubScreenState extends State<MobileInventoryHubScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InventoryProvider>().loadInventoryItems();
      context.read<WarehouseProvider>().loadWarehouses();
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mobile Inventory')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _search,
            decoration: InputDecoration(
              labelText: 'Barcode / SKU lookup',
              prefixIcon: const Icon(Icons.qr_code_scanner),
              suffixIcon: IconButton(
                icon: const Icon(Icons.search),
                onPressed: () => _lookup(_search.text),
              ),
              border: const OutlineInputBorder(),
            ),
            onSubmitted: _lookup,
          ),
          const SizedBox(height: 16),
          _actionTile(Icons.point_of_sale, 'POS Billing', 'Barcode scan & checkout', () {
            context.read<NavigationProvider>().goToMobilePos();
          }),
          _actionTile(Icons.inventory_2, 'Stock Lookup', 'Search items & quantities', () {
            context.read<NavigationProvider>().goToInventory();
          }),
          _actionTile(Icons.swap_horiz, 'Stock Transfer', 'Move stock between warehouses', () {
            context.read<NavigationProvider>().goToStockInOut();
          }),
          _actionTile(Icons.tune, 'Stock Adjustment', 'Adjust qty with audit trail', () {
            context.read<NavigationProvider>().goToAdjustments();
          }),
          _actionTile(Icons.warehouse, 'Warehouse Search', 'Browse warehouse stock', () {
            context.read<NavigationProvider>().goToStockLocations();
          }),
          const Divider(height: 32),
          const Text('Quick stock check', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Consumer<InventoryProvider>(
            builder: (context, inv, _) {
              return Column(
                children: inv.items.take(10).map((item) {
                  return ListTile(
                    title: Text(item.name),
                    subtitle: Text('${item.sku} • Qty ${item.totalQuantity.toStringAsFixed(0)}'),
                    trailing: Text('₹${item.sellingPrice.toStringAsFixed(0)}'),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _actionTile(IconData icon, String title, String sub, VoidCallback onTap) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF2563EB)),
        title: Text(title),
        subtitle: Text(sub),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }

  Future<void> _lookup(String code) async {
    if (code.trim().isEmpty) return;
    final db = await DatabaseManager.instance.database;
    final rows = await db.query(
      'inventory_items',
      where: 'barcode = ? OR sku = ? OR name LIKE ?',
      whereArgs: [code, code, '%$code%'],
      limit: 5,
    );
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Lookup Results'),
        content: SizedBox(
          width: 320,
          child: rows.isEmpty
              ? const Text('No items found')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: rows.map((r) => ListTile(
                    title: Text(r['name'] as String),
                    subtitle: Text('SKU ${r['sku']}'),
                  )).toList(),
                ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
      ),
    );
  }
}

/// Mobile POS — offline-capable billing with barcode scan and invoice share hook.
class MobilePosScreen extends StatelessWidget {
  const MobilePosScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mobile POS'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            tooltip: 'Share invoice',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Complete a sale, then share from invoice details')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.cloud_off),
            tooltip: 'Offline mode — sync queue active',
            onPressed: () {
              final pending = context.read<SyncProvider>().pendingChangesCount;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$pending pending change(s) — sync when online')),
              );
            },
          ),
        ],
      ),
      body: const PosBillingScreen(),
    );
  }
}
