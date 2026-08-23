import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/warehouse_provider.dart';
import '../providers/stock_entry_provider.dart';
import '../services/unified_database_manager.dart';
import '../models/location.dart';

/// Screen showing detailed view of products in each cell
/// Including movement history for each cell
class CellStockViewScreen extends StatefulWidget {
  const CellStockViewScreen({super.key});

  @override
  State<CellStockViewScreen> createState() => _CellStockViewScreenState();
}

class _CellStockViewScreenState extends State<CellStockViewScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _selectedWarehouseId;
  String? _selectedZoneId;
  Cell? _selectedCell;
  List<Cell> _cells = [];
  List<Zone> _zones = [];
  List<Map<String, dynamic>> _cellProducts = [];
  List<Map<String, dynamic>> _cellMovements = [];
  bool _isLoading = false;
  
  // For cell creation
  final _cellNameController = TextEditingController();
  final _cellCodeController = TextEditingController();
  final _cellCapacityController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _cellNameController.dispose();
    _cellCodeController.dispose();
    _cellCapacityController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final warehouseProvider = Provider.of<WarehouseProvider>(context, listen: false);
    await warehouseProvider.loadWarehouses();
    
    if (warehouseProvider.warehouses.isNotEmpty && _selectedWarehouseId == null) {
      _selectedWarehouseId = warehouseProvider.warehouses.first.id;
      await _loadZones();
      await _loadCells();
    }
    setState(() => _isLoading = false);
  }

  Future<void> _loadZones() async {
    if (_selectedWarehouseId == null) return;
    
    final db = await DatabaseManager.instance.database;
    final zoneMaps = await db.query(
      'zones',
      where: 'warehouseId = ?',
      whereArgs: [_selectedWarehouseId],
      orderBy: 'name',
    );
    
    setState(() {
      _zones = zoneMaps.map((m) => Zone.fromMap(m)).toList();
      _selectedZoneId = null;
    });
  }

  Future<void> _loadCells() async {
    if (_selectedWarehouseId == null) return;
    
    final db = await DatabaseManager.instance.database;
    List<Map<String, dynamic>> cellMaps;
    
    if (_selectedZoneId != null) {
      cellMaps = await db.query(
        'cells',
        where: 'warehouseId = ? AND zoneId = ?',
        whereArgs: [_selectedWarehouseId, _selectedZoneId],
        orderBy: 'code',
      );
    } else {
      cellMaps = await db.query(
        'cells',
        where: 'warehouseId = ?',
        whereArgs: [_selectedWarehouseId],
        orderBy: 'code',
      );
    }
    
    setState(() {
      _cells = cellMaps.map((m) => Cell.fromMap(m)).toList();
      _selectedCell = null;
      _cellProducts = [];
      _cellMovements = [];
      if (_cells.isNotEmpty) {
        _selectedCell = _cells.first;
        _loadCellDetails();
      }
    });
  }

  Future<void> _loadCellDetails() async {
    if (_selectedCell == null) return;
    
    final db = await DatabaseManager.instance.database;
    
    // Load products in this cell
    final products = await db.rawQuery('''
      SELECT 
        s.id as stockId,
        s.itemId,
        s.quantity,
        s.batchNumber,
        s.expiryDate,
        s.lastUpdated,
        i.name as itemName,
        i.sku,
        i.unit,
        i.category,
        i.costPrice,
        i.sellingPrice
      FROM stocks s
      JOIN inventory_items i ON s.itemId = i.id
      WHERE s.cellId = ? AND s.quantity > 0
      ORDER BY i.name
    ''', [_selectedCell!.id]);
    
    // Load recent movements for this cell
    final movements = await db.rawQuery('''
      SELECT 
        t.id,
        t.type,
        t.itemId,
        t.quantity,
        t.unitPrice,
        t.totalAmount,
        t.referenceNumber,
        t.supplier,
        t.customer,
        t.transactionDate,
        i.name as itemName,
        i.sku,
        i.unit
      FROM transactions t
      JOIN inventory_items i ON t.itemId = i.id
      WHERE t.locationId = ?
      ORDER BY t.transactionDate DESC
      LIMIT 50
    ''', [_selectedCell!.id]);
    
    setState(() {
      _cellProducts = products.cast<Map<String, dynamic>>();
      _cellMovements = movements.cast<Map<String, dynamic>>();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _buildTopBar(context),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Left Panel - Cell List
                      Container(
                        width: 280,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border(
                            right: BorderSide(color: Colors.grey.shade200),
                          ),
                        ),
                        child: _buildCellList(),
                      ),
                      // Main Content - Cell Details
                      Expanded(
                        child: _buildCellDetails(),
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
                'Cell Stock View',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF0F172A),
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'View products in each cell and track movements',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Refresh'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF475569),
              side: BorderSide(color: Colors.grey.shade300),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          const SizedBox(width: 12),
          FilledButton.icon(
            onPressed: _showAddCellDialog,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add Cell'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCellList() {
    return Consumer<WarehouseProvider>(
      builder: (context, warehouseProvider, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: DropdownButtonFormField<String>(
                initialValue: _selectedWarehouseId,
                decoration: InputDecoration(
                  labelText: 'Warehouse',
                  prefixIcon: const Icon(Icons.warehouse, size: 20),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
                    _selectedZoneId = null;
                    _selectedCell = null;
                    _cellProducts = [];
                    _cellMovements = [];
                  });
                  _loadZones();
                  _loadCells();
                },
              ),
            ),
            // Zone dropdown
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: DropdownButtonFormField<String?>(
                initialValue: _selectedZoneId,
                decoration: InputDecoration(
                  labelText: 'Zone (Optional)',
                  prefixIcon: const Icon(Icons.dashboard_outlined, size: 20),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All Zones'),
                  ),
                  ..._zones.map((z) {
                    return DropdownMenuItem<String?>(
                      value: z.id,
                      child: Text(z.name),
                    );
                  }),
                ],
                onChanged: (value) {
                  setState(() {
                    _selectedZoneId = value;
                    _selectedCell = null;
                    _cellProducts = [];
                    _cellMovements = [];
                  });
                  _loadCells();
                },
              ),
            ),
            Divider(height: 1, color: Colors.grey.shade200),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(Icons.grid_view, size: 18, color: Color(0xFF64748B)),
                  const SizedBox(width: 8),
                  Text(
                    'Storage Cells',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade700,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${_cells.length}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF3B82F6),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _cells.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.grid_off, size: 48, color: Colors.grey.shade300),
                            const SizedBox(height: 12),
                            Text(
                              'No cells defined',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: _showAddCellDialog,
                              icon: const Icon(Icons.add, size: 16),
                              label: const Text('Add Cell'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      itemCount: _cells.length,
                      itemBuilder: (context, index) {
                        final cell = _cells[index];
                        final isSelected = _selectedCell?.id == cell.id;
                        
                        return _buildCellTile(cell, isSelected);
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildCellTile(Cell cell, bool isSelected) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() => _selectedCell = cell);
            _loadCellDetails();
          },
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF2563EB).withValues(alpha: 0.1) : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected ? const Color(0xFF2563EB).withValues(alpha: 0.3) : Colors.grey.shade200,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF2563EB).withValues(alpha: 0.2)
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      cell.code,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: isSelected ? const Color(0xFF2563EB) : Colors.grey.shade700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cell.name,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                          color: isSelected ? const Color(0xFF2563EB) : const Color(0xFF0F172A),
                        ),
                      ),
                      if (cell.description != null)
                        Text(
                          cell.description!,
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                // Edit and Delete buttons
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: Icon(Icons.edit, size: 16, color: Colors.blue.shade600),
                      tooltip: 'Edit Cell',
                      onPressed: () => _showEditCellDialog(cell),
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      padding: EdgeInsets.zero,
                    ),
                    IconButton(
                      icon: Icon(Icons.delete, size: 16, color: Colors.red.shade600),
                      tooltip: 'Delete Cell',
                      onPressed: () => _showDeleteCellDialog(cell),
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      padding: EdgeInsets.zero,
                    ),
                  ],
                ),
                if (isSelected)
                  const Icon(Icons.check_circle, size: 18, color: Color(0xFF2563EB)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showEditCellDialog(Cell cell) {
    final nameController = TextEditingController(text: cell.name);
    final codeController = TextEditingController(text: cell.code);
    final capacityController = TextEditingController(text: cell.capacity?.toString() ?? '');
    final descriptionController = TextEditingController(text: cell.description ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.edit, color: Colors.blue),
            SizedBox(width: 8),
            Text('Edit Cell'),
          ],
        ),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Cell Name *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.inventory_2),
                ),
                textCapitalization: TextCapitalization.words,
                autofocus: true,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: codeController,
                decoration: const InputDecoration(
                  labelText: 'Cell Code *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.qr_code),
                  hintText: 'e.g., A1, B2, C3',
                ),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: capacityController,
                decoration: const InputDecoration(
                  labelText: 'Capacity (Optional)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.format_list_numbered),
                  hintText: 'Maximum units',
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description (Optional)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.description),
                ),
                maxLines: 2,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              if (nameController.text.trim().isEmpty || codeController.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill in name and code')),
                );
                return;
              }

              try {
                final provider = Provider.of<StockEntryProvider>(context, listen: false);
                await provider.updateCell(
                  cellId: cell.id,
                  name: nameController.text.trim(),
                  code: codeController.text.trim().toUpperCase(),
                  capacity: capacityController.text.isNotEmpty 
                      ? int.tryParse(capacityController.text) 
                      : null,
                  description: descriptionController.text.trim().isEmpty 
                      ? null 
                      : descriptionController.text.trim(),
                );

                if (context.mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Cell "${nameController.text.trim()}" updated'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  _loadCells();
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(e.toString().replaceAll('Exception: ', '')),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            icon: const Icon(Icons.save),
            label: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showDeleteCellDialog(Cell cell) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning, color: Colors.red),
            SizedBox(width: 8),
            Text('Delete Cell'),
          ],
        ),
        content: Text(
          'Are you sure you want to delete cell "${cell.name}" (${cell.code})?\n\nThis action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              try {
                final provider = Provider.of<StockEntryProvider>(context, listen: false);
                await provider.deleteCell(cell.id);

                if (context.mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Cell deleted'),
                      backgroundColor: Colors.orange,
                    ),
                  );
                  setState(() {
                    if (_selectedCell?.id == cell.id) {
                      _selectedCell = null;
                      _cellProducts = [];
                      _cellMovements = [];
                    }
                  });
                  _loadCells();
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(e.toString().replaceAll('Exception: ', '')),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  Widget _buildCellDetails() {
    if (_selectedCell == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.touch_app, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              'Select a cell to view details',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      );
    }

    final totalQty = _cellProducts.fold<double>(
      0,
      (sum, p) => sum + (p['quantity'] as num? ?? 0).toDouble(),
    );
    final totalValue = _cellProducts.fold<double>(
      0,
      (sum, p) {
        final qty = (p['quantity'] as num? ?? 0).toDouble();
        final cost = (p['costPrice'] as num? ?? 0).toDouble();
        return sum + (qty * cost);
      },
    );

    return Column(
      children: [
        // Cell Header
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
              bottom: BorderSide(color: Colors.grey.shade200),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    _selectedCell!.code,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _selectedCell!.name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    if (_selectedCell!.description != null)
                      Text(
                        _selectedCell!.description!,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade600,
                        ),
                      ),
                  ],
                ),
              ),
              // Stats
              _buildStatBadge('Products', '${_cellProducts.length}', const Color(0xFF3B82F6)),
              const SizedBox(width: 12),
              _buildStatBadge('Quantity', '${totalQty.toInt()}', const Color(0xFF10B981)),
              const SizedBox(width: 12),
              _buildStatBadge(
                'Value',
                NumberFormat.compactCurrency(symbol: '₹', locale: 'en_IN').format(totalValue),
                const Color(0xFF8B5CF6),
              ),
            ],
          ),
        ),
        
        // Tabs
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabController,
            labelColor: const Color(0xFF2563EB),
            unselectedLabelColor: Colors.grey.shade600,
            indicatorColor: const Color(0xFF2563EB),
            tabs: const [
              Tab(text: 'Products in Cell', icon: Icon(Icons.inventory_2, size: 18)),
              Tab(text: 'Movement History', icon: Icon(Icons.history, size: 18)),
            ],
          ),
        ),
        
        // Tab Content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildProductsTab(),
              _buildMovementsTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatBadge(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductsTab() {
    if (_cellProducts.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              'No products in this cell',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Add stock to this cell to see products here',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _cellProducts.length,
      itemBuilder: (context, index) {
        final product = _cellProducts[index];
        return _buildProductCard(product);
      },
    );
  }

  Widget _buildProductCard(Map<String, dynamic> product) {
    final quantity = (product['quantity'] as num? ?? 0).toDouble();
    final costPrice = (product['costPrice'] as num? ?? 0).toDouble();
    final sellingPrice = (product['sellingPrice'] as num? ?? 0).toDouble();
    final value = quantity * costPrice;
    final expiryDate = product['expiryDate'] != null
        ? DateTime.parse(product['expiryDate'] as String)
        : null;
    // lastUpdated can be used for sorting/filtering if needed
    // final lastUpdated = DateTime.parse(product['lastUpdated'] as String);

    bool isExpired = false;
    bool isExpiringSoon = false;
    if (expiryDate != null) {
      final daysUntilExpiry = expiryDate.difference(DateTime.now()).inDays;
      isExpired = daysUntilExpiry < 0;
      isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          // Product Icon
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.inventory_2,
              color: Color(0xFF3B82F6),
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          
          // Product Info
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product['itemName'] as String? ?? 'Unknown',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'SKU: ${product['sku'] ?? 'N/A'}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      product['category'] as String? ?? '',
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
                if (product['batchNumber'] != null)
                  Text(
                    'Batch: ${product['batchNumber']}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                    ),
                  ),
                if (expiryDate != null)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isExpired
                          ? Colors.red.withValues(alpha: 0.1)
                          : (isExpiringSoon ? Colors.orange.withValues(alpha: 0.1) : Colors.green.withValues(alpha: 0.1)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          isExpired ? Icons.error : (isExpiringSoon ? Icons.warning : Icons.check_circle),
                          size: 14,
                          color: isExpired ? Colors.red : (isExpiringSoon ? Colors.orange : Colors.green),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Exp: ${DateFormat('MMM dd, yy').format(expiryDate)}',
                          style: TextStyle(
                            fontSize: 11,
                            color: isExpired ? Colors.red : (isExpiringSoon ? Colors.orange : Colors.green),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
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
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                Text(
                  product['unit'] as String? ?? 'units',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          
          // Value & Prices
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(value),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF10B981),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Cost: ₹${costPrice.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey.shade500,
                  ),
                ),
                Text(
                  'Sell: ₹${sellingPrice.toStringAsFixed(2)}',
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

  Widget _buildMovementsTab() {
    if (_cellMovements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              'No movement history',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Transactions involving this cell will appear here',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      );
    }

    // Group by date
    final Map<String, List<Map<String, dynamic>>> groupedByDate = {};
    for (var movement in _cellMovements) {
      final date = DateTime.parse(movement['transactionDate'] as String);
      final dateKey = DateFormat('yyyy-MM-dd').format(date);
      if (!groupedByDate.containsKey(dateKey)) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey]!.add(movement);
    }

    final sortedDates = groupedByDate.keys.toList()..sort((a, b) => b.compareTo(a));

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sortedDates.length,
      itemBuilder: (context, index) {
        final dateKey = sortedDates[index];
        final movements = groupedByDate[dateKey]!;
        final date = DateTime.parse(dateKey);
        
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Date Header
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      DateFormat('EEEE, MMMM d, yyyy').format(date),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${movements.length} transactions',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            
            // Movements
            ...movements.map((m) => _buildMovementCard(m)),
            
            const SizedBox(height: 16),
          ],
        );
      },
    );
  }

  Widget _buildMovementCard(Map<String, dynamic> movement) {
    final type = movement['type'] as String? ?? 'other';
    final quantity = (movement['quantity'] as num? ?? 0).toDouble();
    final totalAmount = (movement['totalAmount'] as num? ?? 0).toDouble();
    final transactionDate = DateTime.parse(movement['transactionDate'] as String);

    IconData icon;
    Color color;
    String typeLabel;

    switch (type) {
      case 'purchase':
        icon = Icons.add_shopping_cart;
        color = const Color(0xFF10B981);
        typeLabel = 'STOCK IN';
        break;
      case 'sale':
        icon = Icons.shopping_cart;
        color = const Color(0xFF3B82F6);
        typeLabel = 'STOCK OUT';
        break;
      case 'transfer':
        icon = Icons.sync_alt;
        color = const Color(0xFF8B5CF6);
        typeLabel = 'TRANSFER';
        break;
      default:
        icon = Icons.edit;
        color = const Color(0xFFF59E0B);
        typeLabel = 'ADJUSTMENT';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        typeLabel,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      DateFormat('HH:mm').format(transactionDate),
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  movement['itemName'] as String? ?? 'Unknown',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${type == 'purchase' ? '+' : '-'}${quantity.toInt()} ${movement['unit'] ?? 'units'}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: type == 'purchase' ? const Color(0xFF10B981) : const Color(0xFF3B82F6),
                ),
              ),
              Text(
                NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(totalAmount),
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showAddCellDialog() {
    // Check if a zone is selected
    if (_selectedZoneId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a zone first to add a cell, or create a zone in Warehouse Management'),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    _cellNameController.clear();
    _cellCodeController.clear();
    _cellCapacityController.clear();

    // Get the zone name for display
    final selectedZone = _zones.firstWhere(
      (z) => z.id == _selectedZoneId,
      orElse: () => Zone(id: '', warehouseId: '', name: 'Unknown', createdAt: DateTime.now(), updatedAt: DateTime.now()),
    );

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.add_box, color: Colors.blue),
            SizedBox(width: 8),
            Text('Add New Cell'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Show which zone the cell will be added to
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.dashboard_outlined, color: Colors.blue.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Adding to Zone: ${selectedZone.name}',
                      style: TextStyle(
                        color: Colors.blue.shade800,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _cellCodeController,
              decoration: const InputDecoration(
                labelText: 'Cell Code *',
                hintText: 'e.g., A1, B2',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.qr_code),
              ),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _cellNameController,
              decoration: const InputDecoration(
                labelText: 'Cell Name *',
                hintText: 'e.g., Electronics Zone',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.inventory_2),
              ),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _cellCapacityController,
              decoration: const InputDecoration(
                labelText: 'Capacity (optional)',
                hintText: 'Maximum units',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.format_list_numbered),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () async {
              if (_cellCodeController.text.isEmpty || _cellNameController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill required fields')),
                );
                return;
              }

              final db = await DatabaseManager.instance.database;
              await db.insert('cells', {
                'id': 'cell_${DateTime.now().millisecondsSinceEpoch}',
                'warehouseId': _selectedWarehouseId,
                'zoneId': _selectedZoneId,
                'code': _cellCodeController.text.toUpperCase(),
                'name': _cellNameController.text,
                'capacity': int.tryParse(_cellCapacityController.text),
                'description': null,
                'isActive': 1,
                'createdAt': DateTime.now().toIso8601String(),
                'updatedAt': DateTime.now().toIso8601String(),
              });

              if (mounted) {
                Navigator.pop(context);
                _loadCells();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Cell "${_cellNameController.text}" added to zone "${selectedZone.name}"'),
                    backgroundColor: Colors.green,
                  ),
                );
              }
            },
            icon: const Icon(Icons.add),
            label: const Text('Add Cell'),
          ),
        ],
      ),
    );
  }
}
