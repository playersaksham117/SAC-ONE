import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/warehouse.dart';
import '../models/location.dart';
import '../models/inventory_item.dart';
import '../providers/stock_entry_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/inventory_provider.dart';
import '../providers/settings_provider.dart';

class AddStockScreen extends StatefulWidget {
  const AddStockScreen({super.key});

  @override
  State<AddStockScreen> createState() => _AddStockScreenState();
}

class _AddStockScreenState extends State<AddStockScreen> {
  final _formKey = GlobalKey<FormState>();

  // Controllers
  final _quantityController = TextEditingController();
  final _batchNumberController = TextEditingController();
  final _cellNameController = TextEditingController();
  final _cellCodeController = TextEditingController();
  final _barcodeController = TextEditingController();
  final _unitPriceController = TextEditingController();
  final _itemSearchController = TextEditingController();

  // Selected values
  Warehouse? _selectedWarehouse;
  Zone? _selectedZone;
  Cell? _selectedCell;
  InventoryItem? _selectedItem;
  DateTime? _expiryDate;

  // Lists for dropdowns
  List<Zone> _zones = [];
  List<Cell> _cells = [];
  List<InventoryItem> _filteredItems = [];

  // UI state
  bool _isCreatingZone = false;
  bool _isCreatingCell = false;
  bool _isLoading = false;
  bool _showItemSuggestions = false;
  String _locationCode = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadInitialData();
    });
  }

  Future<void> _loadInitialData() async {
    final inventoryProvider =
        Provider.of<InventoryProvider>(context, listen: false);
    final warehouseProvider =
        Provider.of<WarehouseProvider>(context, listen: false);

    await Future.wait([
      inventoryProvider.loadInventoryItems(),
      warehouseProvider.loadWarehouses(),
    ]);
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _batchNumberController.dispose();
    _cellNameController.dispose();
    _cellCodeController.dispose();
    _barcodeController.dispose();
    _unitPriceController.dispose();
    _itemSearchController.dispose();
    super.dispose();
  }

  // ==================== ITEM SEARCH METHODS ====================

  void _filterItems(String query) {
    if (query.isEmpty) {
      setState(() {
        _filteredItems = [];
        _showItemSuggestions = false;
      });
      return;
    }

    final inventoryProvider =
        Provider.of<InventoryProvider>(context, listen: false);
    final lowerQuery = query.toLowerCase();
    setState(() {
      _filteredItems = inventoryProvider.items
          .where((item) {
            return item.name.toLowerCase().startsWith(lowerQuery) ||
                item.sku.toLowerCase().startsWith(lowerQuery) ||
                (item.barcode?.toLowerCase().startsWith(lowerQuery) ?? false);
          })
          .take(10)
          .toList();
      _showItemSuggestions = _filteredItems.isNotEmpty;
    });
  }

  void _selectItem(InventoryItem item) {
    setState(() {
      _selectedItem = item;
      _itemSearchController.text = item.name;
      _unitPriceController.text = item.costPrice.toString();
      _filteredItems = [];
      _showItemSuggestions = false;
    });
  }

  // ==================== LOCATION METHODS ====================

  Future<void> _onWarehouseChanged(Warehouse? warehouse) async {
    setState(() {
      _selectedWarehouse = warehouse;
      _selectedZone = null;
      _selectedCell = null;
      _zones = [];
      _cells = [];
      _locationCode = '';
    });

    if (warehouse != null) {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      final zones = await provider.loadZones(warehouse.id);
      setState(() => _zones = zones);
    }
  }

  Future<void> _onZoneChanged(Zone? zone) async {
    setState(() {
      _selectedZone = zone;
      _selectedCell = null;
      _cells = [];
    });

    if (zone != null) {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      final cells = await provider.loadCellsForZone(zone.id);
      setState(() => _cells = cells);
    }
    _updateLocationCode();
  }

  void _onCellChanged(Cell? cell) {
    setState(() => _selectedCell = cell);
    _updateLocationCode();
  }

  void _updateLocationCode() {
    if (_selectedWarehouse != null && _selectedCell != null) {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      setState(() {
        _locationCode = provider.generateSimpleLocationCode(
          warehouseName: _selectedWarehouse!.name,
          cellCode: _selectedCell!.code,
        );
      });
    } else {
      setState(() => _locationCode = '');
    }
  }

  // ==================== CREATE NEW LOCATION METHODS ====================

  Future<void> _createZone() async {
    if (_cellNameController.text.trim().isEmpty) {
      _showError('Please enter a zone name');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      final zone = await provider.createZone(
        warehouseId: _selectedWarehouse!.id,
        name: _cellNameController.text.trim(),
      );

      final zones = await provider.loadZones(_selectedWarehouse!.id);
      setState(() {
        _zones = zones;
        _selectedZone = zone;
        _isCreatingZone = false;
        _cellNameController.clear();
        _cells = [];
      });

      _showSuccess('Zone created successfully');
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _createCell() async {
    if (_cellNameController.text.trim().isEmpty ||
        _cellCodeController.text.trim().isEmpty) {
      _showError('Please enter both cell name and code');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      final cell = await provider.createCellInZone(
        zoneId: _selectedZone!.id,
        warehouseId: _selectedWarehouse!.id,
        name: _cellNameController.text.trim(),
        code: _cellCodeController.text.trim().toUpperCase(),
      );

      final cells = await provider.loadCellsForZone(_selectedZone!.id);
      setState(() {
        _cells = cells;
        _selectedCell = cell;
        _isCreatingCell = false;
        _cellNameController.clear();
        _cellCodeController.clear();
      });

      _onCellChanged(cell);
      _showSuccess('Cell created successfully');
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // ==================== SAVE STOCK ENTRY ====================

  Future<void> _saveStockEntry() async {
    if (!_formKey.currentState!.validate()) return;

    // Validation
    if (_selectedWarehouse == null) {
      _showError('Please select a warehouse');
      return;
    }
    if (_selectedZone == null) {
      _showError('Please select or create a zone');
      return;
    }
    if (_selectedCell == null) {
      _showError('Please select or create a cell');
      return;
    }
    if (_selectedItem == null) {
      _showError('Please select an item');
      return;
    }

    final quantity = double.tryParse(_quantityController.text);
    if (quantity == null || quantity <= 0) {
      _showError('Please enter a valid quantity greater than zero');
      return;
    }

    final unitPrice = double.tryParse(_unitPriceController.text);
    if (unitPrice == null || unitPrice < 0) {
      _showError('Please enter a valid unit price');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final provider = Provider.of<StockEntryProvider>(context, listen: false);
      await provider.addStockEntrySimple(
        itemId: _selectedItem!.id,
        warehouseId: _selectedWarehouse!.id,
        cellId: _selectedCell!.id,
        quantity: quantity,
        unitPrice: unitPrice,
        batchNumber: _batchNumberController.text.trim().isEmpty
            ? null
            : _batchNumberController.text.trim(),
        expiryDate: _expiryDate,
      );

      _showSuccess('Stock added successfully at $_locationCode');
      _resetForm();

      // Reload inventory to update stock levels
      final inventoryProvider =
          Provider.of<InventoryProvider>(context, listen: false);
      await inventoryProvider.loadInventoryItems();
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    _quantityController.clear();
    _batchNumberController.clear();
    _unitPriceController.clear();
    _barcodeController.clear();
    _itemSearchController.clear();
    setState(() {
      _selectedWarehouse = null;
      _selectedZone = null;
      _selectedCell = null;
      _selectedItem = null;
      _expiryDate = null;
      _zones = [];
      _cells = [];
      _filteredItems = [];
      _showItemSuggestions = false;
      _locationCode = '';
    });
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message.replaceAll('Exception: ', '')),
        backgroundColor: Colors.red,
      ),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock In / Purchase'),
        actions: [
          if (_isLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16.0),
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Step indicator
              _buildStepIndicator(),
              const SizedBox(height: 32),

              // 1. Warehouse Selection
              _buildWarehouseSelector(),
              const SizedBox(height: 24),

              if (_selectedWarehouse != null) ...[
                // 2. Location Hierarchy
                _buildLocationSection(),
                const SizedBox(height: 24),
              ],

              if (_selectedCell != null) ...[
                // 3. Item Selection
                _buildItemSelector(),
                const SizedBox(height: 24),
              ],

              if (_selectedItem != null) ...[
                // 4. Quantity and Additional Details
                _buildQuantitySection(),
                const SizedBox(height: 32),
              ],

              // Location Code Display
              if (_locationCode.isNotEmpty) ...[
                _buildLocationCodeDisplay(),
                const SizedBox(height: 24),
              ],

              // Save Button
              if (_selectedItem != null)
                ElevatedButton(
                  onPressed: _isLoading ? null : _saveStockEntry,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                  ),
                  child: const Text(
                    'Save Stock Entry',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepIndicator() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            _buildStep('1', 'Warehouse', _selectedWarehouse != null),
            const SizedBox(width: 8),
            _buildStepDivider(_selectedWarehouse != null),
            const SizedBox(width: 8),
            _buildStep('2', 'Zone', _selectedZone != null),
            const SizedBox(width: 8),
            _buildStepDivider(_selectedZone != null),
            const SizedBox(width: 8),
            _buildStep('3', 'Cell', _selectedCell != null),
            const SizedBox(width: 8),
            _buildStepDivider(_selectedCell != null),
            const SizedBox(width: 8),
            _buildStep('4', 'Item', _selectedItem != null),
            const SizedBox(width: 8),
            _buildStepDivider(_selectedItem != null),
            const SizedBox(width: 8),
            _buildStep('5', 'Qty', _quantityController.text.isNotEmpty),
          ],
        ),
      ),
    );
  }

  Widget _buildStep(String number, String label, bool completed) {
    return Expanded(
      child: Column(
        children: [
          CircleAvatar(
            backgroundColor: completed ? Colors.green : Colors.grey.shade300,
            child: completed
                ? const Icon(Icons.check, color: Colors.white, size: 16)
                : Text(number, style: const TextStyle(fontSize: 12)),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: completed ? Colors.green : Colors.grey.shade600,
              fontWeight: completed ? FontWeight.bold : FontWeight.normal,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildStepDivider(bool completed) {
    return Expanded(
      child: Container(
        height: 2,
        color: completed ? Colors.green : Colors.grey.shade300,
      ),
    );
  }

  Widget _buildWarehouseSelector() {
    return Consumer<WarehouseProvider>(
      builder: (context, provider, child) {
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.warehouse, color: Colors.blue),
                    SizedBox(width: 8),
                    Text(
                      'Step 1: Select Warehouse',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<Warehouse>(
                  initialValue: _selectedWarehouse,
                  decoration: const InputDecoration(
                    labelText: 'Warehouse *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.warehouse_outlined),
                  ),
                  items: provider.warehouses.map((warehouse) {
                    return DropdownMenuItem(
                      value: warehouse,
                      child: Text('${warehouse.name} (${warehouse.code})'),
                    );
                  }).toList(),
                  onChanged: _isLoading ? null : _onWarehouseChanged,
                  validator: (value) =>
                      value == null ? 'Please select a warehouse' : null,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildLocationSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.location_on, color: Colors.orange),
                SizedBox(width: 8),
                Text(
                  'Step 2: Select or Create Location',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Select existing or create new: Warehouse → Zone → Cell',
              style: TextStyle(color: Colors.grey, fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              'Locations created here will be available for all warehouse operations',
              style: TextStyle(
                  color: Colors.blue.shade700,
                  fontSize: 12,
                  fontStyle: FontStyle.italic),
            ),
            const SizedBox(height: 16),

            // Zone selection
            if (_selectedWarehouse != null) ...[
              _isCreatingZone ? _buildCreateZoneForm() : _buildZoneDropdown(),
              const SizedBox(height: 16),
            ],

            // Cell selection (only if zone is selected)
            if (_selectedZone != null) ...[
              _isCreatingCell ? _buildCreateCellForm() : _buildCellDropdown(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildZoneDropdown() {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<Zone>(
            initialValue: _selectedZone,
            decoration: const InputDecoration(
              labelText: 'Zone *',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.dashboard_outlined),
            ),
            items: _zones.map((zone) {
              return DropdownMenuItem(
                value: zone,
                child: Text(zone.name),
              );
            }).toList(),
            onChanged: _isLoading ? null : _onZoneChanged,
            validator: (value) => value == null ? 'Please select a zone' : null,
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(Icons.add_circle_outline),
          color: Colors.blue,
          tooltip: 'Create new zone',
          onPressed: () => setState(() => _isCreatingZone = true),
        ),
      ],
    );
  }

  Widget _buildCreateZoneForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _cellNameController,
          decoration: const InputDecoration(
            labelText: 'New Zone Name *',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.dashboard_outlined),
            hintText: 'e.g., Zone A, Cold Storage',
          ),
          textCapitalization: TextCapitalization.words,
          onSubmitted: (_) => _createZone(),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  setState(() {
                    _isCreatingZone = false;
                    _cellNameController.clear();
                  });
                },
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton(
                onPressed: _isLoading ? null : _createZone,
                child: const Text('Create Zone'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCellDropdown() {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<Cell>(
            initialValue: _selectedCell,
            decoration: const InputDecoration(
              labelText: 'Cell *',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.inventory_2_outlined),
            ),
            items: _cells.map((cell) {
              return DropdownMenuItem(
                value: cell,
                child: Text('${cell.name} (${cell.code})'),
              );
            }).toList(),
            onChanged: _isLoading ? null : _onCellChanged,
            validator: (value) => value == null ? 'Please select a cell' : null,
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(Icons.add_circle_outline),
          color: Colors.blue,
          tooltip: 'Create new cell',
          onPressed: () => setState(() => _isCreatingCell = true),
        ),
      ],
    );
  }

  Widget _buildCreateCellForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _cellNameController,
          decoration: const InputDecoration(
            labelText: 'New Cell Name *',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.inventory_2_outlined),
            hintText: 'e.g., Cell 1, Bin A1',
          ),
          textCapitalization: TextCapitalization.words,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _cellCodeController,
          decoration: const InputDecoration(
            labelText: 'Cell Code *',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.qr_code),
            hintText: 'e.g., A1, B2, C3',
          ),
          textCapitalization: TextCapitalization.characters,
          onSubmitted: (_) => _createCell(),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  setState(() {
                    _isCreatingCell = false;
                    _cellNameController.clear();
                    _cellCodeController.clear();
                  });
                },
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton(
                onPressed: _isLoading ? null : _createCell,
                child: const Text('Create Cell'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildItemSelector() {
    return Consumer2<InventoryProvider, SettingsProvider>(
      builder: (context, inventoryProvider, settingsProvider, child) {
        final currencySymbol = settingsProvider.currency.symbol;

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.inventory, color: Colors.purple),
                    SizedBox(width: 8),
                    Text(
                      'Step 4: Select Item',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Dynamic Item Search
                const Text(
                  'Search Item *',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _itemSearchController,
                  decoration: InputDecoration(
                    hintText: 'Start typing item name, SKU, or barcode...',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _selectedItem != null
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              setState(() {
                                _selectedItem = null;
                                _itemSearchController.clear();
                                _unitPriceController.clear();
                                _filteredItems = [];
                                _showItemSuggestions = false;
                              });
                            },
                          )
                        : null,
                  ),
                  onChanged: _filterItems,
                ),

                // Item suggestions dropdown
                if (_showItemSuggestions)
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
                      itemCount: _filteredItems.length,
                      itemBuilder: (context, index) {
                        final item = _filteredItems[index];
                        final totalStock =
                            inventoryProvider.getTotalStock(item.id);
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Colors.purple.shade50,
                            child: Icon(Icons.inventory_2,
                                color: Colors.purple.shade700, size: 20),
                          ),
                          title: Text(
                            item.name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'SKU: ${item.sku} | Stock: ${totalStock.toStringAsFixed(0)} ${item.unit}',
                                style: TextStyle(
                                    fontSize: 12, color: Colors.grey.shade600),
                              ),
                              if (item.brand != null &&
                                      item.brand!.isNotEmpty ||
                                  item.hsn != null && item.hsn!.isNotEmpty)
                                Text(
                                  '${item.brand != null && item.brand!.isNotEmpty ? 'Brand: ${item.brand}' : ''}${item.brand != null && item.brand!.isNotEmpty && item.hsn != null && item.hsn!.isNotEmpty ? ' | ' : ''}${item.hsn != null && item.hsn!.isNotEmpty ? 'HSN: ${item.hsn}' : ''}',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500),
                                ),
                            ],
                          ),
                          trailing: Text(
                            '$currencySymbol${item.costPrice.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.green.shade700,
                            ),
                          ),
                          onTap: () => _selectItem(item),
                        );
                      },
                    ),
                  ),
                const SizedBox(height: 16),

                // Selected item display
                if (_selectedItem != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, color: Colors.green.shade700),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _selectedItem!.name,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green.shade800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  Text(
                                    'SKU: ${_selectedItem!.sku}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.green.shade700),
                                  ),
                                  Text(
                                    '| Category: ${_selectedItem!.category}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.green.shade700),
                                  ),
                                  Text(
                                    '| Unit: ${_selectedItem!.unit}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.green.shade700),
                                  ),
                                  if (_selectedItem!.brand != null &&
                                      _selectedItem!.brand!.isNotEmpty)
                                    Text(
                                      '| Brand: ${_selectedItem!.brand}',
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.green.shade700),
                                    ),
                                  if (_selectedItem!.hsn != null &&
                                      _selectedItem!.hsn!.isNotEmpty)
                                    Text(
                                      '| HSN: ${_selectedItem!.hsn}',
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.green.shade700),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Unit Price Input
                  TextField(
                    controller: _unitPriceController,
                    decoration: InputDecoration(
                      labelText: 'Unit Price *',
                      border: const OutlineInputBorder(),
                      prefixText: currencySymbol,
                      prefixIcon: const Icon(Icons.attach_money),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ] else ...[
                  // Barcode Scanner Input (alternative)
                  const Text(
                    'OR Scan Barcode',
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _barcodeController,
                    decoration: InputDecoration(
                      labelText: 'Scan or Enter Barcode',
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.qr_code_scanner),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _barcodeController.clear();
                          setState(() => _selectedItem = null);
                        },
                      ),
                    ),
                    onSubmitted: (value) =>
                        _searchItemByBarcode(value, inventoryProvider),
                    onChanged: (value) {
                      if (value.length >= 3) {
                        _searchItemByBarcode(value, inventoryProvider);
                      }
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  void _searchItemByBarcode(String barcode, InventoryProvider provider) {
    if (barcode.isEmpty) return;

    // Search by barcode or SKU
    final item = provider.items.where((item) {
      final barcodeMatch = item.barcode?.toLowerCase() == barcode.toLowerCase();
      final skuMatch = item.sku.toLowerCase() == barcode.toLowerCase();
      return barcodeMatch || skuMatch;
    }).firstOrNull;

    if (item != null) {
      _selectItem(item);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✓ Item found: ${item.name}'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 2),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('⚠ No item found with this barcode/SKU'),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Widget _buildQuantitySection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.add_box, color: Colors.green),
                SizedBox(width: 8),
                Text(
                  'Step 5: Enter Quantity',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _quantityController,
              decoration: InputDecoration(
                labelText: 'Quantity *',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.production_quantity_limits),
                suffixText: _selectedItem?.unit ?? '',
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Please enter quantity';
                }
                final qty = double.tryParse(value);
                if (qty == null || qty <= 0) {
                  return 'Quantity must be greater than zero';
                }
                return null;
              },
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _batchNumberController,
              decoration: const InputDecoration(
                labelText: 'Batch Number (Optional)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.qr_code),
              ),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 16),
            InkWell(
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: _expiryDate ??
                      DateTime.now().add(const Duration(days: 365)),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 3650)),
                );
                if (date != null) {
                  setState(() => _expiryDate = date);
                }
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Expiry Date (Optional)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.calendar_today),
                ),
                child: Text(
                  _expiryDate == null
                      ? 'Select expiry date'
                      : '${_expiryDate!.day}/${_expiryDate!.month}/${_expiryDate!.year}',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationCodeDisplay() {
    return Card(
      color: Colors.blue.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.qr_code_2, color: Colors.blue),
                SizedBox(width: 8),
                Text(
                  'Location Code',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              _locationCode,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${_selectedWarehouse?.name} → ${_selectedCell?.name}',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
