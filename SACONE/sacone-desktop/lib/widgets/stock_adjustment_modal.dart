import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/inventory_item.dart';

/// Professional Stock Adjustment Modal
///
/// UX RATIONALE:
/// - Single modal reduces cognitive load vs separate add/reduce screens
/// - Toggle button provides clear visual state (destructive red for reduce)
/// - Large quantity input with numpad-friendly layout
/// - Mandatory reason dropdown prevents accidental adjustments
/// - Stock preview shows before/after values for validation
/// - Fixed footer buttons prevent scroll-related issues on desktop
///
/// WIDGET HIERARCHY:
/// StockAdjustmentModal (Dialog)
///   ├── Header (Title + Close)
///   ├── Content (Scrollable)
///   │   ├── Item Info Card
///   │   ├── Current Stock Display
///   │   ├── Action Toggle (Add/Reduce)
///   │   ├── Quantity Input (Large, prominent)
///   │   ├── Reason Dropdown (Required)
///   │   └── Stock Preview Card (Before → After)
///   └── Fixed Footer
///       ├── Cancel Button
///       └── Confirm Button (Disabled until valid)
class StockAdjustmentModal extends StatefulWidget {
  final InventoryItem item;
  final double currentStock;

  const StockAdjustmentModal({
    super.key,
    required this.item,
    required this.currentStock,
  });

  @override
  State<StockAdjustmentModal> createState() => _StockAdjustmentModalState();
}

class _StockAdjustmentModalState extends State<StockAdjustmentModal> {
  bool _isAddMode = true; // true = Add, false = Reduce
  final TextEditingController _quantityController = TextEditingController();
  String? _selectedReason;

  final List<String> _addReasons = [
    'Purchase Order',
    'Stock Return',
    'Production Complete',
    'Inventory Correction',
    'Opening Balance',
  ];

  final List<String> _reduceReasons = [
    'Sales Order',
    'Damaged Goods',
    'Expired Items',
    'Sample Distribution',
    'Inventory Correction',
    'Theft/Loss',
  ];

  double get _quantity => double.tryParse(_quantityController.text) ?? 0;
  double get _newStock => _isAddMode
      ? widget.currentStock + _quantity
      : widget.currentStock - _quantity;

