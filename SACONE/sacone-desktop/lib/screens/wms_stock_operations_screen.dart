/// ============================================================
/// STOCK OPERATIONS SCREEN - Stock In/Out/Transfer/Adjust
/// ============================================================
/// 
/// Central hub for all stock operations.
/// Tabbed interface for different operation types.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import '../domain/entities/warehouse.dart';
import '../domain/entities/stock_movement.dart';

class StockOperationsScreen extends StatefulWidget {
  const StockOperationsScreen({super.key});

  @override
  State<StockOperationsScreen> createState() => _StockOperationsScreenState();
}

class _StockOperationsScreenState extends State<StockOperationsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    
    // Load warehouses for dropdowns
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WarehouseProvider>().loadWarehouses();
      context.read<InventoryProvider>().loadItems();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Operations'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.arrow_downward), text: 'Stock In'),
            Tab(icon: Icon(Icons.arrow_upward), text: 'Stock Out'),
            Tab(icon: Icon(Icons.swap_horiz), text: 'Transfer'),
            Tab(icon: Icon(Icons.tune), text: 'Adjust'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _StockInTab(),
          _StockOutTab(),
          _TransferTab(),
          _AdjustmentTab(),
        ],
      ),
    );
  }
}

// ============================================================
// STOCK IN TAB
// ============================================================

class _StockInTab extends StatefulWidget {
  const _StockInTab();

  @override
  State<_StockInTab> createState() => _StockInTabState();
}

class _StockInTabState extends State<_StockInTab> {
  final _formKey = GlobalKey<FormState>();
  
  String? _selectedItemId;
  String? _selectedWarehouseId;
  String? _selectedLocationId;
  final _quantityController = TextEditingController();
  final _batchController = TextEditingController();
  final _expiryController = TextEditingController();
  final _notesController = TextEditingController();
  
  DateTime? _expiryDate;
  bool _isLoading = false;

