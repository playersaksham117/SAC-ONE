import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/stock_entry_provider.dart';
import '../services/stock_search_service.dart';
import '../widgets/location_picker.dart';

class StockTransferScreen extends StatefulWidget {
  const StockTransferScreen({super.key});

  @override
  State<StockTransferScreen> createState() => _StockTransferScreenState();
}

class _StockTransferScreenState extends State<StockTransferScreen> {
  final _skuController = TextEditingController();
  final _quantityController = TextEditingController();

  String? _selectedItemId;
  String? _selectedItemName;
  String? _selectedItemUnit;
  double _availableQuantity = 0;

  // Source Location
  String? _sourceWarehouseId;
  String? _sourceZoneId;
  String? _sourceRackId;
  String? _sourceShelfId;
  String? _sourceBinId;

  // Destination Location
  String? _destWarehouseId;
  String? _destZoneId;
  String? _destRackId;
  String? _destShelfId;
  String? _destBinId;

  bool _isLoading = false;
  bool _isSubmitting = false;
  String? _errorMessage;
  String? _successMessage;

  @override
  void dispose() {
    _skuController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _searchItem(String sku) async {
    if (sku.isEmpty) {
      setState(() {
        _selectedItemId = null;
        _selectedItemName = null;
        _availableQuantity = 0;
      });
      return;
    }

    setState(() => _isLoading = true);

    try {
      final result = await StockSearchService.searchBySku(sku);
      if (result != null) {
        setState(() {
          _selectedItemId = result.itemId;
          _selectedItemName = result.itemName;
          _selectedItemUnit = result.unit;
          _availableQuantity = result.totalQuantity;
          _errorMessage = null;
        });
      } else {
        setState(() {
          _selectedItemId = null;
          _selectedItemName = null;
          _availableQuantity = 0;
          _errorMessage = 'SKU not found';
        });
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _swapLocations() {
    setState(() {
      // Swap source and destination
      final tempWarehouse = _sourceWarehouseId;
      final tempZone = _sourceZoneId;
      final tempRack = _sourceRackId;
      final tempShelf = _sourceShelfId;
      final tempBin = _sourceBinId;

      _sourceWarehouseId = _destWarehouseId;
      _sourceZoneId = _destZoneId;
      _sourceRackId = _destRackId;
      _sourceShelfId = _destShelfId;
      _sourceBinId = _destBinId;

      _destWarehouseId = tempWarehouse;
      _destZoneId = tempZone;
      _destRackId = tempRack;
      _destShelfId = tempShelf;
      _destBinId = tempBin;
    });
  }

  Future<void> _submitTransfer() async {
    if (_selectedItemId == null) {
      setState(() => _errorMessage = 'Please select an item');
      return;
    }

    if (_sourceWarehouseId == null) {
      setState(() => _errorMessage = 'Please select source warehouse');
      return;
    }

    if (_destWarehouseId == null) {
      setState(() => _errorMessage = 'Please select destination warehouse');
      return;
    }

    if (_quantityController.text.isEmpty) {
      setState(() => _errorMessage = 'Please enter quantity');
      return;
    }

    final quantity = double.tryParse(_quantityController.text);
    if (quantity == null || quantity <= 0) {
      setState(() => _errorMessage = 'Invalid quantity');
      return;
    }

    if (quantity > _availableQuantity) {
      setState(() => _errorMessage =
          'Cannot transfer more than available ($_availableQuantity)');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
      _successMessage = null;
    });

    try {
      final stockEntryProvider = context.read<StockEntryProvider>();
      
      // Create stock out transaction from source
      await stockEntryProvider.addStockEntry(
        itemId: _selectedItemId!,
        warehouseId: _sourceWarehouseId!,
        quantity: quantity,
        zoneId: _sourceZoneId ?? 'default-zone',
        rackId: _sourceRackId ?? 'default-rack',
        shelfId: _sourceShelfId ?? 'default-shelf',
        binId: _sourceBinId ?? 'default-bin',
      );

      // Create stock in transaction to destination
      await stockEntryProvider.addStockEntry(
        itemId: _selectedItemId!,
        warehouseId: _destWarehouseId!,
        quantity: quantity,
        zoneId: _destZoneId ?? 'default-zone',
        rackId: _destRackId ?? 'default-rack',
        shelfId: _destShelfId ?? 'default-shelf',
        binId: _destBinId ?? 'default-bin',
      );

      setState(() {
        _successMessage =
            'Successfully transferred $quantity $_selectedItemUnit from source to destination';
        _quantityController.clear();
        _skuController.clear();
        _selectedItemId = null;
        _selectedItemName = null;
        _availableQuantity = 0;
      });
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Transfer'),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Success Message
            if (_successMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  border: Border.all(color: Colors.green[300]!),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green[700], size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _successMessage!,
                        style: TextStyle(color: Colors.green[900]),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Error Message
            if (_errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  border: Border.all(color: Colors.red[300]!),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline, color: Colors.red[700], size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(color: Colors.red[900]),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Item Selection Card
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Select Item',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _skuController,
                      enabled: !_isLoading,
                      decoration: InputDecoration(
                        labelText: 'Search by SKU',
                        hintText: 'Enter SKU and press Enter',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onSubmitted: _searchItem,
                    ),
                    if (_isLoading) ...[
                      const SizedBox(height: 12),
                      const LinearProgressIndicator(),
                    ],
                    if (_selectedItemId != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.blue[50],
                          border: Border.all(color: Colors.blue[200]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _selectedItemName ?? 'Unknown',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'SKU: ${_skuController.text}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[700],
                                  ),
                                ),
                                Text(
                                  'Available: $_availableQuantity $_selectedItemUnit',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.green[700],
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Quantity Card
            if (_selectedItemId != null)
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Transfer Quantity',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _quantityController,
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(
                          labelText: 'Quantity to transfer',
                          suffixText: _selectedItemUnit,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            if (_selectedItemId != null) ...[
              const SizedBox(height: 24),

              // Transfer Locations
              Row(
                children: [
                  Expanded(
                    child: _buildLocationCard(
                      'Source Location',
                      _sourceWarehouseId,
                      (w, z, r, s, b) {
                        setState(() {
                          _sourceWarehouseId = w;
                          _sourceZoneId = z;
                          _sourceRackId = r;
                          _sourceShelfId = s;
                          _sourceBinId = b;
                        });
                      },
                      Colors.orange,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    children: [
                      const SizedBox(height: 24),
                      IconButton(
                        icon: const Icon(Icons.compare_arrows),
                        onPressed: _swapLocations,
                        tooltip: 'Swap locations',
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildLocationCard(
                      'Destination Location',
                      _destWarehouseId,
                      (w, z, r, s, b) {
                        setState(() {
                          _destWarehouseId = w;
                          _destZoneId = z;
                          _destRackId = r;
                          _destShelfId = s;
                          _destBinId = b;
                        });
                      },
                      Colors.green,
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Submit Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submitTransfer,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: Colors.blue,
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor:
                                AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'Execute Transfer',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildLocationCard(
    String title,
    String? selectedWarehouse,
    Function(String?, String?, String?, String?, String?) onLocationSelected,
    Color color,
  ) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Icon(Icons.location_on, color: color, size: 20),
                ),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            LocationPickerWidget(
              onLocationSelected: onLocationSelected,
              showBinLevel: true,
              showShelfLevel: true,
            ),
          ],
        ),
      ),
    );
  }
}
