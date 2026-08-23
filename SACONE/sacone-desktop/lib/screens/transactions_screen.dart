import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/stock_entry_provider.dart';
import '../providers/navigation_provider.dart';
import '../models/stock.dart';
import '../models/inventory_item.dart';
import '../models/location.dart';

/// Stock In/Out Screen - For adding purchase (stock in) and sale (stock out) transactions
class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  String _selectedType = 'All';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      final inventoryProvider =
          Provider.of<InventoryProvider>(context, listen: false);
      final warehouseProvider =
          Provider.of<WarehouseProvider>(context, listen: false);

      await Future.wait([
        inventoryProvider.loadTransactions(),
        inventoryProvider.loadInventoryItems(),
        warehouseProvider.loadWarehouses(),
      ]);
    } catch (e) {
      debugPrint('Error loading data: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          // Top Bar
          _buildTopBar(context),

          // Quick Action Cards
          _buildQuickActions(context),

          // Recent Transactions List
          Expanded(
            child: _buildRecentTransactions(context),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return Consumer<InventoryProvider>(
      builder: (context, inventoryProvider, _) {
        final lowStockCount = inventoryProvider.lowStockItems.length;
        final criticalStockCount = inventoryProvider.criticalStockItems.length;
        final totalAlerts = lowStockCount + criticalStockCount;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
              bottom: BorderSide(color: Colors.grey.shade200),
            ),
          ),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Stock In/Out',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF0F172A),
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Record purchases (stock in) and sales (stock out)',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              // Stock Alerts Notification Bell
              if (totalAlerts > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 16),
                  child: _buildStockAlertButton(context, inventoryProvider,
                      totalAlerts, criticalStockCount),
                ),
              OutlinedButton.icon(
                onPressed: _loadData,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Refresh'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF475569),
                  side: BorderSide(color: Colors.grey.shade300),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStockAlertButton(BuildContext context,
      InventoryProvider inventoryProvider, int totalAlerts, int criticalCount) {
    final hasCritical = criticalCount > 0;

    return PopupMenuButton<String>(
      tooltip: 'Stock Alerts',
      offset: const Offset(0, 50),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color:
              hasCritical ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: hasCritical
                ? const Color(0xFFEF4444).withValues(alpha: 0.3)
                : const Color(0xFFF59E0B).withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              children: [
                Icon(
                  Icons.notifications_active,
                  color: hasCritical
                      ? const Color(0xFFEF4444)
                      : const Color(0xFFF59E0B),
                  size: 20,
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: hasCritical
                          ? const Color(0xFFEF4444)
                          : const Color(0xFFF59E0B),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    constraints: const BoxConstraints(
                      minWidth: 14,
                      minHeight: 14,
                    ),
                    child: Text(
                      '$totalAlerts',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 8),
            Text(
              'Stock Alerts',
              style: TextStyle(
                color: hasCritical
                    ? const Color(0xFFEF4444)
                    : const Color(0xFFF59E0B),
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.arrow_drop_down,
              color: hasCritical
                  ? const Color(0xFFEF4444)
                  : const Color(0xFFF59E0B),
              size: 20,
            ),
          ],
        ),
      ),
      itemBuilder: (context) {
        final criticalItems = inventoryProvider.criticalStockItems;
        final lowItems = inventoryProvider.lowStockItems
            .where((item) => !criticalItems.contains(item))
            .toList();

        return [
          // Header
          PopupMenuItem<String>(
            enabled: false,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded,
                      color: Colors.grey.shade700, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Stock Alerts ($totalAlerts)',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade800,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const PopupMenuDivider(),
          // Critical items
          if (criticalItems.isNotEmpty) ...[
            PopupMenuItem<String>(
              enabled: false,
              height: 32,
              child: Text(
                'CRITICAL (${criticalItems.length})',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFEF4444),
                ),
              ),
            ),
            ...criticalItems.take(5).map((item) {
              final stock = inventoryProvider.getTotalStock(item.id);
              return PopupMenuItem<String>(
                value: item.id,
                onTap: () => _navigateToStockSearch(item),
                child: _buildAlertMenuItem(item, stock, true),
              );
            }),
            if (criticalItems.length > 5)
              PopupMenuItem<String>(
                enabled: false,
                height: 32,
                child: Text(
                  '... and ${criticalItems.length - 5} more critical items',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
          ],
          // Low stock items
          if (lowItems.isNotEmpty) ...[
            const PopupMenuDivider(),
            PopupMenuItem<String>(
              enabled: false,
              height: 32,
              child: Text(
                'LOW STOCK (${lowItems.length})',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFF59E0B),
                ),
              ),
            ),
            ...lowItems.take(5).map((item) {
              final stock = inventoryProvider.getTotalStock(item.id);
              return PopupMenuItem<String>(
                value: item.id,
                onTap: () => _navigateToStockSearch(item),
                child: _buildAlertMenuItem(item, stock, false),
              );
            }),
            if (lowItems.length > 5)
              PopupMenuItem<String>(
                enabled: false,
                height: 32,
                child: Text(
                  '... and ${lowItems.length - 5} more low stock items',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
          ],
          const PopupMenuDivider(),
          // View all action
          PopupMenuItem<String>(
            value: 'view_all',
            onTap: () {
              final navigationProvider =
                  Provider.of<NavigationProvider>(context, listen: false);
              navigationProvider.goToDashboard();
            },
            child: Row(
              children: [
                Icon(Icons.dashboard_outlined,
                    color: Colors.grey.shade700, size: 18),
                const SizedBox(width: 8),
                const Text(
                  'View All in Dashboard',
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ];
      },
    );
  }

  Widget _buildAlertMenuItem(
      InventoryItem item, double stock, bool isCritical) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color:
                isCritical ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            isCritical ? Icons.error_outline : Icons.warning_amber_rounded,
            color:
                isCritical ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
            size: 14,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.name,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                'Stock: ${stock.toInt()} ${item.unit} • Reorder at: ${item.reorderLevel.toInt()}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _navigateToStockSearch(InventoryItem item) {
    final navigationProvider =
        Provider.of<NavigationProvider>(context, listen: false);
    navigationProvider.goToStockSearch();
    // Optionally, you could pass the item to search for
  }

  Widget _buildQuickActions(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Stack(
        children: [
          Row(
            children: [
              // Stock In (Purchase) Card
              Expanded(
                child: _buildActionCard(
                  context,
                  title: 'Stock In',
                  subtitle: 'Record a purchase',
                  description: 'Add inventory from supplier',
                  icon: Icons.add_shopping_cart,
                  color: const Color(0xFF10B981),
                  onTap: () => _showTransactionDialog(context, 'purchase'),
                ),
              ),
              const SizedBox(width: 24),

              // Stock Out (Sale) Card
              Expanded(
                child: _buildActionCard(
                  context,
                  title: 'Stock Out',
                  subtitle: 'Record a sale',
                  description: 'Remove inventory for customer',
                  icon: Icons.shopping_cart_checkout,
                  color: const Color(0xFF3B82F6),
                  onTap: () => _showTransactionDialog(context, 'sale'),
                ),
              ),
              const SizedBox(width: 24),

              // Stock Adjustment Card
              Expanded(
                child: _buildActionCard(
                  context,
                  title: 'Adjustment',
                  subtitle: 'Adjust stock quantity',
                  description: 'Correct inventory discrepancies',
                  icon: Icons.tune,
                  color: const Color(0xFFF59E0B),
                  onTap: () => _showAdjustmentDialog(context),
                ),
              ),
            ],
          ),
          if (_isLoading)
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('Loading data...',
                          style: TextStyle(fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildActionCard(
    BuildContext context, {
    required String title,
    required String subtitle,
    required String description,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade200),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.1),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: color, size: 32),
                  ),
                  const Spacer(),
                  Icon(Icons.arrow_forward, color: color),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                title,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                description,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentTransactions(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.history, color: Color(0xFF64748B), size: 20),
                const SizedBox(width: 8),
                const Text(
                  'Recent Entries',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const Spacer(),
                // Filter
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'All', label: Text('All')),
                    ButtonSegment(value: 'Purchase', label: Text('Stock In')),
                    ButtonSegment(value: 'Sale', label: Text('Stock Out')),
                  ],
                  selected: {_selectedType},
                  onSelectionChanged: (Set<String> newSelection) {
                    setState(() => _selectedType = newSelection.first);
                  },
                  style: ButtonStyle(
                    textStyle:
                        WidgetStateProperty.all(const TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: Colors.grey.shade200),
          Expanded(
            child: Consumer<InventoryProvider>(
              builder: (context, inventoryProvider, _) {
                var filteredTransactions = inventoryProvider.transactions;

                if (_selectedType != 'All') {
                  filteredTransactions = filteredTransactions
                      .where((t) => t.type == _selectedType.toLowerCase())
                      .toList();
                }

                if (filteredTransactions.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.receipt_long_outlined,
                            size: 64, color: Colors.grey.shade300),
                        const SizedBox(height: 16),
                        Text(
                          'No transactions yet',
                          style: TextStyle(
                              fontSize: 16, color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Click on Stock In or Stock Out above to add entries',
                          style: TextStyle(
                              fontSize: 13, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(0),
                  itemCount: filteredTransactions.length,
                  separatorBuilder: (_, __) =>
                      Divider(height: 1, color: Colors.grey.shade100),
                  itemBuilder: (context, index) {
                    final transaction = filteredTransactions[index];
                    final item = inventoryProvider.items.firstWhere(
                      (item) => item.id == transaction.itemId,
                      orElse: () => inventoryProvider.items.first,
                    );

                    final isStockIn = transaction.type == 'purchase';

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      leading: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isStockIn
                              ? const Color(0xFF10B981).withValues(alpha: 0.1)
                              : const Color(0xFF3B82F6).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          isStockIn
                              ? Icons.add_shopping_cart
                              : Icons.shopping_cart_checkout,
                          color: isStockIn
                              ? const Color(0xFF10B981)
                              : const Color(0xFF3B82F6),
                          size: 24,
                        ),
                      ),
                      title: Text(
                        item.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 4),
                          Text(
                            '${isStockIn ? "STOCK IN" : "STOCK OUT"} • ${DateFormat('MMM dd, yyyy HH:mm').format(transaction.transactionDate)}',
                            style: TextStyle(
                              fontSize: 11,
                              color: isStockIn
                                  ? const Color(0xFF10B981)
                                  : const Color(0xFF3B82F6),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (transaction.supplier != null ||
                              transaction.customer != null)
                            Text(
                              '${isStockIn ? "Supplier" : "Customer"}: ${transaction.supplier ?? transaction.customer}',
                              style: TextStyle(
                                  fontSize: 11, color: Colors.grey.shade600),
                            ),
                        ],
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${isStockIn ? "+" : "-"}${transaction.quantity.toStringAsFixed(0)} ${item.unit}',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: isStockIn
                                  ? const Color(0xFF10B981)
                                  : const Color(0xFF3B82F6),
                            ),
                          ),
                          Text(
                            '₹${transaction.totalAmount.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showAdjustmentDialog(BuildContext context) {
    // Navigate to Adjustment screen
    final navigationProvider =
        Provider.of<NavigationProvider>(context, listen: false);
    navigationProvider.goToAdjustments();
  }

  void _showTransactionDialog(BuildContext context, String type) {
    if (_isLoading) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please wait, loading data...')),
      );
      return;
    }

    final inventoryProvider =
        Provider.of<InventoryProvider>(context, listen: false);
    final warehouseProvider =
        Provider.of<WarehouseProvider>(context, listen: false);
    final stockEntryProvider =
        Provider.of<StockEntryProvider>(context, listen: false);

    if (inventoryProvider.items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content:
                Text('Please add inventory items first in Inventory screen')),
      );
      return;
    }

    if (warehouseProvider.warehouses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Please add warehouses first in Warehouses screen')),
      );
      return;
    }

    debugPrint(
        'Opening transaction dialog - Items: ${inventoryProvider.items.length}, Warehouses: ${warehouseProvider.warehouses.length}');

    InventoryItem? selectedItem;
    String? selectedWarehouseId = warehouseProvider.warehouses.first.id;
    String? selectedZoneId;
    String? selectedCellId;
    List<Zone> zones = [];
    List<Cell> cells = [];

    final itemSearchController = TextEditingController();
    final quantityController = TextEditingController();
    final unitPriceController = TextEditingController();
    final referenceController = TextEditingController();
    final partyController = TextEditingController();
    final notesController = TextEditingController();
    DateTime selectedDate = DateTime.now();

    // For item search
    List<InventoryItem> filteredItems = [];
    bool showItemSuggestions = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          // Load zones on first build if empty
          if (zones.isEmpty && selectedWarehouseId != null) {
            stockEntryProvider.loadZones(selectedWarehouseId!).then((z) {
              if (z.isNotEmpty) {
                setState(() => zones = z);
              }
            });
          }

          final quantity = double.tryParse(quantityController.text) ?? 0;
          final unitPrice = double.tryParse(unitPriceController.text) ?? 0;
          final totalAmount = quantity * unitPrice;

          // Filter items based on search
          void filterItems(String query) {
            if (query.isEmpty) {
              setState(() {
                filteredItems = [];
                showItemSuggestions = false;
              });
              return;
            }

            final lowerQuery = query.toLowerCase();
            setState(() {
              filteredItems = inventoryProvider.items
                  .where((item) {
                    return item.name.toLowerCase().startsWith(lowerQuery) ||
                        item.sku.toLowerCase().startsWith(lowerQuery) ||
                        (item.barcode?.toLowerCase().startsWith(lowerQuery) ??
                            false);
                  })
                  .take(10)
                  .toList();
              showItemSuggestions = filteredItems.isNotEmpty;
            });
          }

          // Load zones when warehouse changes
          Future<void> loadZonesForWarehouse(String warehouseId) async {
            final z = await stockEntryProvider.loadZones(warehouseId);
            setState(() {
              zones = z;
              selectedZoneId = null;
              cells = [];
              selectedCellId = null;
            });
          }

          // Load cells when zone changes
          Future<void> loadCellsForZone(String zoneId) async {
            final c = await stockEntryProvider.loadCellsForZone(zoneId);
            setState(() {
              cells = c;
              selectedCellId = null;
            });
          }

          return AlertDialog(
            title: Text(type == 'purchase'
                ? 'Record Purchase (Stock In)'
                : 'Record Sale (Stock Out)'),
            content: SingleChildScrollView(
              child: SizedBox(
                width: 650,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Item Search with Autocomplete
                    const Text(
                      'Item *',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: Colors.grey),
                    ),
                    const SizedBox(height: 8),
                    Column(
                      children: [
                        TextField(
                          controller: itemSearchController,
                          decoration: InputDecoration(
                            hintText:
                                'Start typing item name, SKU, or barcode...',
                            border: const OutlineInputBorder(),
                            prefixIcon: const Icon(Icons.search),
                            suffixIcon: selectedItem != null
                                ? IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () {
                                      setState(() {
                                        selectedItem = null;
                                        itemSearchController.clear();
                                        unitPriceController.clear();
                                        filteredItems = [];
                                        showItemSuggestions = false;
                                      });
                                    },
                                  )
                                : null,
                          ),
                          onChanged: filterItems,
                        ),
                        if (showItemSuggestions)
                          Container(
                            constraints: const BoxConstraints(maxHeight: 200),
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey.shade300),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.1),
                                  blurRadius: 8,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: filteredItems.length,
                              itemBuilder: (context, index) {
                                final item = filteredItems[index];
                                final totalStock =
                                    inventoryProvider.getTotalStock(item.id);
                                return ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: Colors.blue.shade50,
                                    child: Icon(Icons.inventory_2,
                                        color: Colors.blue.shade700, size: 20),
                                  ),
                                  title: Text(
                                    item.name,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                  subtitle: Text(
                                    'SKU: ${item.sku} | Stock: $totalStock ${item.unit}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade600),
                                  ),
                                  trailing: Text(
                                    '₹${(type == 'sale' ? item.sellingPrice : item.costPrice).toStringAsFixed(2)}',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green.shade700,
                                    ),
                                  ),
                                  onTap: () {
                                    setState(() {
                                      selectedItem = item;
                                      itemSearchController.text = item.name;
                                      unitPriceController.text = (type == 'sale'
                                              ? item.sellingPrice
                                              : item.costPrice)
                                          .toString();
                                      filteredItems = [];
                                      showItemSuggestions = false;
                                    });
                                  },
                                );
                              },
                            ),
                          ),
                      ],
                    ),

                    // Show selected item info
                    if (selectedItem != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.green.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.green.shade200),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle,
                                color: Colors.green.shade700),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    selectedItem!.name,
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green.shade800,
                                    ),
                                  ),
                                  Text(
                                    'SKU: ${selectedItem!.sku} | Category: ${selectedItem!.category} | Unit: ${selectedItem!.unit}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.green.shade700),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),

                    // Warehouse, Zone, Cell Selection
                    const Text(
                      'Location',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: Colors.grey),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        // Warehouse
                        Expanded(
                          flex: 2,
                          child: DropdownButtonFormField<String>(
                            initialValue: selectedWarehouseId,
                            decoration: const InputDecoration(
                              labelText: 'Warehouse *',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 14),
                            ),
                            items:
                                warehouseProvider.warehouses.map((warehouse) {
                              return DropdownMenuItem(
                                value: warehouse.id,
                                child: Text(warehouse.name,
                                    overflow: TextOverflow.ellipsis),
                              );
                            }).toList(),
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => selectedWarehouseId = value);
                                loadZonesForWarehouse(value);
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Zone
                        Expanded(
                          child: DropdownButtonFormField<String?>(
                            initialValue: selectedZoneId,
                            decoration: const InputDecoration(
                              labelText: 'Zone',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 14),
                            ),
                            items: [
                              const DropdownMenuItem(
                                  value: null, child: Text('None')),
                              ...zones.map((zone) {
                                return DropdownMenuItem(
                                  value: zone.id,
                                  child: Text(zone.name,
                                      overflow: TextOverflow.ellipsis),
                                );
                              }),
                            ],
                            onChanged: (value) {
                              setState(() => selectedZoneId = value);
                              if (value != null) {
                                loadCellsForZone(value);
                              } else {
                                setState(() {
                                  cells = [];
                                  selectedCellId = null;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Cell
                        Expanded(
                          child: DropdownButtonFormField<String?>(
                            initialValue: selectedCellId,
                            decoration: const InputDecoration(
                              labelText: 'Cell',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 14),
                            ),
                            items: [
                              const DropdownMenuItem(
                                  value: null, child: Text('None')),
                              ...cells.map((cell) {
                                return DropdownMenuItem(
                                  value: cell.id,
                                  child: Text('${cell.name} (${cell.code})',
                                      overflow: TextOverflow.ellipsis),
                                );
                              }),
                            ],
                            onChanged: (value) =>
                                setState(() => selectedCellId = value),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Quantity and Price
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Quantity *',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.grey),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF3F4F6),
                                  borderRadius: BorderRadius.circular(8),
                                  border:
                                      Border.all(color: Colors.grey.shade300),
                                ),
                                child: Row(
                                  children: [
                                    // Minus Button
                                    Material(
                                      color: Colors.transparent,
                                      child: InkWell(
                                        onTap: () {
                                          final current = double.tryParse(
                                                  quantityController.text) ??
                                              0;
                                          if (current > 1) {
                                            quantityController.text =
                                                (current - 1)
                                                    .toStringAsFixed(0);
                                            setState(() {});
                                          }
                                        },
                                        borderRadius: const BorderRadius.only(
                                          topLeft: Radius.circular(8),
                                          bottomLeft: Radius.circular(8),
                                        ),
                                        child: Container(
                                          width: 48,
                                          height: 56,
                                          decoration: BoxDecoration(
                                            border: Border(
                                              right: BorderSide(
                                                  color: Colors.grey.shade300),
                                            ),
                                          ),
                                          child: const Icon(Icons.remove,
                                              size: 20),
                                        ),
                                      ),
                                    ),
                                    // Input Field
                                    Expanded(
                                      child: TextField(
                                        controller: quantityController,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w500,
                                        ),
                                        decoration: InputDecoration(
                                          border: InputBorder.none,
                                          hintText: '0',
                                          suffixText: selectedItem?.unit ?? '',
                                          suffixStyle: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 14,
                                          ),
                                          contentPadding:
                                              const EdgeInsets.symmetric(
                                                  horizontal: 8),
                                        ),
                                        keyboardType: TextInputType.number,
                                        onChanged: (_) => setState(() {}),
                                      ),
                                    ),
                                    // Plus Button
                                    Material(
                                      color: Colors.transparent,
                                      child: InkWell(
                                        onTap: () {
                                          final current = double.tryParse(
                                                  quantityController.text) ??
                                              0;
                                          quantityController.text =
                                              (current + 1).toStringAsFixed(0);
                                          setState(() {});
                                        },
                                        borderRadius: const BorderRadius.only(
                                          topRight: Radius.circular(8),
                                          bottomRight: Radius.circular(8),
                                        ),
                                        child: Container(
                                          width: 48,
                                          height: 56,
                                          decoration: BoxDecoration(
                                            border: Border(
                                              left: BorderSide(
                                                  color: Colors.grey.shade300),
                                            ),
                                          ),
                                          child:
                                              const Icon(Icons.add, size: 20),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Unit Price *',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.grey),
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                controller: unitPriceController,
                                decoration: const InputDecoration(
                                  prefixText: '₹ ',
                                  border: OutlineInputBorder(),
                                  contentPadding: EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 16),
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (_) => setState(() {}),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Total Amount Display
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: type == 'purchase'
                            ? const Color(0xFF10B981).withValues(alpha: 0.1)
                            : const Color(0xFF3B82F6).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: type == 'purchase'
                              ? const Color(0xFF10B981).withValues(alpha: 0.3)
                              : const Color(0xFF3B82F6).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Total Amount:',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            '₹${totalAmount.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: type == 'purchase'
                                  ? const Color(0xFF10B981)
                                  : const Color(0xFF3B82F6),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Reference Number and Party
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: referenceController,
                            decoration: const InputDecoration(
                              labelText: 'Reference Number',
                              hintText: 'Invoice/PO Number',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextField(
                            controller: partyController,
                            decoration: InputDecoration(
                              labelText:
                                  type == 'purchase' ? 'Supplier' : 'Customer',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Date
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.calendar_today),
                      title:
                          Text(DateFormat('MMM dd, yyyy').format(selectedDate)),
                      trailing: TextButton(
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: selectedDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setState(() => selectedDate = date);
                          }
                        },
                        child: const Text('Change'),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Notes
                    TextField(
                      controller: notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        border: OutlineInputBorder(),
                      ),
                      maxLines: 2,
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: type == 'purchase'
                      ? const Color(0xFF10B981)
                      : const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  if (selectedItem == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please select an item')),
                    );
                    return;
                  }
                  if (quantityController.text.isEmpty ||
                      unitPriceController.text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('Please fill quantity and price')),
                    );
                    return;
                  }

                  final transaction = Transaction(
                    id: const Uuid().v4(),
                    type: type,
                    itemId: selectedItem!.id,
                    warehouseId: selectedWarehouseId!,
                    locationId: selectedCellId,
                    quantity: double.parse(quantityController.text),
                    unitPrice: double.parse(unitPriceController.text),
                    totalAmount: totalAmount,
                    referenceNumber: referenceController.text.isEmpty
                        ? null
                        : referenceController.text,
                    supplier:
                        type == 'purchase' && partyController.text.isNotEmpty
                            ? partyController.text
                            : null,
                    customer: type == 'sale' && partyController.text.isNotEmpty
                        ? partyController.text
                        : null,
                    notes: notesController.text.isEmpty
                        ? null
                        : notesController.text,
                    transactionDate: selectedDate,
                    createdAt: DateTime.now(),
                  );

                  await inventoryProvider.addTransaction(
                      transaction, type == 'purchase');

                  if (context.mounted) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                            '${type == 'purchase' ? 'Purchase' : 'Sale'} recorded successfully'),
                        backgroundColor: type == 'purchase'
                            ? const Color(0xFF10B981)
                            : const Color(0xFF3B82F6),
                      ),
                    );
                  }
                },
                child:
                    Text('Record ${type == 'purchase' ? 'Purchase' : 'Sale'}'),
              ),
            ],
          );
        },
      ),
    );
  }
}
