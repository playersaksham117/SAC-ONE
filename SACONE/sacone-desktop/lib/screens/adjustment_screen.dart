import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/adjustment_provider.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/auth_provider.dart';
import '../models/stock_adjustment.dart';
import '../models/batch_info.dart';

class AdjustmentScreen extends StatefulWidget {
  const AdjustmentScreen({super.key});

  @override
  State<AdjustmentScreen> createState() => _AdjustmentScreenState();
}

class _AdjustmentScreenState extends State<AdjustmentScreen> {
  late AdjustmentProvider _adjustmentProvider;

  @override
  void initState() {
    super.initState();
    _adjustmentProvider = Provider.of<AdjustmentProvider>(context, listen: false);
    _loadData();
  }

  Future<void> _loadData() async {
    final inv = Provider.of<InventoryProvider>(context, listen: false);
    final wh = Provider.of<WarehouseProvider>(context, listen: false);
    await inv.loadInventoryItems();
    await wh.loadWarehouses();
    await _adjustmentProvider.loadAdjustments();
    await _adjustmentProvider.loadAllBatches();
    await _adjustmentProvider.loadNearingExpiryBatches();
    await _adjustmentProvider.loadExpiredBatches();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Stock Adjustments & Batch Management'),
          elevation: 0,
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Adjustments'),
              Tab(text: 'Cell Correction'),
              Tab(text: 'Batch Tracking'),
              Tab(text: 'Expiry Management'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildAdjustmentsTab(),
            _buildCellCorrectionTab(),
            _buildBatchTrackingTab(),
            _buildExpiryManagementTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildAdjustmentsTab() {
    return Consumer<AdjustmentProvider>(
      builder: (context, provider, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showCreateAdjustmentDialog(context),
                      icon: const Icon(Icons.add),
                      label: const Text('New Adjustment'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton.icon(
                    onPressed: _loadData,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Refresh'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey.shade200,
                      foregroundColor: Colors.black87,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: provider.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : provider.error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.error_outline,
                                  size: 48, color: Colors.red.shade400),
                              const SizedBox(height: 16),
                              Text(provider.error!),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: _loadData,
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        )
                      : provider.adjustments.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.inbox,
                                      size: 48, color: Colors.grey.shade400),
                                  const SizedBox(height: 16),
                                  Text(
                                    'No adjustments found',
                                    style: TextStyle(
                                        color: Colors.grey.shade600,
                                        fontSize: 16),
                                  ),
                                  const SizedBox(height: 16),
                                  ElevatedButton.icon(
                                    onPressed: () =>
                                        _showCreateAdjustmentDialog(context),
                                    icon: const Icon(Icons.add),
                                    label: const Text('Create First Adjustment'),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: provider.adjustments.length,
                              itemBuilder: (context, index) {
                                final adjustment = provider.adjustments[index];
                                return _buildAdjustmentCard(adjustment);
                              },
                            ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildAdjustmentCard(StockAdjustment adjustment) {
    final statusColor = adjustment.status == AdjustmentStatus.approved
        ? Colors.green
        : adjustment.status == AdjustmentStatus.rejected
            ? Colors.red
            : Colors.orange;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        adjustment.itemName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'SKU: ${adjustment.itemSku}',
                        style:
                            TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                Chip(
                  label: Text(adjustment.status.label),
                  backgroundColor: statusColor.withValues(alpha: 0.2),
                  labelStyle: TextStyle(color: statusColor),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Type: ${adjustment.adjustmentType.label}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Warehouse: ${adjustment.warehouseName}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      if (adjustment.cellName != null && adjustment.cellName!.isNotEmpty)
                        Text(
                          'Cell: ${adjustment.cellName}',
                          style: TextStyle(fontSize: 12, color: Colors.blue.shade700),
                        ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'Qty: ${adjustment.quantityBefore} → ${adjustment.quantityAfter}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: adjustment.quantityAdjusted > 0
                              ? Colors.green
                              : Colors.red,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        adjustment.createdAt.toString().split('.')[0],
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Reason: ${adjustment.reason}',
              style: const TextStyle(fontSize: 12),
            ),
            if (adjustment.notes != null && adjustment.notes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Notes: ${adjustment.notes}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
            if (adjustment.status == AdjustmentStatus.pending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _approveAdjustment(adjustment.id),
                      icon: const Icon(Icons.check),
                      label: const Text('Approve'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _rejectAdjustment(adjustment.id),
                      icon: const Icon(Icons.close),
                      label: const Text('Reject'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCellCorrectionTab() {
    return const _CellCorrectionTab();
  }

  Widget _buildBatchTrackingTab() {
    return Consumer<AdjustmentProvider>(
      builder: (context, provider, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton.icon(
                onPressed: () => _showCreateBatchDialog(context),
                icon: const Icon(Icons.add),
                label: const Text('New Batch'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                ),
              ),
            ),
            Expanded(
              child: provider.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : provider.batches.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.inventory_2_outlined,
                                  size: 48, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text(
                                'No batches found',
                                style: TextStyle(
                                    color: Colors.grey.shade600, fontSize: 16),
                              ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: provider.batches.length,
                          itemBuilder: (context, index) {
                            final batch = provider.batches[index];
                            return _buildBatchCard(batch);
                          },
                        ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBatchCard(BatchInfo batch) {
    final Color statusColor;
    final String statusLabel;

    if (batch.isExpired) {
      statusColor = Colors.red;
      statusLabel = 'Expired';
    } else if (batch.isNearingExpiry) {
      statusColor = Colors.orange;
      statusLabel = 'Nearing Expiry (${batch.daysUntilExpiry} days)';
    } else {
      statusColor = Colors.green;
      statusLabel = 'Valid';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Batch: ${batch.batchNumber}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Item ID: ${batch.itemId}',
                        style:
                            TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                Chip(
                  label: Text(statusLabel),
                  backgroundColor: statusColor.withValues(alpha: 0.2),
                  labelStyle: TextStyle(color: statusColor),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Quantity: ${batch.quantity}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Cost: ₹${batch.costPrice.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      if (batch.manufacturingDate != null)
                        Text(
                          'Mfg: ${batch.manufacturingDate.toString().split(' ')[0]}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      if (batch.expiryDate != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Exp: ${batch.expiryDate.toString().split(' ')[0]}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: statusColor,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExpiryManagementTab() {
    return Consumer<AdjustmentProvider>(
      builder: (context, provider, _) {
        final expiredCount = provider.expiredBatches.length;
        final nearingCount = provider.nearingExpiryBatches.length;

        return SingleChildScrollView(
          child: Column(
            children: [
              if (expiredCount > 0 || nearingCount > 0)
                Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade300),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Icon(Icons.warning, color: Colors.orange.shade700),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (expiredCount > 0)
                                  Text(
                                    '$expiredCount Expired Batches',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.red.shade700,
                                    ),
                                  ),
                                if (expiredCount > 0 && nearingCount > 0)
                                  const SizedBox(height: 4),
                                if (nearingCount > 0)
                                  Text(
                                    '$nearingCount Nearing Expiry',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.orange.shade700,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              if (provider.isLoading)
                const Center(child: CircularProgressIndicator())
              else if (expiredCount == 0 && nearingCount == 0)
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 48),
                      Icon(Icons.check_circle,
                          size: 48, color: Colors.green.shade400),
                      const SizedBox(height: 16),
                      Text(
                        'All batches are within expiry',
                        style: TextStyle(
                            color: Colors.grey.shade600, fontSize: 16),
                      ),
                    ],
                  ),
                )
              else ...[
                if (expiredCount > 0) ...[
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Expired Batches',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        ...provider.expiredBatches.map((batch) =>
                            _buildExpiryBatchCard(batch, isExpired: true)),
                      ],
                    ),
                  ),
                ],
                if (nearingCount > 0) ...[
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Nearing Expiry (Next 30 Days)',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        ...provider.nearingExpiryBatches.map((batch) =>
                            _buildExpiryBatchCard(batch, isExpired: false)),
                      ],
                    ),
                  ),
                ],
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildExpiryBatchCard(BatchInfo batch, {required bool isExpired}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              batch.batchNumber,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Expiry: ${batch.expiryDate.toString().split(' ')[0]}',
                    style: TextStyle(
                      fontSize: 12,
                      color: isExpired ? Colors.red : Colors.orange,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Expanded(
                  child: Text(
                    'Qty: ${batch.quantity}',
                    style: const TextStyle(fontSize: 12),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCreateAdjustmentDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const _CreateAdjustmentDialog(),
    );
  }

  void _showCreateBatchDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const _CreateBatchDialog(),
    );
  }

  Future<void> _approveAdjustment(String id) async {
    final adjustmentProvider =
        Provider.of<AdjustmentProvider>(context, listen: false);
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final inv = Provider.of<InventoryProvider>(context, listen: false);
    final result = await adjustmentProvider.approveAdjustment(
      id,
      auth.userId.isNotEmpty ? auth.userId : 'admin',
    );

    if (result) {
      await inv.loadInventoryItems();
      await inv.loadStocks();
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result ? 'Adjustment approved and stock updated' : adjustmentProvider.error ?? 'Failed to approve'),
          backgroundColor: result ? Colors.green : Colors.red,
        ),
      );
    }
  }

  Future<void> _rejectAdjustment(String id) async {
    final adjustmentProvider =
        Provider.of<AdjustmentProvider>(context, listen: false);
    final result = await adjustmentProvider.rejectAdjustment(id);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result ? 'Adjustment rejected' : 'Failed to reject'),
          backgroundColor: result ? Colors.orange : Colors.red,
        ),
      );
    }
  }
}

class _CreateAdjustmentDialog extends StatefulWidget {
  const _CreateAdjustmentDialog();

  @override
  State<_CreateAdjustmentDialog> createState() =>
      _CreateAdjustmentDialogState();
}

class _CreateAdjustmentDialogState extends State<_CreateAdjustmentDialog> {
  late TextEditingController _reasonController;
  late TextEditingController _quantityController;
  late TextEditingController _notesController;
  AdjustmentType? _selectedType;
  String? _selectedItemId;
  String? _selectedWarehouseId;
  String? _selectedCellId;
  List<Map<String, dynamic>> _cells = [];
  double _currentStock = 0;
  bool _loadingStock = false;

  @override
  void initState() {
    super.initState();
    _reasonController = TextEditingController();
    _quantityController = TextEditingController();
    _notesController = TextEditingController();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _quantityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600),
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Create Stock Adjustment',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              Consumer2<InventoryProvider, WarehouseProvider>(
                builder: (context, invProvider, whProvider, _) {
                  return Column(
                    children: [
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: 'Warehouse',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedWarehouseId,
                        items: whProvider.warehouses
                            .map((wh) => DropdownMenuItem(
                                  value: wh.id,
                                  child: Text(wh.name),
                                ))
                            .toList(),
                        onChanged: (value) async {
                          setState(() {
                            _selectedWarehouseId = value;
                            _selectedCellId = null;
                            _cells = [];
                          });
                          if (value != null) await _loadCells(value);
                          await _refreshStock();
                        },
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: 'Cell (optional — for cell-level adjustment)',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedCellId,
                        items: [
                          const DropdownMenuItem(value: null, child: Text('Warehouse total (no cell)')),
                          ..._cells.map((c) => DropdownMenuItem(
                                value: c['id'] as String,
                                child: Text('${c['code']} — ${c['name']}'),
                              )),
                        ],
                        onChanged: (value) async {
                          setState(() => _selectedCellId = value);
                          await _refreshStock();
                        },
                      ),
                      if (_loadingStock)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: LinearProgressIndicator(),
                        )
                      else if (_selectedItemId != null && _selectedWarehouseId != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            'Current stock: $_currentStock',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: Colors.blue.shade700,
                            ),
                          ),
                        ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: 'Item',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedItemId,
                        items: invProvider.items
                            .map((item) => DropdownMenuItem(
                                  value: item.id,
                                  child: Text(item.name),
                                ))
                            .toList(),
                        onChanged: (value) async {
                          setState(() => _selectedItemId = value);
                          await _refreshStock();
                        },
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<AdjustmentType>(
                        decoration: InputDecoration(
                          labelText: 'Adjustment Type',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedType,
                        items: AdjustmentType.values
                            .map((type) => DropdownMenuItem(
                                  value: type,
                                  child: Text(type.label),
                                ))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _selectedType = value),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _quantityController,
                        decoration: InputDecoration(
                          labelText: 'Adjustment Quantity',
                          hintText: 'Enter positive or negative quantity',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _reasonController,
                        decoration: InputDecoration(
                          labelText: 'Reason',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        maxLines: 3,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _notesController,
                        decoration: InputDecoration(
                          labelText: 'Notes (Optional)',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          ElevatedButton(
                            onPressed: () => Navigator.pop(context),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.grey.shade200,
                              foregroundColor: Colors.black87,
                            ),
                            child: const Text('Cancel'),
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton(
                            onPressed: _selectedType != null &&
                                    _selectedItemId != null &&
                                    _selectedWarehouseId != null &&
                                    _quantityController.text.isNotEmpty &&
                                    _reasonController.text.isNotEmpty
                                ? _createAdjustment
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2563EB),
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Create'),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _loadCells(String warehouseId) async {
    final provider = Provider.of<AdjustmentProvider>(context, listen: false);
    final cells = await provider.getCellsForWarehouse(warehouseId);
    if (mounted) setState(() => _cells = cells);
  }

  Future<void> _refreshStock() async {
    if (_selectedItemId == null || _selectedWarehouseId == null) return;
    setState(() => _loadingStock = true);
    final provider = Provider.of<AdjustmentProvider>(context, listen: false);
    final qty = await provider.getStockQuantity(
      _selectedItemId!,
      _selectedWarehouseId!,
      cellId: _selectedCellId,
    );
    if (mounted) {
      setState(() {
        _currentStock = qty;
        _loadingStock = false;
      });
    }
  }

  Future<void> _createAdjustment() async {
    final adjustmentProvider =
        Provider.of<AdjustmentProvider>(context, listen: false);
    final inventoryProvider =
        Provider.of<InventoryProvider>(context, listen: false);
    final warehouseProvider =
        Provider.of<WarehouseProvider>(context, listen: false);
    final auth = Provider.of<AuthProvider>(context, listen: false);

    final item = inventoryProvider.items
        .firstWhere((item) => item.id == _selectedItemId);
    final warehouse = warehouseProvider.warehouses
        .firstWhere((wh) => wh.id == _selectedWarehouseId);

    String? cellName;
    if (_selectedCellId != null) {
      final cell = _cells.firstWhere((c) => c['id'] == _selectedCellId);
      cellName = '${cell['code']} — ${cell['name']}';
    }

    final adjustedQty = double.parse(_quantityController.text);
    await _refreshStock();

    final result = await adjustmentProvider.createAdjustment(
      itemId: _selectedItemId!,
      itemName: item.name,
      itemSku: item.sku,
      warehouseId: _selectedWarehouseId!,
      warehouseName: warehouse.name,
      cellId: _selectedCellId,
      cellName: cellName,
      quantityBefore: _currentStock,
      quantityAdjusted: adjustedQty,
      adjustmentType: _selectedType!,
      reason: _reasonController.text,
      notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      createdBy: auth.userId.isNotEmpty ? auth.userId : 'admin',
    );

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result != null ? 'Adjustment created' : 'Failed to create'),
          backgroundColor: result != null ? Colors.green : Colors.red,
        ),
      );
    }
  }
}

class _CreateBatchDialog extends StatefulWidget {
  const _CreateBatchDialog();

  @override
  State<_CreateBatchDialog> createState() => _CreateBatchDialogState();
}

class _CreateBatchDialogState extends State<_CreateBatchDialog> {
  late TextEditingController _batchNumberController;
  late TextEditingController _quantityController;
  late TextEditingController _costPriceController;
  DateTime? _manufacturingDate;
  DateTime? _expiryDate;
  String? _selectedItemId;
  String? _selectedWarehouseId;

  @override
  void initState() {
    super.initState();
    _batchNumberController = TextEditingController();
    _quantityController = TextEditingController();
    _costPriceController = TextEditingController();
  }

  @override
  void dispose() {
    _batchNumberController.dispose();
    _quantityController.dispose();
    _costPriceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600),
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Create New Batch',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              Consumer2<InventoryProvider, WarehouseProvider>(
                builder: (context, invProvider, whProvider, _) {
                  return Column(
                    children: [
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: 'Item',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedItemId,
                        items: invProvider.items
                            .map((item) => DropdownMenuItem(
                                  value: item.id,
                                  child: Text(item.name),
                                ))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _selectedItemId = value),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _batchNumberController,
                        decoration: InputDecoration(
                          labelText: 'Batch Number',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: 'Warehouse',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        initialValue: _selectedWarehouseId,
                        items: whProvider.warehouses
                            .map((wh) => DropdownMenuItem(
                                  value: wh.id,
                                  child: Text(wh.name),
                                ))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _selectedWarehouseId = value),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _quantityController,
                        decoration: InputDecoration(
                          labelText: 'Quantity',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _costPriceController,
                        decoration: InputDecoration(
                          labelText: 'Cost Price',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 16),
                      InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: DateTime.now(),
                            firstDate: DateTime.now().subtract(
                              const Duration(days: 365),
                            ),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setState(() => _manufacturingDate = date);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today, size: 20),
                              const SizedBox(width: 12),
                              Text(
                                _manufacturingDate == null
                                    ? 'Manufacturing Date (Optional)'
                                    : _manufacturingDate.toString().split(' ')[0],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate:
                                DateTime.now().add(const Duration(days: 30)),
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(
                              const Duration(days: 1095),
                            ),
                          );
                          if (date != null) {
                            setState(() => _expiryDate = date);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today, size: 20),
                              const SizedBox(width: 12),
                              Text(
                                _expiryDate == null
                                    ? 'Expiry Date (Optional)'
                                    : _expiryDate.toString().split(' ')[0],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          ElevatedButton(
                            onPressed: () => Navigator.pop(context),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.grey.shade200,
                              foregroundColor: Colors.black87,
                            ),
                            child: const Text('Cancel'),
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton(
                            onPressed: _selectedItemId != null &&
                                    _selectedWarehouseId != null &&
                                    _batchNumberController.text.isNotEmpty &&
                                    _quantityController.text.isNotEmpty &&
                                    _costPriceController.text.isNotEmpty
                                ? _createBatch
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2563EB),
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Create'),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _createBatch() async {
    final adjustmentProvider =
        Provider.of<AdjustmentProvider>(context, listen: false);

    final result = await adjustmentProvider.createBatch(
      itemId: _selectedItemId!,
      batchNumber: _batchNumberController.text,
      manufacturingDate: _manufacturingDate,
      expiryDate: _expiryDate,
      quantity: double.parse(_quantityController.text),
      costPrice: double.parse(_costPriceController.text),
      warehouseId: _selectedWarehouseId!,
    );

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result != null ? 'Batch created' : 'Failed to create'),
          backgroundColor: result != null ? Colors.green : Colors.red,
        ),
      );
    }
  }
}

/// Cell-level stock correction — set exact quantity per cell.
class _CellCorrectionTab extends StatefulWidget {
  const _CellCorrectionTab();

  @override
  State<_CellCorrectionTab> createState() => _CellCorrectionTabState();
}

class _CellCorrectionTabState extends State<_CellCorrectionTab> {
  String? _warehouseId;
  String? _cellId;
  List<Map<String, dynamic>> _cells = [];
  List<Map<String, dynamic>> _cellStock = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initWarehouse());
  }

  Future<void> _initWarehouse() async {
    final wh = Provider.of<WarehouseProvider>(context, listen: false);
    await wh.loadWarehouses();
    if (wh.warehouses.isNotEmpty && mounted) {
      setState(() => _warehouseId = wh.warehouses.first.id);
      await _loadCellsAndStock();
    }
  }

  Future<void> _loadCellsAndStock() async {
    if (_warehouseId == null) return;
    setState(() => _loading = true);
    final adj = Provider.of<AdjustmentProvider>(context, listen: false);
    _cells = await adj.getCellsForWarehouse(_warehouseId!);
    _cellStock = await adj.getCellStockRows(_warehouseId!, cellId: _cellId);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _showCorrectDialog(Map<String, dynamic> row) async {
    final targetController = TextEditingController(
      text: ((row['quantity'] as num?)?.toDouble() ?? 0).toStringAsFixed(0),
    );
    final reasonController = TextEditingController(text: 'Physical count correction');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Correct: ${row['itemName']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Cell: ${row['cellName'] ?? row['cellCode'] ?? '—'}'),
            Text('Current: ${row['quantity']}'),
            const SizedBox(height: 12),
            TextField(
              controller: targetController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Correct quantity',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apply')),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final adj = Provider.of<AdjustmentProvider>(context, listen: false);
    final wh = Provider.of<WarehouseProvider>(context, listen: false);
    final inv = Provider.of<InventoryProvider>(context, listen: false);
    final auth = Provider.of<AuthProvider>(context, listen: false);

    final warehouse = wh.warehouses.firstWhere((w) => w.id == _warehouseId);
    final cellId = row['cellId'] as String? ?? _cellId;
    if (cellId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cell ID missing for this stock row')),
      );
      return;
    }

    final cell = _cells.firstWhere(
      (c) => c['id'] == cellId,
      orElse: () => {'code': row['cellCode'], 'name': row['cellName'] ?? 'Cell'},
    );

    final result = await adj.correctCellStock(
      itemId: row['itemId'] as String,
      itemName: row['itemName'] as String,
      itemSku: row['itemSku'] as String? ?? '',
      warehouseId: _warehouseId!,
      warehouseName: warehouse.name,
      cellId: cellId,
      cellName: '${cell['code']} — ${cell['name']}',
      targetQuantity: double.parse(targetController.text),
      reason: reasonController.text,
      createdBy: auth.userId.isNotEmpty ? auth.userId : 'admin',
    );

    if (result != null) {
      await inv.loadInventoryItems();
      await inv.loadStocks();
      await _loadCellsAndStock();
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result != null ? 'Cell stock corrected' : adj.error ?? 'Failed'),
          backgroundColor: result != null ? Colors.green : Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<WarehouseProvider, AdjustmentProvider>(
      builder: (context, whProvider, adjProvider, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      decoration: const InputDecoration(
                        labelText: 'Warehouse',
                        border: OutlineInputBorder(),
                      ),
                      initialValue: _warehouseId,
                      items: whProvider.warehouses
                          .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                          .toList(),
                      onChanged: (v) async {
                        setState(() {
                          _warehouseId = v;
                          _cellId = null;
                        });
                        await _loadCellsAndStock();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      decoration: const InputDecoration(
                        labelText: 'Filter by cell',
                        border: OutlineInputBorder(),
                      ),
                      initialValue: _cellId,
                      items: [
                        const DropdownMenuItem(value: null, child: Text('All cells')),
                        ..._cells.map((c) => DropdownMenuItem(
                              value: c['id'] as String,
                              child: Text('${c['code']} — ${c['name']}'),
                            )),
                      ],
                      onChanged: (v) async {
                        setState(() => _cellId = v);
                        await _loadCellsAndStock();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  IconButton(
                    onPressed: _loadCellsAndStock,
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _cellStock.isEmpty
                      ? Center(
                          child: Text(
                            _cells.isEmpty
                                ? 'No cells defined for this warehouse.\nAdd cells in Warehouses screen first.'
                                : 'No stock in selected cell(s)',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey.shade600),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _cellStock.length,
                          itemBuilder: (context, index) {
                            final row = _cellStock[index];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                title: Text(row['itemName'] as String? ?? ''),
                                subtitle: Text(
                                  'SKU: ${row['itemSku']} • Cell: ${row['cellName'] ?? row['cellCode'] ?? '—'}',
                                ),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Qty: ${(row['quantity'] as num?)?.toStringAsFixed(0) ?? '0'}',
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    ),
                                    const SizedBox(width: 8),
                                    FilledButton.tonal(
                                      onPressed: () => _showCorrectDialog(row),
                                      child: const Text('Correct'),
                                    ),
                                  ],
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
}
