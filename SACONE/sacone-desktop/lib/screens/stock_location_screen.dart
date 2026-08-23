import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/warehouse_provider.dart';
import '../models/location.dart';
import '../services/unified_database_manager.dart';

/// Screen showing where all stocks are located from Warehouse to Cell level
/// Displays a hierarchical view: Warehouse → Cells → Products with quantities
class StockLocationScreen extends StatefulWidget {
  const StockLocationScreen({super.key});

  @override
  State<StockLocationScreen> createState() => _StockLocationScreenState();
}

class _StockLocationScreenState extends State<StockLocationScreen> {
  String? _selectedWarehouseId;
  String? _selectedCellId;
  List<Map<String, dynamic>> _cellStocks = [];
  List<Cell> _cells = [];
  bool _isLoading = false;
  String _searchQuery = '';
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final warehouseProvider =
          Provider.of<WarehouseProvider>(context, listen: false);
      await warehouseProvider.loadWarehouses();

      if (warehouseProvider.warehouses.isNotEmpty &&
          _selectedWarehouseId == null) {
        _selectedWarehouseId = warehouseProvider.warehouses.first.id;
        await _loadCells();
      }
    } catch (e) {
      print('Error loading data in StockLocationScreen: $e');
      setState(() {
        _errorMessage = 'Failed to load data: ${e.toString()}';
      });
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadCells() async {
    if (_selectedWarehouseId == null) return;

    try {
      final db = await DatabaseManager.instance.database;
      final cellMaps = await db.query(
        'cells',
        where: 'warehouseId = ?',
        whereArgs: [_selectedWarehouseId],
        orderBy: 'code',
      );

      setState(() {
        _cells = cellMaps.map((m) => Cell.fromMap(m)).toList();
        _selectedCellId = null;
      });

      await _loadCellStocks();
    } catch (e) {
      print('Error loading cells: $e');
      setState(() {
        _cells = [];
      });
    }
  }

  Future<void> _loadCellStocks() async {
    if (_selectedWarehouseId == null) return;

    try {
      final db = await DatabaseManager.instance.database;

      String query = '''
        SELECT 
          s.id as stockId,
          s.itemId,
          s.warehouseId,
          s.cellId,
          s.quantity,
          s.batchNumber,
          s.expiryDate,
          s.lastUpdated,
          i.name as itemName,
          i.sku,
          i.unit,
          i.category,
          i.costPrice,
          i.sellingPrice,
          c.name as cellName,
          c.code as cellCode,
          w.name as warehouseName
        FROM stocks s
        JOIN inventory_items i ON s.itemId = i.id
        LEFT JOIN cells c ON s.cellId = c.id
        JOIN warehouses w ON s.warehouseId = w.id
        WHERE s.warehouseId = ?
        AND s.quantity > 0
      ''';

      List<dynamic> args = [_selectedWarehouseId];

      if (_selectedCellId != null && _selectedCellId != 'unassigned') {
        query += ' AND s.cellId = ?';
        args.add(_selectedCellId);
      } else if (_selectedCellId == 'unassigned') {
        query += ' AND s.cellId IS NULL';
      }

      query += ' ORDER BY c.code, i.name';

      final results = await db.rawQuery(query, args);

      setState(() {
        _cellStocks = results.cast<Map<String, dynamic>>();
        _errorMessage = null;
      });
    } catch (e) {
      print('Error loading cell stocks: $e');
      setState(() {
        _cellStocks = [];
        _errorMessage = 'Failed to load stocks: ${e.toString()}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _buildTopBar(context),
          if (_errorMessage != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: Colors.red.shade50,
              child: Row(
                children: [
                  Icon(Icons.error_outline,
                      color: Colors.red.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                  ),
                  TextButton(
                    onPressed: _loadData,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Left Panel - Warehouse & Cell Tree
                      Container(
                        width: 300,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border(
                            right: BorderSide(color: Colors.grey.shade200),
                          ),
                        ),
                        child: _buildLocationTree(),
                      ),
                      // Main Content - Stock Details
                      Expanded(
                        child: _buildStockDetails(),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
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
                'Stock Locations',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF0F172A),
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'View where stocks are located from Warehouse to Cell',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const Spacer(),
          // Search
          SizedBox(
            width: 300,
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search product or SKU...',
                prefixIcon: const Icon(Icons.search, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              onChanged: (value) {
                setState(() => _searchQuery = value.toLowerCase());
              },
            ),
          ),
          const SizedBox(width: 16),
          OutlinedButton.icon(
            onPressed: () {
              _loadCells();
            },
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Refresh'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF475569),
              side: BorderSide(color: Colors.grey.shade300),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocationTree() {
    return Consumer<WarehouseProvider>(
      builder: (context, warehouseProvider, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.account_tree,
                        color: Color(0xFF3B82F6), size: 20),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'Location Hierarchy',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: Colors.grey.shade200),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  // Warehouse Selector
                  DropdownButtonFormField<String>(
                    initialValue: _selectedWarehouseId,
                    decoration: InputDecoration(
                      labelText: 'Warehouse',
                      prefixIcon: const Icon(Icons.warehouse, size: 20),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                    ),
                    items: warehouseProvider.warehouses.map((w) {
                      return DropdownMenuItem(
                        value: w.id,
                        child: Text(w.name),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedWarehouseId = value;
                        _selectedCellId = null;
                      });
                      _loadCells();
                    },
                  ),
                  const SizedBox(height: 16),

                  // All Cells Option
                  _buildTreeItem(
                    icon: Icons.grid_view,
                    title: 'All Cells',
                    subtitle: '${_cells.length} cells',
                    isSelected: _selectedCellId == null,
                    onTap: () {
                      setState(() => _selectedCellId = null);
                      _loadCellStocks();
                    },
                    level: 0,
                  ),

                  // Individual Cells
                  ..._cells.map((cell) {
                    final stockCount =
                        _cellStocks.where((s) => s['cellId'] == cell.id).length;
                    return _buildTreeItem(
                      icon: Icons.inventory_2,
                      title: cell.name,
                      subtitle: 'Code: ${cell.code} • $stockCount products',
                      isSelected: _selectedCellId == cell.id,
                      onTap: () {
                        setState(() => _selectedCellId = cell.id);
                        _loadCellStocks();
                      },
                      level: 1,
                    );
                  }),

                  // Unassigned Stock
                  _buildTreeItem(
                    icon: Icons.help_outline,
                    title: 'Unassigned',
                    subtitle: 'No cell assigned',
                    isSelected: _selectedCellId == 'unassigned',
                    onTap: () {
                      setState(() => _selectedCellId = 'unassigned');
                      _loadCellStocks();
                    },
                    level: 0,
                    color: Colors.orange,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTreeItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool isSelected,
    required VoidCallback onTap,
    required int level,
    Color? color,
  }) {
    final primaryColor = color ?? const Color(0xFF3B82F6);

    return Padding(
      padding: EdgeInsets.only(left: level * 16.0, bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isSelected
                  ? primaryColor.withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected
                    ? primaryColor.withValues(alpha: 0.3)
                    : Colors.grey.shade200,
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? primaryColor.withValues(alpha: 0.2)
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Icon(
                    icon,
                    size: 18,
                    color: isSelected ? primaryColor : Colors.grey.shade600,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              isSelected ? FontWeight.w600 : FontWeight.w500,
                          color: isSelected
                              ? primaryColor
                              : const Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  Icon(Icons.check_circle, size: 18, color: primaryColor),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStockDetails() {
    final filteredStocks = _cellStocks.where((stock) {
      if (_searchQuery.isEmpty) return true;
      final name = (stock['itemName'] as String?)?.toLowerCase() ?? '';
      final sku = (stock['sku'] as String?)?.toLowerCase() ?? '';
      return name.contains(_searchQuery) || sku.contains(_searchQuery);
    }).toList();

    // Group by cell
    final Map<String?, List<Map<String, dynamic>>> groupedStocks = {};
    for (var stock in filteredStocks) {
      final cellId = stock['cellId'] as String?;
      if (!groupedStocks.containsKey(cellId)) {
        groupedStocks[cellId] = [];
      }
      groupedStocks[cellId]!.add(stock);
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Summary Cards
          _buildSummaryCards(filteredStocks),
          const SizedBox(height: 24),

          // Stock List by Cell
          if (filteredStocks.isEmpty)
            _buildEmptyState()
          else
            ...groupedStocks.entries.map((entry) {
              final cellId = entry.key;
              final stocks = entry.value;
              final cell = _cells.firstWhere(
                (c) => c.id == cellId,
                orElse: () => Cell(
                  id: 'unassigned',
                  zoneId: '',
                  warehouseId: '',
                  name: 'Unassigned',
                  code: 'N/A',
                  createdAt: DateTime.now(),
                  updatedAt: DateTime.now(),
                ),
              );

              return _buildCellStockCard(cell, stocks);
            }),
        ],
      ),
    );
  }

  Widget _buildSummaryCards(List<Map<String, dynamic>> stocks) {
    final totalQuantity = stocks.fold<double>(
        0, (sum, s) => sum + (s['quantity'] as num? ?? 0).toDouble());
    final totalValue = stocks.fold<double>(0, (sum, s) {
      final qty = (s['quantity'] as num? ?? 0).toDouble();
      final cost = (s['costPrice'] as num? ?? 0).toDouble();
      return sum + (qty * cost);
    });
    final uniqueProducts = stocks.map((s) => s['itemId']).toSet().length;
    final cellsInUse =
        stocks.map((s) => s['cellId']).where((c) => c != null).toSet().length;

    return Row(
      children: [
        _buildSummaryCard(
          'Total Products',
          uniqueProducts.toString(),
          Icons.inventory_2_outlined,
          const Color(0xFF3B82F6),
        ),
        const SizedBox(width: 16),
        _buildSummaryCard(
          'Total Quantity',
          NumberFormat.compact().format(totalQuantity),
          Icons.numbers,
          const Color(0xFF10B981),
        ),
        const SizedBox(width: 16),
        _buildSummaryCard(
          'Total Value',
          NumberFormat.compactCurrency(symbol: '₹', locale: 'en_IN')
              .format(totalValue),
          Icons.currency_rupee,
          const Color(0xFF8B5CF6),
        ),
        const SizedBox(width: 16),
        _buildSummaryCard(
          'Cells In Use',
          cellsInUse.toString(),
          Icons.grid_view,
          const Color(0xFFF59E0B),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(
      String title, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCellStockCard(Cell cell, List<Map<String, dynamic>> stocks) {
    final totalQty = stocks.fold<double>(
        0, (sum, s) => sum + (s['quantity'] as num? ?? 0).toDouble());

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cell Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
              border: Border(
                bottom: BorderSide(color: Colors.grey.shade200),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.inventory_2,
                    color: Color(0xFF3B82F6),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cell.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        'Code: ${cell.code}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${stocks.length} products • ${totalQty.toInt()} units',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF10B981),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Stock List
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: stocks.length,
            separatorBuilder: (_, __) =>
                Divider(height: 1, color: Colors.grey.shade100),
            itemBuilder: (context, index) {
              final stock = stocks[index];
              return _buildStockRow(stock);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildStockRow(Map<String, dynamic> stock) {
    final quantity = (stock['quantity'] as num? ?? 0).toDouble();
    final costPrice = (stock['costPrice'] as num? ?? 0).toDouble();
    final value = quantity * costPrice;
    final expiryDate = stock['expiryDate'] != null
        ? DateTime.parse(stock['expiryDate'] as String)
        : null;
    final lastUpdated = DateTime.parse(stock['lastUpdated'] as String);

    bool isExpiringSoon = false;
    bool isExpired = false;
    if (expiryDate != null) {
      final daysUntilExpiry = expiryDate.difference(DateTime.now()).inDays;
      isExpired = daysUntilExpiry < 0;
      isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Product Info
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stock['itemName'] as String? ?? 'Unknown',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'SKU: ${stock['sku'] ?? 'N/A'}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      stock['category'] as String? ?? '',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Batch & Expiry
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (stock['batchNumber'] != null)
                  Text(
                    'Batch: ${stock['batchNumber']}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                    ),
                  ),
                if (expiryDate != null)
                  Row(
                    children: [
                      Icon(
                        isExpired
                            ? Icons.error
                            : (isExpiringSoon
                                ? Icons.warning
                                : Icons.check_circle),
                        size: 14,
                        color: isExpired
                            ? Colors.red
                            : (isExpiringSoon ? Colors.orange : Colors.green),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Exp: ${DateFormat('MMM dd, yy').format(expiryDate)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: isExpired
                              ? Colors.red
                              : (isExpiringSoon
                                  ? Colors.orange
                                  : Colors.grey.shade700),
                          fontWeight: isExpired || isExpiringSoon
                              ? FontWeight.w600
                              : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          // Quantity
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${quantity.toInt()}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                Text(
                  stock['unit'] as String? ?? 'units',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          // Value
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  NumberFormat.compactCurrency(symbol: '₹', locale: 'en_IN')
                      .format(value),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF10B981),
                  ),
                ),
                Text(
                  'Last: ${DateFormat('MMM dd').format(lastUpdated)}',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(60),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inventory_2_outlined,
                size: 80, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              'No stocks found',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Select a different warehouse or cell, or add some stock',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