  bool get _isValid =>
      _quantity > 0 &&
      _selectedReason != null &&
      (_isAddMode || _quantity <= widget.currentStock);

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _handleConfirm() {
    if (!_isValid) return;

    // final provider = Provider.of<InventoryProvider>(context, listen: false);

    // Create transaction record
    final transactionType = _isAddMode ? 'purchase' : 'sale';

    // TODO: Call provider method to record transaction
    // provider.addTransaction(
    //   itemId: widget.item.id,
    //   type: transactionType,
    //   quantity: _quantity,
    //   reason: _selectedReason!,
    // );

    Navigator.of(context).pop({
      'success': true,
      'type': transactionType,
      'quantity': _quantity,
      'reason': _selectedReason,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: 560,
        constraints: const BoxConstraints(maxHeight: 720),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            _buildHeader(),

            // Content (Scrollable)
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildItemInfo(),
                    const SizedBox(height: 24),
                    _buildCurrentStock(),
                    const SizedBox(height: 32),
                    _buildActionToggle(),
                    const SizedBox(height: 24),
                    _buildQuantityInput(),
                    const SizedBox(height: 24),
                    _buildReasonDropdown(),
                    const SizedBox(height: 32),
                    _buildStockPreview(),
                  ],
                ),
              ),
            ),

            // Fixed Footer
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
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
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.inventory_2_outlined,
              color: Color(0xFF3B82F6),
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          const Text(
            'Stock Adjustment',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Color(0xFF0F172A),
            ),
          ),
          const Spacer(),
          IconButton(
            icon: Icon(Icons.close, color: Colors.grey.shade600),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  Widget _buildItemInfo() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.item.name,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildInfoChip('SKU: ${widget.item.sku}'),
              _buildInfoChip('Category: ${widget.item.category}'),
              if (widget.item.brand != null && widget.item.brand!.isNotEmpty)
                _buildInfoChip('Brand: ${widget.item.brand}'),
              if (widget.item.hsn != null && widget.item.hsn!.isNotEmpty)
                _buildInfoChip('HSN: ${widget.item.hsn}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInfoChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          color: Colors.grey.shade700,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildCurrentStock() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          'Current Stock:',
          style: TextStyle(
            fontSize: 16,
            color: Colors.grey.shade600,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 12),
        Text(
          '${widget.currentStock.toInt()} ${widget.item.unit}',
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            color: Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }

  Widget _buildActionToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildToggleButton(
              label: 'Add Stock',
              icon: Icons.add_circle_outline,
              isSelected: _isAddMode,
              color: const Color(0xFF10B981),
              onTap: () {
                setState(() {
                  _isAddMode = true;
                  _selectedReason = null;
                });
              },
            ),
          ),
          Expanded(
            child: _buildToggleButton(
              label: 'Reduce Stock',
              icon: Icons.remove_circle_outline,
              isSelected: !_isAddMode,
              color: const Color(0xFFEF4444),
              onTap: () {
                setState(() {
                  _isAddMode = false;
                  _selectedReason = null;
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleButton({
    required String label,
    required IconData icon,
    required bool isSelected,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: isSelected ? color : Colors.grey.shade500,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: isSelected ? color : Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuantityInput() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quantity',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade700,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _quantityController,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
          ],
          style: const TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.w700,
            color: Color(0xFF0F172A),
          ),
          textAlign: TextAlign.center,
          decoration: InputDecoration(
            hintText: '0',
            hintStyle: TextStyle(
              color: Colors.grey.shade300,
              fontSize: 36,
              fontWeight: FontWeight.w700,
            ),
            suffixText: widget.item.unit,
            suffixStyle: TextStyle(
              fontSize: 18,
              color: Colors.grey.shade500,
              fontWeight: FontWeight.w500,
            ),
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 2),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFEF4444), width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 24),
            errorText: !_isAddMode && _quantity > widget.currentStock
                ? 'Cannot reduce more than current stock'
                : null,
          ),
          onChanged: (value) => setState(() {}),
        ),
      ],
    );
  }

  Widget _buildReasonDropdown() {
    final reasons = _isAddMode ? _addReasons : _reduceReasons;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Reason',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(width: 4),
            const Text(
              '*',
              style: TextStyle(
                color: Color(0xFFEF4444),
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _selectedReason,
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 2),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          ),
          hint: Text(
            'Select a reason',
            style: TextStyle(color: Colors.grey.shade400),
          ),
          items: reasons.map((reason) {
            return DropdownMenuItem(
              value: reason,
              child: Text(
                reason,
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFF0F172A),
                ),
              ),
            );
          }).toList(),
          onChanged: (value) => setState(() => _selectedReason = value),
        ),
      ],
    );
  }

  Widget _buildStockPreview() {
    if (_quantity == 0) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            (_isAddMode ? const Color(0xFF10B981) : const Color(0xFFEF4444))
                .withValues(alpha: 0.1),
            (_isAddMode ? const Color(0xFF10B981) : const Color(0xFFEF4444))
                .withValues(alpha: 0.05),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color:
              (_isAddMode ? const Color(0xFF10B981) : const Color(0xFFEF4444))
                  .withValues(alpha: 0.3),
          width: 2,
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(
                Icons.preview,
                color: _isAddMode
                    ? const Color(0xFF10B981)
                    : const Color(0xFFEF4444),
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                'Stock Preview',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildPreviewValue(
                label: 'Current',
                value: widget.currentStock.toInt().toString(),
                unit: widget.item.unit,
              ),
              Icon(
                _isAddMode ? Icons.arrow_forward : Icons.arrow_forward,
                color: _isAddMode
                    ? const Color(0xFF10B981)
                    : const Color(0xFFEF4444),
                size: 32,
              ),
              _buildPreviewValue(
                label: 'After',
                value: _newStock.toInt().toString(),
                unit: widget.item.unit,
                isHighlight: true,
              ),
            ],
          ),
          if (_newStock <= widget.item.minStockLevel) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: Color(0xFFF59E0B),
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Warning: Stock will be below minimum level (${widget.item.minStockLevel.toInt()} ${widget.item.unit})',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFFF59E0B),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPreviewValue({
    required String label,
    required String value,
    required String unit,
    bool isHighlight = false,
  }) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: value,
                style: TextStyle(
                  fontSize: isHighlight ? 32 : 24,
                  fontWeight: FontWeight.w700,
                  color: isHighlight
                      ? (_isAddMode
                          ? const Color(0xFF10B981)
                          : const Color(0xFFEF4444))
                      : const Color(0xFF0F172A),
                ),
              ),
              TextSpan(
                text: ' $unit',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFooter() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Colors.grey.shade200),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                side: BorderSide(color: Colors.grey.shade300, width: 2),
              ),
              child: Text(
                'Cancel',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: _isValid ? _handleConfirm : null,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                backgroundColor: _isAddMode
                    ? const Color(0xFF10B981)
                    : const Color(0xFFEF4444),
                disabledBackgroundColor: Colors.grey.shade300,
                elevation: 0,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _isAddMode ? Icons.add_circle : Icons.remove_circle,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _isAddMode ? 'Confirm Add' : 'Confirm Reduce',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
