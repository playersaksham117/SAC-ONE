import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import 'package:file_picker/file_picker.dart';
import 'package:csv/csv.dart';
import 'dart:io';
import '../providers/inventory_provider.dart';
import '../providers/settings_provider.dart';
import '../models/inventory_item.dart';
import '../widgets/barcode_print_dialog.dart';
import '../services/stock_operations_service.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  String _searchQuery = '';
  String _selectedCategory = 'All';

  @override
  Widget build(BuildContext context) {
    return Consumer<InventoryProvider>(
      builder: (context, inventoryProvider, _) {
        final categories = ['All', ...inventoryProvider.items.map((i) => i.category).toSet()];
        
        var filteredItems = inventoryProvider.items.where((item) {
          final query = _searchQuery.toLowerCase().trim();
          final barcode = (item.barcode ?? '').toLowerCase();
          final matchesSearch = item.name.toLowerCase().contains(query) ||
              item.sku.toLowerCase().contains(query) ||
              barcode.contains(query);
          final matchesCategory = _selectedCategory == 'All' || item.category == _selectedCategory;
          return matchesSearch && matchesCategory;
        }).toList();

        return Column(
          children: [
            // Header with title and add button
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(
                  bottom: BorderSide(color: Colors.grey.shade200, width: 1),
                ),
              ),
              child: Row(
                children: [
                  const Text(
                    'Inventory Management',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const Spacer(),
                  OutlinedButton.icon(
                    onPressed: () => _importFromCSV(context),
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Import CSV'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      foregroundColor: const Color(0xFF2563EB),
                      side: const BorderSide(color: Color(0xFF2563EB)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton.icon(
                    onPressed: () => _showAddItemDialog(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Add Item'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            // Search and Filter Bar
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: TextField(
                      decoration: InputDecoration(
                        hintText: 'Search by name, SKU, or barcode...',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onChanged: (value) => setState(() => _searchQuery = value),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _selectedCategory,
                      decoration: InputDecoration(
                        labelText: 'Category',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      items: categories.map((cat) {
                        return DropdownMenuItem(value: cat, child: Text(cat));
                      }).toList(),
                      onChanged: (value) => setState(() => _selectedCategory = value!),
                    ),
                  ),
                ],
              ),
            ),

              // Items List
              Expanded(
                child: filteredItems.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.inventory_outlined, size: 80, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text(
                              'No items found',
                              style: TextStyle(fontSize: 18, color: Colors.grey.shade600),
                            ),
                            const SizedBox(height: 8),
                            ElevatedButton.icon(
                              onPressed: () => _showAddItemDialog(context),
                              icon: const Icon(Icons.add),
                              label: const Text('Add Item'),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) {
                          final item = filteredItems[index];
                          final totalStock = inventoryProvider.getTotalStock(item.id);
                          final isLowStock = totalStock <= item.reorderLevel;
                          final isCritical = totalStock <= item.minStockLevel;

                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              contentPadding: const EdgeInsets.all(16),
                              leading: Container(
                                width: 60,
                                height: 60,
                                decoration: BoxDecoration(
                                  color: isCritical
                                      ? Colors.red.shade50
                                      : isLowStock
                                          ? Colors.orange.shade50
                                          : Colors.green.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(
                                  Icons.inventory_2,
                                  color: isCritical
                                      ? Colors.red
                                      : isLowStock
                                          ? Colors.orange
                                          : Colors.green,
                                  size: 32,
                                ),
                              ),
                              title: Text(
                                item.name,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text('SKU: ${item.sku} • Category: ${item.category}'),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      if (isCritical)
                                        Chip(
                                          label: const Text('CRITICAL', style: TextStyle(fontSize: 11)),
                                          backgroundColor: Colors.red.shade100,
                                          labelPadding: EdgeInsets.zero,
                                          visualDensity: VisualDensity.compact,
                                        )
                                      else if (isLowStock)
                                        Chip(
                                          label: const Text('LOW STOCK', style: TextStyle(fontSize: 11)),
                                          backgroundColor: Colors.orange.shade100,
                                          labelPadding: EdgeInsets.zero,
                                          visualDensity: VisualDensity.compact,
                                        )
                                      else
                                        Chip(
                                          label: const Text('IN STOCK', style: TextStyle(fontSize: 11)),
                                          backgroundColor: Colors.green.shade100,
                                          labelPadding: EdgeInsets.zero,
                                          visualDensity: VisualDensity.compact,
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: SizedBox(
                                width: 200,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          '${totalStock.toStringAsFixed(0)} ${item.unit}',
                                          style: TextStyle(
                                            fontSize: 20,
                                            fontWeight: FontWeight.bold,
                                            color: isCritical
                                                ? Colors.red
                                                : isLowStock
                                                    ? Colors.orange
                                                    : Colors.green,
                                          ),
                                        ),
                                        Text(
                                          'Min: ${item.minStockLevel.toStringAsFixed(0)}',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.grey.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(width: 16),
                                    PopupMenuButton(
                                      itemBuilder: (context) => [
                                        const PopupMenuItem(
                                          value: 'view',
                                          child: Row(
                                            children: [
                                              Icon(Icons.visibility),
                                              SizedBox(width: 8),
                                              Text('View Details'),
                                            ],
                                          ),
                                        ),
                                        const PopupMenuItem(
                                          value: 'print_barcode',
                                          child: Row(
                                            children: [
                                              Icon(Icons.qr_code_2, color: Color(0xFF3B82F6)),
                                              SizedBox(width: 8),
                                              Text('Print Barcode'),
                                            ],
                                          ),
                                        ),
                                        const PopupMenuItem(
                                          value: 'edit',
                                          child: Row(
                                            children: [
                                              Icon(Icons.edit),
                                              SizedBox(width: 8),
                                              Text('Edit'),
                                            ],
                                          ),
                                        ),
                                        const PopupMenuItem(
                                          value: 'delete',
                                          child: Row(
                                            children: [
                                              Icon(Icons.delete, color: Colors.red),
                                              SizedBox(width: 8),
                                              Text('Delete', style: TextStyle(color: Colors.red)),
                                            ],
                                          ),
                                        ),
                                      ],
                                      onSelected: (value) {
                                        switch (value) {
                                          case 'view':
                                            _showItemDetails(context, item);
                                            break;
                                          case 'print_barcode':
                                            showDialog(
                                              context: context,
                                              builder: (context) => BarcodePrintDialog(item: item),
                                            );
                                            break;
                                          case 'edit':
                                            _showEditItemDialog(context, item);
                                            break;
                                          case 'delete':
                                            _deleteItem(context, item.id);
                                            break;
                                        }
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      );
  }

  void _showAddItemDialog(BuildContext context) {
    final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);
    final currencySymbol = settingsProvider.currency.symbol;
    
    final nameController = TextEditingController();
    final skuController = TextEditingController();
    final barcodeController = TextEditingController();
    final categoryController = TextEditingController();
    final unitController = TextEditingController(text: 'pcs');
    final reorderLevelController = TextEditingController(text: '10');
    final minStockController = TextEditingController(text: '5');
    final costPriceController = TextEditingController(text: '0');
    final sellingPriceController = TextEditingController(text: '0');
    final descriptionController = TextEditingController();
    final hsnController = TextEditingController();
    final brandController = TextEditingController();
    bool isAdding = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add New Item'),
        content: SingleChildScrollView(
          child: SizedBox(
            width: 600,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Item Name *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: skuController,
                        decoration: const InputDecoration(
                          labelText: 'SKU *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: categoryController,
                        decoration: const InputDecoration(
                          labelText: 'Category *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: barcodeController,
                        decoration: const InputDecoration(
                          labelText: 'Barcode',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: hsnController,
                        decoration: const InputDecoration(
                          labelText: 'HSN Code',
                          hintText: 'e.g. 8471',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: brandController,
                        decoration: const InputDecoration(
                          labelText: 'Brand',
                          hintText: 'e.g. Samsung',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: unitController,
                        decoration: const InputDecoration(
                          labelText: 'Unit *',
                          hintText: 'pcs, kg, ltr',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: reorderLevelController,
                        decoration: const InputDecoration(
                          labelText: 'Reorder Level *',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: minStockController,
                        decoration: const InputDecoration(
                          labelText: 'Min Stock *',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: costPriceController,
                        decoration: InputDecoration(
                          labelText: 'Cost Price *',
                          prefixText: '$currencySymbol ',
                          border: const OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: sellingPriceController,
                        decoration: InputDecoration(
                          labelText: 'Selling Price *',
                          prefixText: '$currencySymbol ',
                          border: const OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: isAdding ? null : () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: isAdding ? null : () async {
              if (nameController.text.isEmpty ||
                  skuController.text.isEmpty ||
                  categoryController.text.isEmpty ||
                  unitController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill required fields')),
                );
                return;
              }

              setState(() {
                isAdding = true;
              });

              try {
                print('Creating inventory item...');
                final item = InventoryItem(
                  id: const Uuid().v4(),
                  name: nameController.text,
                  sku: skuController.text,
                  barcode: barcodeController.text.isEmpty ? null : barcodeController.text,
                  category: categoryController.text,
                  unit: unitController.text,
                  reorderLevel: double.tryParse(reorderLevelController.text) ?? 10,
                  minStockLevel: double.tryParse(minStockController.text) ?? 5,
                  costPrice: double.tryParse(costPriceController.text) ?? 0,
                  sellingPrice: double.tryParse(sellingPriceController.text) ?? 0,
                  description: descriptionController.text.isEmpty ? null : descriptionController.text,
                  hsn: hsnController.text.isEmpty ? null : hsnController.text,
                  brand: brandController.text.isEmpty ? null : brandController.text,
                  createdAt: DateTime.now(),
                  updatedAt: DateTime.now(),
                );
                print('Item created: ${item.name}');

                print('Calling addInventoryItem...');
                await Provider.of<InventoryProvider>(context, listen: false).addInventoryItem(item);
                print('Item added successfully');

                if (context.mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Item added successfully')),
                  );
                }
              } catch (e) {
                print('Error in add item dialog: $e');
                setState(() {
                  isAdding = false;
                });
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error adding item: $e')),
                  );
                }
              }
            },
            child: isAdding 
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Add Item'),
          ),
        ],
      ),
      ),
    );
  }

  void _showEditItemDialog(BuildContext context, InventoryItem item) {
    final nameController = TextEditingController(text: item.name);
    final skuController = TextEditingController(text: item.sku);
    final barcodeController = TextEditingController(text: item.barcode ?? '');
    final categoryController = TextEditingController(text: item.category);
    final unitController = TextEditingController(text: item.unit);
    final reorderLevelController = TextEditingController(text: item.reorderLevel.toString());
    final minStockController = TextEditingController(text: item.minStockLevel.toString());
    final costPriceController = TextEditingController(text: item.costPrice.toString());
    final sellingPriceController = TextEditingController(text: item.sellingPrice.toString());
    final descriptionController = TextEditingController(text: item.description ?? '');
    final hsnController = TextEditingController(text: item.hsn ?? '');
    final brandController = TextEditingController(text: item.brand ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Item'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Item Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: skuController,
                        decoration: const InputDecoration(
                          labelText: 'SKU *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: barcodeController,
                        decoration: const InputDecoration(
                          labelText: 'Barcode',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: categoryController,
                        decoration: const InputDecoration(
                          labelText: 'Category *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: unitController,
                        decoration: const InputDecoration(
                          labelText: 'Unit (pcs, kg, etc.) *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: reorderLevelController,
                        decoration: const InputDecoration(
                          labelText: 'Reorder Level',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: minStockController,
                        decoration: const InputDecoration(
                          labelText: 'Min Stock Level',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: costPriceController,
                        decoration: const InputDecoration(
                          labelText: 'Cost Price',
                          border: OutlineInputBorder(),
                          prefixText: '₹ ',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: sellingPriceController,
                        decoration: const InputDecoration(
                          labelText: 'Selling Price',
                          border: OutlineInputBorder(),
                          prefixText: '₹ ',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: hsnController,
                        decoration: const InputDecoration(
                          labelText: 'HSN Code',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: brandController,
                        decoration: const InputDecoration(
                          labelText: 'Brand',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 3,
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
            onPressed: () async {
              if (nameController.text.isEmpty ||
                  skuController.text.isEmpty ||
                  categoryController.text.isEmpty ||
                  unitController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill all required fields')),
                );
                return;
              }

              final updatedItem = InventoryItem(
                id: item.id,
                name: nameController.text,
                sku: skuController.text,
                barcode: barcodeController.text.isEmpty ? null : barcodeController.text,
                category: categoryController.text,
                unit: unitController.text,
                reorderLevel: double.tryParse(reorderLevelController.text) ?? item.reorderLevel,
                minStockLevel: double.tryParse(minStockController.text) ?? item.minStockLevel,
                costPrice: double.tryParse(costPriceController.text) ?? item.costPrice,
                sellingPrice: double.tryParse(sellingPriceController.text) ?? item.sellingPrice,
                description: descriptionController.text.isEmpty ? null : descriptionController.text,
                hsn: hsnController.text.isEmpty ? null : hsnController.text,
                brand: brandController.text.isEmpty ? null : brandController.text,
                createdAt: item.createdAt,
                updatedAt: DateTime.now(),
              );

              await Provider.of<InventoryProvider>(context, listen: false).updateInventoryItem(updatedItem);

              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Item updated successfully')),
                );
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  void _showItemDetails(BuildContext context, InventoryItem item) async {
    final inventoryProvider = Provider.of<InventoryProvider>(context, listen: false);
    final totalStock = inventoryProvider.getTotalStock(item.id);

    // Get stock locations from warehouse to bin
    final stockLocations = await StockOperationsService.getItemStockLocations(item.id);

    if (!context.mounted) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Expanded(child: Text(item.name)),
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () {
                Navigator.pop(context);
                _showEditItemDialog(context, item);
              },
              tooltip: 'Edit Item',
            ),
          ],
        ),
        content: SizedBox(
          width: 700,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Basic Information
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Basic Information',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildDetailRow('SKU', item.sku),
                      if (item.barcode != null) _buildDetailRow('Barcode', item.barcode!),
                      _buildDetailRow('Category', item.category),
                      _buildDetailRow('Unit', item.unit),
                      if (item.hsn != null) _buildDetailRow('HSN Code', item.hsn!),
                      if (item.brand != null) _buildDetailRow('Brand', item.brand!),
                      if (item.description != null) _buildDetailRow('Description', item.description!),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                // Stock Information
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Stock Information',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildDetailRow('Total Stock', '${totalStock.toStringAsFixed(0)} ${item.unit}'),
                      _buildDetailRow('Reorder Level', '${item.reorderLevel.toStringAsFixed(0)} ${item.unit}'),
                      _buildDetailRow('Min Stock', '${item.minStockLevel.toStringAsFixed(0)} ${item.unit}'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                // Pricing
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pricing',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildDetailRow('Cost Price', '₹${item.costPrice.toStringAsFixed(2)}'),
                      _buildDetailRow('Selling Price', '₹${item.sellingPrice.toStringAsFixed(2)}'),
                      _buildDetailRow(
                        'Margin',
                        '₹${(item.sellingPrice - item.costPrice).toStringAsFixed(2)} (${item.costPrice > 0 ? ((item.sellingPrice - item.costPrice) / item.costPrice * 100).toStringAsFixed(1) : '0.0'}%)',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                // Stock Locations
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.location_on, size: 20),
                          SizedBox(width: 8),
                          Text(
                            'Stock Locations',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (stockLocations.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            'No stock available in any location',
                            style: TextStyle(color: Colors.grey.shade600, fontStyle: FontStyle.italic),
                          ),
                        )
                      else
                        ...stockLocations.map((location) => _buildLocationCard(location, item.unit)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.pop(context);
              _showEditItemDialog(context, item);
            },
            icon: const Icon(Icons.edit),
            label: const Text('Edit Item'),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 150,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  Widget _buildLocationCard(Map<String, dynamic> location, String unit) {
    final quantity = location['quantity'] as double;
    final warehouseName = location['warehouseName'] as String;
    final zoneName = location['zoneName'] as String;
    final rackName = location['rackName'] as String;
    final shelfName = location['shelfName'] as String;
    final binName = location['binName'] as String;
    final batchNumber = location['batchNumber'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.orange.shade700,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '${quantity.toStringAsFixed(0)} $unit',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (batchNumber != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'Batch: $batchNumber',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.warehouse, size: 14, color: Colors.grey.shade600),
              const SizedBox(width: 4),
              Text(
                warehouseName,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: Text(
              '🔹 Zone: $zoneName  →  Rack: $rackName  →  Shelf: $shelfName  →  Bin: $binName',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade700,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _deleteItem(BuildContext context, String itemId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Item'),
        content: const Text('Are you sure you want to delete this item? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              await Provider.of<InventoryProvider>(context, listen: false).deleteInventoryItem(itemId);
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Item deleted')),
                );
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  Future<void> _importFromCSV(BuildContext context) async {
    try {
      // Pick CSV file
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv'],
        dialogTitle: 'Select CSV file to import',
      );

      if (result == null || result.files.isEmpty) return;

      final file = File(result.files.single.path!);
      final csvString = await file.readAsString();
      
      // Parse CSV
      List<List<dynamic>> csvData = const CsvToListConverter().convert(csvString);
      
      if (csvData.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('CSV file is empty')),
          );
        }
        return;
      }

      // Get headers (first row)
      final headers = csvData[0].map((h) => h.toString().toLowerCase().trim()).toList();
      
      // Show column mapping dialog
      if (context.mounted) {
        await _showColumnMappingDialog(context, headers, csvData.sublist(1));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error reading CSV: $e')),
        );
      }
    }
  }

  Future<void> _showColumnMappingDialog(
    BuildContext context, 
    List<String> headers, 
    List<List<dynamic>> dataRows,
  ) async {
    // Field mappings - key is our field, value is CSV column index
    Map<String, int?> mappings = {
      'name': _findColumnIndex(headers, ['name', 'product name', 'item name', 'product', 'item']),
      'sku': _findColumnIndex(headers, ['sku', 'sku_id', 'sku id', 'product code', 'code']),
      'barcode': _findColumnIndex(headers, ['barcode', 'ean', 'ean-13', 'ean-13 code', 'ean13', 'upc']),
      'category': _findColumnIndex(headers, ['category', 'cat', 'product category']),
      'unit': _findColumnIndex(headers, ['unit', 'uom', 'unit of measure']),
      'description': _findColumnIndex(headers, ['description', 'desc', 'details', 'product description', 'text']),
      'costPrice': _findColumnIndex(headers, ['cost', 'cost price', 'purchase price', 'buying price']),
      'sellingPrice': _findColumnIndex(headers, ['sale_price', 'selling price', 'price', 'mrp', 'sell price']),
      'hsn': _findColumnIndex(headers, ['hsn', 'hsn code', 'hsn_code', 'hsncode', 'hsn/sac', 'hsn sac', 'hsn number']),
      'brand': _findColumnIndex(headers, ['brand', 'brand name', 'manufacturer']),
      'reorderLevel': _findColumnIndex(headers, ['reorder', 'reorder level', 'reorder_level', 'stock']),
      'minStockLevel': _findColumnIndex(headers, ['min stock', 'min_stock', 'minimum stock', 'min stock level']),
    };

    final fieldLabels = {
      'name': 'Item Name *',
      'sku': 'SKU *',
      'barcode': 'Barcode',
      'category': 'Category *',
      'unit': 'Unit *',
      'description': 'Description',
      'costPrice': 'Cost Price',
      'sellingPrice': 'Selling Price',
      'hsn': 'HSN Code',
      'brand': 'Brand',
      'reorderLevel': 'Reorder Level',
      'minStockLevel': 'Min Stock Level',
    };

    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.upload_file, color: Color(0xFF2563EB)),
              const SizedBox(width: 12),
              const Text('Import from CSV'),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${dataRows.length} items',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.blue.shade700,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          content: SizedBox(
            width: 600,
            height: 500,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.amber.shade700),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Map your CSV columns to inventory fields. Fields marked with * are required.',
                          style: TextStyle(color: Colors.amber.shade800),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      children: mappings.keys.map((field) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Row(
                            children: [
                              SizedBox(
                                width: 150,
                                child: Text(
                                  fieldLabels[field]!,
                                  style: TextStyle(
                                    fontWeight: fieldLabels[field]!.contains('*') 
                                        ? FontWeight.bold 
                                        : FontWeight.normal,
                                  ),
                                ),
                              ),
                              const Icon(Icons.arrow_forward, size: 16, color: Colors.grey),
                              const SizedBox(width: 12),
                              Expanded(
                                child: DropdownButtonFormField<int?>(
                                  initialValue: mappings[field],
                                  decoration: InputDecoration(
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    filled: true,
                                    fillColor: Colors.grey.shade50,
                                  ),
                                  items: [
                                    const DropdownMenuItem<int?>(
                                      value: null,
                                      child: Text('-- Not Mapped --', style: TextStyle(color: Colors.grey)),
                                    ),
                                    ...headers.asMap().entries.map((entry) {
                                      return DropdownMenuItem<int?>(
                                        value: entry.key,
                                        child: Text(entry.value),
                                      );
                                    }),
                                  ],
                                  onChanged: (value) {
                                    setState(() {
                                      mappings[field] = value;
                                    });
                                  },
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
                const Divider(),
                // Preview section
                const Text(
                  'Preview (first 3 rows):',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Container(
                  height: 100,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SingleChildScrollView(
                      child: DataTable(
                        columns: headers.map((h) => DataColumn(label: Text(h, style: const TextStyle(fontWeight: FontWeight.bold)))).toList(),
                        rows: dataRows.take(3).map((row) {
                          return DataRow(
                            cells: row.map((cell) => DataCell(Text(cell.toString()))).toList(),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
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
                // Validate required fields are mapped
                if (mappings['name'] == null || 
                    mappings['sku'] == null || 
                    mappings['category'] == null || 
                    mappings['unit'] == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please map all required fields (Name, SKU, Category, Unit)'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                Navigator.pop(context);
                await _processCSVImport(context, mappings, dataRows);
              },
              icon: const Icon(Icons.check),
              label: const Text('Import'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  int? _findColumnIndex(List<String> headers, List<String> possibleNames) {
    for (var name in possibleNames) {
      final index = headers.indexOf(name.toLowerCase());
      if (index != -1) return index;
    }
    return null;
  }

  Future<void> _processCSVImport(
    BuildContext context,
    Map<String, int?> mappings,
    List<List<dynamic>> dataRows,
  ) async {
    final inventoryProvider = Provider.of<InventoryProvider>(context, listen: false);
    
    int successCount = 0;
    int errorCount = 0;
    int skipCount = 0;
    List<String> errors = [];
    
    // Build a set of existing SKUs for O(1) lookup (much faster than list search)
    final existingSKUs = <String>{};
    for (final item in inventoryProvider.items) {
      existingSKUs.add(item.sku);
    }

    // Show progress dialog with progress bar
    final progressNotifier = ValueNotifier<String>('Validating items...');
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            ValueListenableBuilder<String>(
              valueListenable: progressNotifier,
              builder: (context, progress, _) => Text(progress),
            ),
          ],
        ),
      ),
    );

    try {
      // Phase 1: Validate and collect items (without database writes)
      final itemsToImport = <InventoryItem>[];
      final localSKUs = <String>{...existingSKUs}; // Track SKUs including those being imported
      
      for (int i = 0; i < dataRows.length; i++) {
        final row = dataRows[i];
        
        try {
          // Get values from mapped columns
          String getValue(String field) {
            final index = mappings[field];
            if (index == null || index >= row.length) return '';
            return row[index]?.toString().trim() ?? '';
          }

          double getDoubleValue(String field) {
            final value = getValue(field);
            if (value.isEmpty) return 0.0;
            return double.tryParse(value.replaceAll(',', '')) ?? 0.0;
          }

          final name = getValue('name');
          final sku = getValue('sku');
          final category = getValue('category');
          final unit = getValue('unit');

          // Skip empty rows
          if (name.isEmpty && sku.isEmpty) {
            skipCount++;
            continue;
          }

          // Validate required fields
          if (name.isEmpty || sku.isEmpty || category.isEmpty || unit.isEmpty) {
            errorCount++;
            errors.add('Row ${i + 2}: Missing required fields');
            continue;
          }

          // Check for duplicate SKU (including items already in import list)
          if (localSKUs.contains(sku)) {
            skipCount++;
            continue;
          }

          final item = InventoryItem(
            id: const Uuid().v4(),
            name: name,
            sku: sku,
            barcode: getValue('barcode').isEmpty ? null : getValue('barcode'),
            category: category,
            unit: unit.isEmpty ? 'PCS' : unit,
            description: getValue('description').isEmpty ? null : getValue('description'),
            costPrice: getDoubleValue('costPrice'),
            sellingPrice: getDoubleValue('sellingPrice'),
            reorderLevel: getDoubleValue('reorderLevel'),
            minStockLevel: getDoubleValue('minStockLevel'),
            hsn: getValue('hsn').isEmpty ? null : getValue('hsn'),
            brand: getValue('brand').isEmpty ? null : getValue('brand'),
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );

          itemsToImport.add(item);
          localSKUs.add(sku);
          successCount++;
        } catch (e) {
          errorCount++;
          errors.add('Row ${i + 2}: $e');
        }
      }

      // Phase 2: Bulk insert all validated items
      if (itemsToImport.isNotEmpty) {
        progressNotifier.value = 'Importing ${itemsToImport.length} items...';
        
        await inventoryProvider.bulkImportInventoryItems(
          itemsToImport,
          onProgress: (progress, total) {
            progressNotifier.value = 'Importing items... ($progress/$total)';
          },
        );
      }
    } catch (e) {
      errorCount++;
      errors.add('Bulk import error: $e');
    }

    // Close progress dialog
    if (context.mounted) {
      Navigator.pop(context);
    }

    // Show results
    if (context.mounted) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: Row(
            children: [
              Icon(
                successCount > 0 ? Icons.check_circle : Icons.warning,
                color: successCount > 0 ? Colors.green : Colors.orange,
              ),
              const SizedBox(width: 12),
              const Text('Import Complete'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildResultRow(Icons.check_circle, Colors.green, 'Imported', successCount),
              _buildResultRow(Icons.skip_next, Colors.orange, 'Skipped (duplicates/empty)', skipCount),
              _buildResultRow(Icons.error, Colors.red, 'Errors', errorCount),
              if (errors.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Error Details:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Container(
                  height: 100,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: SingleChildScrollView(
                    child: Text(
                      errors.take(10).join('\n'),
                      style: TextStyle(fontSize: 12, color: Colors.red.shade700),
                    ),
                  ),
                ),
              ],
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  Widget _buildResultRow(IconData icon, Color color, String label, int count) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 8),
          Text(label),
          const Spacer(),
          Text(
            count.toString(),
            style: TextStyle(fontWeight: FontWeight.bold, color: color),
          ),
        ],
      ),
    );
  }
}
