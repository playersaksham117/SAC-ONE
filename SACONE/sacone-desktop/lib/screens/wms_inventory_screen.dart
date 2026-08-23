/// ============================================================
/// INVENTORY SCREEN - Item management
/// ============================================================
/// 
/// CRUD interface for inventory items.
/// Includes search, filtering, and bulk operations.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import '../domain/entities/item.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  final _searchController = TextEditingController();
  
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<InventoryProvider>();
      if (provider.items.isEmpty) {
        provider.loadItems();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showItemDialog({Item? item}) {
    showDialog(
      context: context,
      builder: (context) => _ItemFormDialog(item: item),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () {
              // Show filter dialog
            },
            tooltip: 'Filter',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<InventoryProvider>().loadItems();
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Consumer<InventoryProvider>(
        builder: (context, inventory, _) {
          return Column(
            children: [
              // Search and actions bar
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        decoration: InputDecoration(
                          hintText: 'Search by name, SKU, or barcode...',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.clear),
                                  onPressed: () {
                                    _searchController.clear();
                                    inventory.search('');
                                  },
                                )
                              : null,
                        ),
                        onChanged: (value) {
                          inventory.search(value);
                        },
                      ),
                    ),
                    const SizedBox(width: 16),
                    FilledButton.icon(
                      onPressed: () => _showItemDialog(),
                      icon: const Icon(Icons.add),
                      label: const Text('Add Item'),
                    ),
                  ],
                ),
              ),
              
              // Items table
              Expanded(
                child: inventory.isLoading && inventory.items.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : inventory.items.isEmpty
                        ? _EmptyState(onAddItem: () => _showItemDialog())
                        : _ItemsDataTable(
                            items: inventory.items,
                            onEdit: (item) => _showItemDialog(item: item),
                            onDelete: (item) => _confirmDelete(item),
                          ),
              ),
              
              // Pagination
              if (inventory.items.isNotEmpty)
                _PaginationBar(
                  currentPage: inventory.currentPage,
                  totalPages: inventory.totalPages,
                  totalItems: inventory.totalItems,
                  onPageChanged: (page) => inventory.goToPage(page),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(Item item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Item'),
        content: Text('Are you sure you want to delete "${item.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    
    if (confirm == true && mounted) {
      final result = await context.read<InventoryProvider>().deleteItem(item.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result is Success ? 'Item deleted' : 'Failed to delete item'),
          ),
        );
      }
    }
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onAddItem;
  
  const _EmptyState({required this.onAddItem});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.inventory_2_outlined,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            'No items found',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Add your first inventory item to get started',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onAddItem,
            icon: const Icon(Icons.add),
            label: const Text('Add First Item'),
          ),
        ],
      ),
    );
  }
}

class _ItemsDataTable extends StatelessWidget {
  final List<Item> items;
  final Function(Item) onEdit;
  final Function(Item) onDelete;
  
