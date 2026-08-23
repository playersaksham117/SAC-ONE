/// ============================================================
/// MOVEMENTS SCREEN - Stock movement history
/// ============================================================
/// 
/// View and filter stock movement history.
/// Detailed audit trail of all operations.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import '../domain/entities/stock_movement.dart';

class MovementsScreen extends StatefulWidget {
  const MovementsScreen({super.key});

  @override
  State<MovementsScreen> createState() => _MovementsScreenState();
}

class _MovementsScreenState extends State<MovementsScreen> {
  DateTime? _startDate;
  DateTime? _endDate;
  MovementType? _typeFilter;
  String _searchQuery = '';
  
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Default to last 7 days
    _endDate = DateTime.now();
    _startDate = _endDate!.subtract(const Duration(days: 7));
    
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMovements();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMovements() async {
    final stock = context.read<StockProvider>();
    await stock.loadMovements(
      startDate: _startDate,
      endDate: _endDate,
      type: _typeFilter,
    );
  }

  Future<void> _selectDateRange() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
    );
    
    if (range != null) {
      setState(() {
        _startDate = range.start;
        _endDate = range.end;
      });
      _loadMovements();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Movement History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(),
            tooltip: 'Filter',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadMovements,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Column(
        children: [
          // Search and filters
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search movements...',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                    ),
                    onChanged: (value) {
                      setState(() => _searchQuery = value);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                
                // Date range button
                OutlinedButton.icon(
                  onPressed: _selectDateRange,
                  icon: const Icon(Icons.date_range, size: 18),
                  label: Text(
                    _startDate != null && _endDate != null
                        ? '${_formatDate(_startDate!)} - ${_formatDate(_endDate!)}'
                        : 'Select dates',
                  ),
                ),
                const SizedBox(width: 8),
                
                // Type filter
                DropdownButton<MovementType?>(
                  value: _typeFilter,
                  hint: const Text('All types'),
                  items: [
                    const DropdownMenuItem(
                      value: null,
                      child: Text('All types'),
                    ),
                    ...MovementType.values.map((type) {
                      return DropdownMenuItem(
                        value: type,
                        child: Text(type.name.toUpperCase()),
                      );
                    }),
                  ],
                  onChanged: (value) {
                    setState(() => _typeFilter = value);
                    _loadMovements();
                  },
                ),
              ],
            ),
          ),
          
          const Divider(height: 1),
          
          // Movements list
          Expanded(
            child: Consumer<StockProvider>(
              builder: (context, stock, _) {
                if (stock.isLoading && stock.movements.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                
                // Filter movements by search
                var movements = stock.movements;
                if (_searchQuery.isNotEmpty) {
                  movements = movements.where((m) {
                    final query = _searchQuery.toLowerCase();
                    return m.referenceNumber?.toLowerCase().contains(query) == true ||
                           m.notes?.toLowerCase().contains(query) == true ||
                           m.itemId.toLowerCase().contains(query);
                  }).toList();
                }
                
                if (movements.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.history_outlined,
                          size: 64,
                          color: colorScheme.outline,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No movements found',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: colorScheme.outline,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Stock movements will appear here',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colorScheme.outline.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: movements.length,
                  itemBuilder: (context, index) {
                    return _MovementCard(movement: movements[index]);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filter Movements'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // More advanced filters can go here
            Text('Additional filters coming soon'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}

class _MovementCard extends StatelessWidget {
  final StockMovement movement;
  
  const _MovementCard({required this.movement});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    final (icon, color, label) = _getMovementDisplay();
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => _showDetails(context),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Type icon
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 16),
              
              // Movement details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          label,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: _getStatusColor(movement.status).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            movement.status.name.toUpperCase(),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: _getStatusColor(movement.status),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    
                    if (movement.referenceNumber != null)
                      Text(
                        'Ref: ${movement.referenceNumber}',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colorScheme.primary,
                        ),
                      ),
                    
                    const SizedBox(height: 8),
                    
                    // Quantity
                    Row(
                      children: [
                        Icon(
                          movement.movementType == MovementType.stockIn ? Icons.add : Icons.remove,
                          size: 16,
                          color: movement.movementType == MovementType.stockIn ? Colors.green : Colors.red,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${movement.quantity} ${movement.unitOfMeasure ?? 'units'}',
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: movement.movementType == MovementType.stockIn ? Colors.green : Colors.red,
                          ),
                        ),
                      ],
                    ),
                    
                    const SizedBox(height: 8),
                    
                    // Location info
                    if (movement.fromLocationId != null || movement.toLocationId != null)
                      Wrap(
                        spacing: 8,
                        children: [
                          if (movement.fromLocationId != null)
                            Chip(
                              avatar: const Icon(Icons.arrow_upward, size: 14),
                              label: Text(movement.fromLocationId!, style: const TextStyle(fontSize: 12)),
                              visualDensity: VisualDensity.compact,
                            ),
                          if (movement.toLocationId != null)
                            Chip(
                              avatar: const Icon(Icons.arrow_downward, size: 14),
                              label: Text(movement.toLocationId!, style: const TextStyle(fontSize: 12)),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                    
                    const SizedBox(height: 8),
                    
                    // Timestamp
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _formatDateTime(movement.createdAt),
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colorScheme.outline,
                          ),
                        ),
                        Text(
                          'by ${movement.performedBy}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colorScheme.outline,
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

  (IconData, Color, String) _getMovementDisplay() {
    return switch (movement.movementType) {
      MovementType.stockIn => (Icons.arrow_downward, Colors.green, 'Stock In'),
      MovementType.stockOut => (Icons.arrow_upward, Colors.red, 'Stock Out'),
      MovementType.transfer => (Icons.swap_horiz, Colors.blue, 'Transfer'),
      MovementType.adjustment => (Icons.tune, Colors.orange, 'Adjustment'),
      MovementType.cycleCount => (Icons.fact_check, Colors.purple, 'Cycle Count'),
      MovementType.return_ => (Icons.undo, Colors.teal, 'Return'),
      MovementType.write_off => (Icons.delete_outline, Colors.grey, 'Write Off'),
    };
  }

  Color _getStatusColor(MovementStatus status) {
    return switch (status) {
      MovementStatus.pending => Colors.orange,
      MovementStatus.completed => Colors.green,
      MovementStatus.cancelled => Colors.grey,
      MovementStatus.failed => Colors.red,
    };
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.day}/${dt.month}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  void _showDetails(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Movement Details'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DetailRow(label: 'ID', value: movement.id),
              _DetailRow(label: 'Type', value: movement.movementType.name.toUpperCase()),
              _DetailRow(label: 'Status', value: movement.status.name.toUpperCase()),
              _DetailRow(label: 'Quantity', value: '${movement.quantity}'),
              _DetailRow(label: 'Item ID', value: movement.itemId),
              if (movement.batchNumber != null)
                _DetailRow(label: 'Batch', value: movement.batchNumber!),
              if (movement.referenceNumber != null)
                _DetailRow(label: 'Reference', value: movement.referenceNumber!),
              if (movement.reason != null)
                _DetailRow(label: 'Reason', value: movement.reason!.name.toUpperCase()),
              if (movement.notes != null)
                _DetailRow(label: 'Notes', value: movement.notes!),
              _DetailRow(label: 'Performed By', value: movement.performedBy),
              _DetailRow(label: 'Date', value: _formatDateTime(movement.createdAt)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
