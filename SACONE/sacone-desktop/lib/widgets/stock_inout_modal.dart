import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/stock_entry_provider.dart';
import 'location_picker.dart';

class StockInOutModal extends StatefulWidget {
  final String itemId;
  final String itemName;
  final String itemUnit;
  final bool isStockIn;
  final VoidCallback onSuccess;

  const StockInOutModal({
    super.key,
    required this.itemId,
    required this.itemName,
    required this.itemUnit,
    required this.isStockIn,
    required this.onSuccess,
  });

  @override
  State<StockInOutModal> createState() => _StockInOutModalState();
}

class _StockInOutModalState extends State<StockInOutModal> {
  final _quantityController = TextEditingController();
  final _batchController = TextEditingController();
  final _referenceController = TextEditingController();
  final _notesController = TextEditingController();
  
  DateTime? _selectedExpiryDate;
  String? _selectedWarehouseId;
  String? _selectedZoneId;
  String? _selectedRackId;
  String? _selectedShelfId;
  String? _selectedBinId;
  bool _isSubmitting = false;
  String? _errorMessage;
  final double _availableQuantity = 0;

  @override
  void dispose() {
    _quantityController.dispose();
    _batchController.dispose();
    _referenceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _selectExpiryDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 365)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 1825)),
    );
    if (picked != null) {
      setState(() {
        _selectedExpiryDate = picked;
      });
    }
  }
  Future<void> _submitTransaction() async {
    if (_selectedWarehouseId == null) {
      setState(() => _errorMessage = 'Please select a warehouse');
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

    if (!widget.isStockIn && quantity > _availableQuantity) {
      setState(() => _errorMessage =
          'Cannot stock out more than available quantity ($_availableQuantity)');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final stockEntryProvider = context.read<StockEntryProvider>();
      
      await stockEntryProvider.addStockEntry(
        itemId: widget.itemId,
        warehouseId: _selectedWarehouseId!,
        zoneId: _selectedZoneId ?? 'default-zone',
        rackId: _selectedRackId ?? 'default-rack',
        shelfId: _selectedShelfId ?? 'default-shelf',
        binId: _selectedBinId ?? 'default-bin',
        quantity: quantity,
        batchNumber: _batchController.text.isNotEmpty ? _batchController.text : null,
        expiryDate: _selectedExpiryDate,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isStockIn
                ? 'Stock added successfully'
                : 'Stock removed successfully'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onSuccess();
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: SizedBox(
        width: 500,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: widget.isStockIn ? Colors.green[50] : Colors.red[50],
                  border: Border(
                    bottom: BorderSide(
                      color:
                          widget.isStockIn ? Colors.green[200]! : Colors.red[200]!,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          widget.isStockIn
                              ? Icons.add_circle_outline
                              : Icons.remove_circle_outline,
                          color: widget.isStockIn ? Colors.green : Colors.red,
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.isStockIn ? 'Stock In' : 'Stock Out',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                widget.itemName,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey[700],
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Body
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Error Message
                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red[50],
                          border: Border.all(color: Colors.red[300]!),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.error_outline, color: Colors.red[700], size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: TextStyle(color: Colors.red[900], fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Location Picker
                    LocationPickerWidget(
                      onLocationSelected:
                          (warehouse, zone, rack, shelf, bin) {
                        setState(() {
                          _selectedWarehouseId = warehouse;
                          _selectedZoneId = zone;
                          _selectedRackId = rack;
                          _selectedShelfId = shelf;
                          _selectedBinId = bin;
                        });
                      },
                      showBinLevel: true,
                      showShelfLevel: true,
                    ),

                    const SizedBox(height: 20),

                    // Quantity Field
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Quantity (${widget.itemUnit}) *',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _quantityController,
                          keyboardType:
                              const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            hintText: 'Enter quantity',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                            suffixText: widget.itemUnit,
                          ),
                        ),
                        if (!widget.isStockIn && _availableQuantity > 0) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Available: $_availableQuantity ${widget.itemUnit}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green[700],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Batch Number (Stock In only)
                    if (widget.isStockIn) ...[
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Batch Number',
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _batchController,
                            decoration: InputDecoration(
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              hintText: 'e.g., LOT-2024-001',
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Expiry Date (Stock In only)
                    if (widget.isStockIn) ...[
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Expiry Date',
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: _selectExpiryDate,
                            child: InputDecorator(
                              decoration: InputDecoration(
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 12,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _selectedExpiryDate == null
                                        ? 'Select expiry date'
                                        : DateFormat('dd-MMM-yyyy')
                                            .format(_selectedExpiryDate!),
                                    style: TextStyle(
                                      color: _selectedExpiryDate == null
                                          ? Colors.grey
                                          : Colors.black,
                                    ),
                                  ),
                                  const Icon(Icons.calendar_today, size: 18),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Reference Number
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Reference Number',
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _referenceController,
                          decoration: InputDecoration(
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            hintText: 'PO, SO, or invoice number',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Notes
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notes',
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _notesController,
                          maxLines: 2,
                          decoration: InputDecoration(
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            hintText: 'Add any notes...',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Action Buttons
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _isSubmitting
                                ? null
                                : () => Navigator.pop(context),
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _isSubmitting ? null : _submitTransaction,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: widget.isStockIn
                                  ? Colors.green
                                  : Colors.red,
                            ),
                            child: _isSubmitting
                                ? const SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        Colors.white,
                                      ),
                                    ),
                                  )
                                : Text(
                                    widget.isStockIn ? 'Stock In' : 'Stock Out',
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