  const _ItemsDataTable({
    required this.items,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SingleChildScrollView(
        child: DataTable(
          headingRowColor: WidgetStateProperty.all(colorScheme.surfaceContainerHighest),
          columns: const [
            DataColumn(label: Text('SKU')),
            DataColumn(label: Text('Name')),
            DataColumn(label: Text('Category')),
            DataColumn(label: Text('Unit')),
            DataColumn(label: Text('Min Stock'), numeric: true),
            DataColumn(label: Text('Max Stock'), numeric: true),
            DataColumn(label: Text('Batch Track')),
            DataColumn(label: Text('Actions')),
          ],
          rows: items.map((item) {
            return DataRow(
              cells: [
                DataCell(
                  Text(
                    item.sku,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
                DataCell(
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 200),
                    child: Text(
                      item.name,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                DataCell(Text(item.categoryId ?? '-')),
                DataCell(Text(item.unitOfMeasure)),
                DataCell(Text(item.minStockLevel?.toString() ?? '-')),
                DataCell(Text(item.maxStockLevel?.toString() ?? '-')),
                DataCell(
                  item.trackBatches
                      ? Icon(Icons.check_circle, color: Colors.green, size: 18)
                      : Icon(Icons.cancel, color: colorScheme.outline, size: 18),
                ),
                DataCell(
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        onPressed: () => onEdit(item),
                        tooltip: 'Edit',
                      ),
                      IconButton(
                        icon: Icon(Icons.delete_outline, size: 18, color: colorScheme.error),
                        onPressed: () => onDelete(item),
                        tooltip: 'Delete',
                      ),
                    ],
                  ),
                ),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }
}

class _PaginationBar extends StatelessWidget {
  final int currentPage;
  final int totalPages;
  final int totalItems;
  final Function(int) onPageChanged;
  
  const _PaginationBar({
    required this.currentPage,
    required this.totalPages,
    required this.totalItems,
    required this.onPageChanged,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '$totalItems items',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: colorScheme.outline,
            ),
          ),
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.first_page),
                onPressed: currentPage > 1 ? () => onPageChanged(1) : null,
                tooltip: 'First page',
              ),
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: currentPage > 1 ? () => onPageChanged(currentPage - 1) : null,
                tooltip: 'Previous page',
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Page $currentPage of $totalPages',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: currentPage < totalPages ? () => onPageChanged(currentPage + 1) : null,
                tooltip: 'Next page',
              ),
              IconButton(
                icon: const Icon(Icons.last_page),
                onPressed: currentPage < totalPages ? () => onPageChanged(totalPages) : null,
                tooltip: 'Last page',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ItemFormDialog extends StatefulWidget {
  final Item? item;
  
  const _ItemFormDialog({this.item});

  @override
  State<_ItemFormDialog> createState() => _ItemFormDialogState();
}

class _ItemFormDialogState extends State<_ItemFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _skuController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _barcodeController;
  late final TextEditingController _unitController;
  late final TextEditingController _minStockController;
  late final TextEditingController _maxStockController;
  
  bool _trackBatches = false;
  bool _trackExpiry = false;
  bool _trackSerials = false;
  bool _isLoading = false;
  
  bool get isEditing => widget.item != null;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _nameController = TextEditingController(text: item?.name ?? '');
    _skuController = TextEditingController(text: item?.sku ?? '');
    _descriptionController = TextEditingController(text: item?.description ?? '');
    _barcodeController = TextEditingController(text: item?.barcode ?? '');
    _unitController = TextEditingController(text: item?.unitOfMeasure ?? 'PCS');
    _minStockController = TextEditingController(text: item?.minStockLevel?.toString() ?? '');
    _maxStockController = TextEditingController(text: item?.maxStockLevel?.toString() ?? '');
    _trackBatches = item?.trackBatches ?? false;
    _trackExpiry = item?.trackExpiry ?? false;
    _trackSerials = item?.trackSerialNumbers ?? false;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _skuController.dispose();
    _descriptionController.dispose();
    _barcodeController.dispose();
    _unitController.dispose();
    _minStockController.dispose();
    _maxStockController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);
    
    final provider = context.read<InventoryProvider>();
    
    if (isEditing) {
      await provider.updateItem(
        widget.item!.id,
        name: _nameController.text.trim(),
        description: _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        barcode: _barcodeController.text.trim().isEmpty ? null : _barcodeController.text.trim(),
        unitOfMeasure: _unitController.text.trim(),
        minStockLevel: _minStockController.text.isEmpty ? null : double.tryParse(_minStockController.text),
        maxStockLevel: _maxStockController.text.isEmpty ? null : double.tryParse(_maxStockController.text),
        trackBatches: _trackBatches,
        trackExpiry: _trackExpiry,
        trackSerialNumbers: _trackSerials,
      );
    } else {
      await provider.createItem(
        name: _nameController.text.trim(),
        sku: _skuController.text.trim().isEmpty ? null : _skuController.text.trim(),
        description: _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        barcode: _barcodeController.text.trim().isEmpty ? null : _barcodeController.text.trim(),
        unitOfMeasure: _unitController.text.trim(),
        minStockLevel: _minStockController.text.isEmpty ? null : double.tryParse(_minStockController.text),
        maxStockLevel: _maxStockController.text.isEmpty ? null : double.tryParse(_maxStockController.text),
        trackBatches: _trackBatches,
        trackExpiry: _trackExpiry,
        trackSerialNumbers: _trackSerials,
      );
    }
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(isEditing ? 'Edit Item' : 'Add Item'),
      content: SizedBox(
        width: 500,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name *',
                    hintText: 'Enter item name',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Name is required';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _skuController,
                        decoration: InputDecoration(
                          labelText: 'SKU',
                          hintText: 'Auto-generated if empty',
                          enabled: !isEditing,
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextFormField(
                        controller: _barcodeController,
                        decoration: const InputDecoration(
                          labelText: 'Barcode',
                          hintText: 'Enter barcode',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                TextFormField(
                  controller: _descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Enter description',
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _unitController,
                        decoration: const InputDecoration(
                          labelText: 'Unit of Measure *',
                          hintText: 'PCS, BOX, KG...',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Unit is required';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextFormField(
                        controller: _minStockController,
                        decoration: const InputDecoration(
                          labelText: 'Min Stock Level',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextFormField(
                        controller: _maxStockController,
                        decoration: const InputDecoration(
                          labelText: 'Max Stock Level',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                
                Text(
                  'Tracking Options',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                
                CheckboxListTile(
                  title: const Text('Track Batches'),
                  subtitle: const Text('Enable batch/lot number tracking'),
                  value: _trackBatches,
                  onChanged: (value) {
                    setState(() => _trackBatches = value ?? false);
                  },
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: const Text('Track Expiry'),
                  subtitle: const Text('Enable expiry date tracking (FEFO)'),
                  value: _trackExpiry,
                  onChanged: (value) {
                    setState(() => _trackExpiry = value ?? false);
                  },
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: const Text('Track Serial Numbers'),
                  subtitle: const Text('Track individual serial numbers'),
                  value: _trackSerials,
                  onChanged: (value) {
                    setState(() => _trackSerials = value ?? false);
                  },
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleSubmit,
          child: _isLoading
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(isEditing ? 'Update' : 'Create'),
        ),
      ],
    );
  }
}