  @override
  void dispose() {
    _quantityController.dispose();
    _batchController.dispose();
    _expiryController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _selectExpiryDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 30)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    
    if (date != null) {
      setState(() {
        _expiryDate = date;
        _expiryController.text = '${date.day}/${date.month}/${date.year}';
      });
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedItemId == null || _selectedLocationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select item and location')),
      );
      return;
    }
    
    setState(() => _isLoading = true);
    
    final stock = context.read<StockProvider>();
    final result = await stock.stockIn(
      itemId: _selectedItemId!,
      locationId: _selectedLocationId!,
      quantity: double.parse(_quantityController.text),
      batchNumber: _batchController.text.isEmpty ? null : _batchController.text,
      expiryDate: _expiryDate,
      notes: _notesController.text.isEmpty ? null : _notesController.text,
      performedBy: context.read<AuthProvider>().currentUser?.id ?? 'system',
    );
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      final success = stock.successMessage != null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Stock received successfully' : stock.errorMessage ?? 'Failed'),
          backgroundColor: success ? Colors.green : Theme.of(context).colorScheme.error,
        ),
      );
      
      if (success) {
        // Reset form
        _formKey.currentState?.reset();
        _selectedItemId = null;
        _quantityController.clear();
        _batchController.clear();
        _expiryController.clear();
        _notesController.clear();
        _expiryDate = null;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final inventory = context.watch<InventoryProvider>();
    final warehouse = context.watch<WarehouseProvider>();
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Receive Stock',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Add new stock to inventory',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    const Divider(height: 32),
                    
                    // Item selection
                    DropdownButtonFormField<String>(
                      value: _selectedItemId,
                      decoration: const InputDecoration(
                        labelText: 'Item *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      items: inventory.items.map((item) {
                        return DropdownMenuItem(
                          value: item.id,
                          child: Text('${item.sku} - ${item.name}'),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedItemId = value);
                      },
                      validator: (value) => value == null ? 'Select an item' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Warehouse selection
                    DropdownButtonFormField<String>(
                      value: _selectedWarehouseId,
                      decoration: const InputDecoration(
                        labelText: 'Warehouse *',
                        prefixIcon: Icon(Icons.warehouse_outlined),
                      ),
                      items: warehouse.warehouses.map((wh) {
                        return DropdownMenuItem(
                          value: wh.id,
                          child: Text(wh.name),
                        );
                      }).toList(),
                      onChanged: (value) async {
                        setState(() {
                          _selectedWarehouseId = value;
                          _selectedLocationId = null;
                        });
                        if (value != null) {
                          await warehouse.selectWarehouseById(value);
                        }
                      },
                      validator: (value) => value == null ? 'Select a warehouse' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Location selection
                    DropdownButtonFormField<String>(
                      value: _selectedLocationId,
                      decoration: const InputDecoration(
                        labelText: 'Location *',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                      items: warehouse.pickableLocations.map((loc) {
                        return DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.fullPath),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedLocationId = value);
                      },
                      validator: (value) => value == null ? 'Select a location' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Quantity
                    TextFormField(
                      controller: _quantityController,
                      decoration: const InputDecoration(
                        labelText: 'Quantity *',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
                      ],
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Enter quantity';
                        final qty = double.tryParse(value);
                        if (qty == null || qty <= 0) return 'Enter valid quantity';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Batch and Expiry (optional)
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _batchController,
                            decoration: const InputDecoration(
                              labelText: 'Batch Number',
                              prefixIcon: Icon(Icons.qr_code_2),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextFormField(
                            controller: _expiryController,
                            decoration: InputDecoration(
                              labelText: 'Expiry Date',
                              prefixIcon: const Icon(Icons.event),
                              suffixIcon: IconButton(
                                icon: const Icon(Icons.calendar_today),
                                onPressed: _selectExpiryDate,
                              ),
                            ),
                            readOnly: true,
                            onTap: _selectExpiryDate,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    
                    // Notes
                    TextFormField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        prefixIcon: Icon(Icons.notes),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 24),
                    
                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isLoading ? null : _handleSubmit,
                        icon: _isLoading 
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.check),
                        label: const Text('Receive Stock'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// STOCK OUT TAB
// ============================================================

class _StockOutTab extends StatefulWidget {
  const _StockOutTab();

  @override
  State<_StockOutTab> createState() => _StockOutTabState();
}

class _StockOutTabState extends State<_StockOutTab> {
  final _formKey = GlobalKey<FormState>();
  
  String? _selectedItemId;
  String? _selectedWarehouseId;
  final _quantityController = TextEditingController();
  final _referenceController = TextEditingController();
  final _notesController = TextEditingController();
  
  MovementReason _selectedReason = MovementReason.sale;
  bool _isLoading = false;

  @override
  void dispose() {
    _quantityController.dispose();
    _referenceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedItemId == null || _selectedWarehouseId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select item and warehouse')),
      );
      return;
    }
    
    setState(() => _isLoading = true);
    
    final stock = context.read<StockProvider>();
    final result = await stock.stockOut(
      itemId: _selectedItemId!,
      warehouseId: _selectedWarehouseId!,
      quantity: double.parse(_quantityController.text),
      reason: _selectedReason,
      reference: _referenceController.text.isEmpty ? null : _referenceController.text,
      notes: _notesController.text.isEmpty ? null : _notesController.text,
      performedBy: context.read<AuthProvider>().currentUser?.id ?? 'system',
    );
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      final success = stock.successMessage != null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Stock issued using FEFO' : stock.errorMessage ?? 'Failed'),
          backgroundColor: success ? Colors.green : Theme.of(context).colorScheme.error,
        ),
      );
      
      if (success) {
        _formKey.currentState?.reset();
        _selectedItemId = null;
        _quantityController.clear();
        _referenceController.clear();
        _notesController.clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final inventory = context.watch<InventoryProvider>();
    final warehouse = context.watch<WarehouseProvider>();
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Issue Stock',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'FEFO',
                            style: TextStyle(
                              color: Colors.blue.shade800,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'First Expiry First Out - automatic batch selection',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.outline,
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 32),
                    
                    // Item selection
                    DropdownButtonFormField<String>(
                      value: _selectedItemId,
                      decoration: const InputDecoration(
                        labelText: 'Item *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      items: inventory.items.map((item) {
                        return DropdownMenuItem(
                          value: item.id,
                          child: Text('${item.sku} - ${item.name}'),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedItemId = value);
                      },
                      validator: (value) => value == null ? 'Select an item' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Warehouse selection
                    DropdownButtonFormField<String>(
                      value: _selectedWarehouseId,
                      decoration: const InputDecoration(
                        labelText: 'Warehouse *',
                        prefixIcon: Icon(Icons.warehouse_outlined),
                      ),
                      items: warehouse.warehouses.map((wh) {
                        return DropdownMenuItem(
                          value: wh.id,
                          child: Text(wh.name),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedWarehouseId = value);
                      },
                      validator: (value) => value == null ? 'Select a warehouse' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Quantity
                    TextFormField(
                      controller: _quantityController,
                      decoration: const InputDecoration(
                        labelText: 'Quantity *',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
                      ],
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Enter quantity';
                        final qty = double.tryParse(value);
                        if (qty == null || qty <= 0) return 'Enter valid quantity';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Reason
                    DropdownButtonFormField<MovementReason>(
                      value: _selectedReason,
                      decoration: const InputDecoration(
                        labelText: 'Reason *',
                        prefixIcon: Icon(Icons.label_outline),
                      ),
                      items: [
                        MovementReason.sale,
                        MovementReason.consumption,
                        MovementReason.sample,
                        MovementReason.damage,
                        MovementReason.expired,
                        MovementReason.other,
                      ].map((reason) {
                        return DropdownMenuItem(
                          value: reason,
                          child: Text(reason.name.toUpperCase()),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _selectedReason = value);
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Reference
                    TextFormField(
                      controller: _referenceController,
                      decoration: const InputDecoration(
                        labelText: 'Reference',
                        prefixIcon: Icon(Icons.tag),
                        hintText: 'Order number, invoice, etc.',
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Notes
                    TextFormField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        prefixIcon: Icon(Icons.notes),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 24),
                    
                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isLoading ? null : _handleSubmit,
                        icon: _isLoading 
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.check),
                        label: const Text('Issue Stock'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// TRANSFER TAB
// ============================================================

class _TransferTab extends StatefulWidget {
  const _TransferTab();

  @override
  State<_TransferTab> createState() => _TransferTabState();
}

class _TransferTabState extends State<_TransferTab> {
  final _formKey = GlobalKey<FormState>();
  
  String? _selectedItemId;
  String? _sourceWarehouseId;
  String? _sourceLocationId;
  String? _destWarehouseId;
  String? _destLocationId;
  final _quantityController = TextEditingController();
  final _notesController = TextEditingController();
  
  List<StorageLocation> _sourceLocations = [];
  List<StorageLocation> _destLocations = [];
  bool _isLoading = false;

  @override
  void dispose() {
    _quantityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedItemId == null || _sourceLocationId == null || _destLocationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select all fields')),
      );
      return;
    }
    
    setState(() => _isLoading = true);
    
    final stock = context.read<StockProvider>();
    final result = await stock.transfer(
      itemId: _selectedItemId!,
      fromLocationId: _sourceLocationId!,
      toLocationId: _destLocationId!,
      quantity: double.parse(_quantityController.text),
      notes: _notesController.text.isEmpty ? null : _notesController.text,
      performedBy: context.read<AuthProvider>().currentUser?.id ?? 'system',
    );
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      final success = stock.successMessage != null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Stock transferred successfully' : stock.errorMessage ?? 'Failed'),
          backgroundColor: success ? Colors.green : Theme.of(context).colorScheme.error,
        ),
      );
      
      if (success) {
        _formKey.currentState?.reset();
        _selectedItemId = null;
        _sourceLocationId = null;
        _destLocationId = null;
        _quantityController.clear();
        _notesController.clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final inventory = context.watch<InventoryProvider>();
    final warehouse = context.watch<WarehouseProvider>();
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Transfer Stock',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Move stock between locations',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    const Divider(height: 32),
                    
                    // Item selection
                    DropdownButtonFormField<String>(
                      value: _selectedItemId,
                      decoration: const InputDecoration(
                        labelText: 'Item *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      items: inventory.items.map((item) {
                        return DropdownMenuItem(
                          value: item.id,
                          child: Text('${item.sku} - ${item.name}'),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedItemId = value);
                      },
                      validator: (value) => value == null ? 'Select an item' : null,
                    ),
                    const SizedBox(height: 24),
                    
                    // Source section
                    Text(
                      'FROM',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    
                    DropdownButtonFormField<String>(
                      value: _sourceWarehouseId,
                      decoration: const InputDecoration(
                        labelText: 'Source Warehouse *',
                        prefixIcon: Icon(Icons.warehouse_outlined),
                      ),
                      items: warehouse.warehouses.map((wh) {
                        return DropdownMenuItem(
                          value: wh.id,
                          child: Text(wh.name),
                        );
                      }).toList(),
                      onChanged: (value) async {
                        setState(() {
                          _sourceWarehouseId = value;
                          _sourceLocationId = null;
                          _sourceLocations = [];
                        });
                        if (value != null) {
                          await warehouse.selectWarehouseById(value);
                          setState(() {
                            _sourceLocations = warehouse.pickableLocations;
                          });
                        }
                      },
                      validator: (value) => value == null ? 'Select warehouse' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    DropdownButtonFormField<String>(
                      value: _sourceLocationId,
                      decoration: const InputDecoration(
                        labelText: 'Source Location *',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                      items: _sourceLocations.map((loc) {
                        return DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.fullPath),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _sourceLocationId = value);
                      },
                      validator: (value) => value == null ? 'Select location' : null,
                    ),
                    const SizedBox(height: 24),
                    
                    // Destination section
                    Text(
                      'TO',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Colors.green,
                      ),
                    ),
                    const SizedBox(height: 8),
                    
                    DropdownButtonFormField<String>(
                      value: _destWarehouseId,
                      decoration: const InputDecoration(
                        labelText: 'Destination Warehouse *',
                        prefixIcon: Icon(Icons.warehouse_outlined),
                      ),
                      items: warehouse.warehouses.map((wh) {
                        return DropdownMenuItem(
                          value: wh.id,
                          child: Text(wh.name),
                        );
                      }).toList(),
                      onChanged: (value) async {
                        setState(() {
                          _destWarehouseId = value;
                          _destLocationId = null;
                          _destLocations = [];
                        });
                        if (value != null) {
                          await warehouse.selectWarehouseById(value);
                          setState(() {
                            _destLocations = warehouse.pickableLocations;
                          });
                        }
                      },
                      validator: (value) => value == null ? 'Select warehouse' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    DropdownButtonFormField<String>(
                      value: _destLocationId,
                      decoration: const InputDecoration(
                        labelText: 'Destination Location *',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                      items: _destLocations.map((loc) {
                        return DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.fullPath),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _destLocationId = value);
                      },
                      validator: (value) => value == null ? 'Select location' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Quantity
                    TextFormField(
                      controller: _quantityController,
                      decoration: const InputDecoration(
                        labelText: 'Quantity *',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
                      ],
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Enter quantity';
                        final qty = double.tryParse(value);
                        if (qty == null || qty <= 0) return 'Enter valid quantity';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Notes
                    TextFormField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        prefixIcon: Icon(Icons.notes),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 24),
                    
                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isLoading ? null : _handleSubmit,
                        icon: _isLoading 
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.swap_horiz),
                        label: const Text('Transfer Stock'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// ADJUSTMENT TAB
// ============================================================

class _AdjustmentTab extends StatefulWidget {
  const _AdjustmentTab();

  @override
  State<_AdjustmentTab> createState() => _AdjustmentTabState();
}

class _AdjustmentTabState extends State<_AdjustmentTab> {
  final _formKey = GlobalKey<FormState>();
  
  String? _selectedItemId;
  String? _selectedWarehouseId;
  String? _selectedLocationId;
  final _quantityController = TextEditingController();
  final _actualController = TextEditingController();
  final _notesController = TextEditingController();
  
  MovementReason _selectedReason = MovementReason.cycleCount;
  bool _isLoading = false;

  @override
  void dispose() {
    _quantityController.dispose();
    _actualController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedItemId == null || _selectedLocationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select all fields')),
      );
      return;
    }
    
    setState(() => _isLoading = true);
    
    final stock = context.read<StockProvider>();
    final adjustmentQuantity = double.parse(_quantityController.text);
    
    final result = await stock.adjust(
      itemId: _selectedItemId!,
      locationId: _selectedLocationId!,
      adjustmentQuantity: adjustmentQuantity,
      reason: _selectedReason,
      notes: _notesController.text.isEmpty ? null : _notesController.text,
      performedBy: context.read<AuthProvider>().currentUser?.id ?? 'system',
    );
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      final success = stock.successMessage != null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Stock adjusted successfully' : stock.errorMessage ?? 'Failed'),
          backgroundColor: success ? Colors.green : Theme.of(context).colorScheme.error,
        ),
      );
      
      if (success) {
        _formKey.currentState?.reset();
        _selectedItemId = null;
        _selectedLocationId = null;
        _quantityController.clear();
        _actualController.clear();
        _notesController.clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final inventory = context.watch<InventoryProvider>();
    final warehouse = context.watch<WarehouseProvider>();
    final colorScheme = Theme.of(context).colorScheme;
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Stock Adjustment',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Adjust stock for discrepancies, damage, or corrections',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.outline,
                      ),
                    ),
                    const Divider(height: 32),
                    
                    // Item selection
                    DropdownButtonFormField<String>(
                      value: _selectedItemId,
                      decoration: const InputDecoration(
                        labelText: 'Item *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      items: inventory.items.map((item) {
                        return DropdownMenuItem(
                          value: item.id,
                          child: Text('${item.sku} - ${item.name}'),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedItemId = value);
                      },
                      validator: (value) => value == null ? 'Select an item' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Warehouse selection
                    DropdownButtonFormField<String>(
                      value: _selectedWarehouseId,
                      decoration: const InputDecoration(
                        labelText: 'Warehouse *',
                        prefixIcon: Icon(Icons.warehouse_outlined),
                      ),
                      items: warehouse.warehouses.map((wh) {
                        return DropdownMenuItem(
                          value: wh.id,
                          child: Text(wh.name),
                        );
                      }).toList(),
                      onChanged: (value) async {
                        setState(() {
                          _selectedWarehouseId = value;
                          _selectedLocationId = null;
                        });
                        if (value != null) {
                          await warehouse.selectWarehouseById(value);
                        }
                      },
                      validator: (value) => value == null ? 'Select a warehouse' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Location selection
                    DropdownButtonFormField<String>(
                      value: _selectedLocationId,
                      decoration: const InputDecoration(
                        labelText: 'Location *',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                      items: warehouse.pickableLocations.map((loc) {
                        return DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.fullPath),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() => _selectedLocationId = value);
                      },
                      validator: (value) => value == null ? 'Select a location' : null,
                    ),
                    const SizedBox(height: 16),
                    
                    // Adjustment quantity (can be negative)
                    TextFormField(
                      controller: _quantityController,
                      decoration: const InputDecoration(
                        labelText: 'Adjustment Quantity *',
                        prefixIcon: Icon(Icons.exposure),
                        hintText: 'Use negative for decrease',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                        signed: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[-\d.]')),
                      ],
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Enter quantity';
                        final qty = double.tryParse(value);
                        if (qty == null || qty == 0) return 'Enter valid non-zero quantity';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Reason
                    DropdownButtonFormField<MovementReason>(
                      value: _selectedReason,
                      decoration: const InputDecoration(
                        labelText: 'Reason *',
                        prefixIcon: Icon(Icons.label_outline),
                      ),
                      items: [
                        MovementReason.cycleCount,
                        MovementReason.damage,
                        MovementReason.shrinkage,
                        MovementReason.found,
                        MovementReason.correction,
                        MovementReason.other,
                      ].map((reason) {
                        return DropdownMenuItem(
                          value: reason,
                          child: Text(reason.name.toUpperCase()),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _selectedReason = value);
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    
                    // Notes (required for adjustments)
                    TextFormField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes *',
                        prefixIcon: Icon(Icons.notes),
                        hintText: 'Explain reason for adjustment',
                      ),
                      maxLines: 3,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Notes are required for adjustments';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 24),
                    
                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isLoading ? null : _handleSubmit,
                        icon: _isLoading 
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.check),
                        label: const Text('Apply Adjustment'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
