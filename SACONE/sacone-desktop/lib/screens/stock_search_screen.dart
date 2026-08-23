import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/stock_search_provider.dart';
import '../services/stock_search_service.dart';

class StockSearchScreen extends StatefulWidget {
  const StockSearchScreen({super.key});

  @override
  State<StockSearchScreen> createState() => _StockSearchScreenState();
}

class _StockSearchScreenState extends State<StockSearchScreen> {
  final _searchController = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _searchController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _performSearch(String query) {
    if (query.trim().isEmpty) {
      context.read<StockSearchProvider>().clearSearch();
      return;
    }
    final provider = context.read<StockSearchProvider>();
    provider.search(query.trim());
  }

  void _clearSearch() {
    _searchController.clear();
    _focusNode.requestFocus();
    context.read<StockSearchProvider>().clearSearch();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Search'),
        elevation: 0,
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              focusNode: _focusNode,
              decoration: InputDecoration(
                hintText: 'Search by SKU, Name, or Barcode...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: _clearSearch,
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
              onChanged: (value) {
                setState(() {});
                // Dynamic search - trigger on every character change
                _performSearch(value);
              },
              onSubmitted: _performSearch,
            ),
          ),

          // Search Results
          Expanded(
            child: Consumer<StockSearchProvider>(
              builder: (context, provider, _) {
                if (provider.isSearching) {
                  return const Center(
                    child: CircularProgressIndicator(),
                  );
                }

                if (provider.lastError != null) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, size: 48, color: Colors.red),
                        const SizedBox(height: 16),
                        Text(
                          'Error: ${provider.lastError}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ],
                    ),
                  );
                }

                if (provider.searchResults.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.inbox,
                          size: 48,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _searchController.text.isEmpty
                              ? 'Start typing to search for stock'
                              : 'No results found',
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: provider.searchResults.length,
                  itemBuilder: (context, index) {
                    final item = provider.searchResults[index];
                    return _buildStockCard(context, item, provider);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStockCard(
    BuildContext context,
    StockSearchResult item,
    StockSearchProvider provider,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => _showItemDetails(context, item),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Row: SKU, Name, Qty
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.itemName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'SKU: ${item.sku}',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey[700],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Quantity Badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: item.isCritical
                          ? Colors.red
                          : item.isLowStock
                              ? Colors.orange
                              : Colors.green,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${item.totalQuantity.toStringAsFixed(2)} ${item.unit}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),

              // Stock Info Row
              Row(
                children: [
                  Expanded(
                    child: _buildInfoChip(
                      'Locations',
                      item.locationCount.toString(),
                      Icons.location_on,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildInfoChip(
                      'Warehouses',
                      item.warehouseCount.toString(),
                      Icons.warehouse,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildInfoChip(
                      'Value',
                      '₹${item.totalValue.toStringAsFixed(0)}',
                      Icons.currency_rupee,
                    ),
                  ),
                ],
              ),

              // Status indicator
              const SizedBox(height: 8),
              if (item.isCritical || item.isLowStock)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: item.isCritical ? Colors.red[50] : Colors.orange[50],
                    border: Border.all(
                      color: item.isCritical ? Colors.red : Colors.orange,
                    ),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    item.isCritical
                        ? 'CRITICAL - Below 50% reorder level'
                        : 'LOW STOCK - Near reorder level',
                    style: TextStyle(
                      fontSize: 12,
                      color: item.isCritical ? Colors.red[700] : Colors.orange[700],
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoChip(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.grey[700]),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey[600],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  void _showItemDetails(BuildContext context, StockSearchResult item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _ItemDetailsSheet(item: item),
    );
  }
}

class _ItemDetailsSheet extends StatefulWidget {
  final StockSearchResult item;

  const _ItemDetailsSheet({required this.item});

  @override
  State<_ItemDetailsSheet> createState() => _ItemDetailsSheetState();
}

class _ItemDetailsSheetState extends State<_ItemDetailsSheet> {
  late Future<List<Map<String, dynamic>>> _movementHistory;

  @override
  void initState() {
    super.initState();
    _movementHistory = StockSearchService.getItemMovementHistory(widget.item.itemId);
  }

  Future<void> _adjustQuantity(BuildContext context, LocationStockDetail location, double adjustment) async {
    try {
      final provider = context.read<StockSearchProvider>();
      
      // Show loading
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${adjustment > 0 ? 'Adding' : 'Removing'} ${adjustment.abs()} ${widget.item.unit}...'),
          duration: const Duration(seconds: 1),
        ),
      );

      await provider.adjustStockQuantity(
        stockId: location.stockId,
        adjustment: adjustment,
        reason: 'Manual adjustment from stock search',
      );

      // Show success
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Stock updated successfully'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  border: Border(
                    bottom: BorderSide(color: Colors.grey[300]!),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.item.itemName,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'SKU: ${widget.item.sku}',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey[700],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: widget.item.isCritical
                                ? Colors.red
                                : widget.item.isLowStock
                                    ? Colors.orange
                                    : Colors.green,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${widget.item.totalQuantity.toStringAsFixed(2)} ${widget.item.unit}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Summary Stats
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildStat('Cost Price', '₹${widget.item.costPrice.toStringAsFixed(2)}'),
                    _buildStat('Selling Price', '₹${widget.item.sellingPrice.toStringAsFixed(2)}'),
                    _buildStat('Total Value', '₹${widget.item.totalValue.toStringAsFixed(0)}'),
                  ],
                ),
              ),

              const Divider(),

              // Locations Tab
              DefaultTabController(
                length: 2,
                child: Column(
                  children: [
                    const TabBar(
                      tabs: [
                        Tab(text: 'Locations'),
                        Tab(text: 'Movement History'),
                      ],
                    ),
                    SizedBox(
                      height: 300,
                      child: TabBarView(
                        children: [
                          // Locations Tab
                          ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: widget.item.locations.length,
                            itemBuilder: (context, index) {
                              final loc = widget.item.locations[index];
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        loc.locationPath,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 13,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          // Quantity Display
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Qty: ${loc.quantity.toStringAsFixed(2)} ${widget.item.unit}',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.grey[700],
                                                  ),
                                                ),
                                                Text(
                                                  'Level: ${loc.hierarchyLevel}',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.blue[600],
                                                    fontWeight: FontWeight.w500,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          // Add/Subtract Buttons
                                          Row(
                                            children: [
                                              IconButton(
                                                icon: const Icon(Icons.remove_circle_outline),
                                                color: Colors.red,
                                                iconSize: 28,
                                                tooltip: 'Decrease by 1',
                                                onPressed: () => _adjustQuantity(context, loc, -1),
                                              ),
                                              IconButton(
                                                icon: const Icon(Icons.add_circle_outline),
                                                color: Colors.green,
                                                iconSize: 28,
                                                tooltip: 'Increase by 1',
                                                onPressed: () => _adjustQuantity(context, loc, 1),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                      if (loc.batchNumber != null) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          'Batch: ${loc.batchNumber}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey[600],
                                          ),
                                        ),
                                      ],
                                      if (loc.expiryDate != null) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          'Expiry: ${loc.expiryDate!.toString().split(' ')[0]}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: DateTime.now().isAfter(loc.expiryDate!)
                                                ? Colors.red
                                                : Colors.grey[600],
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),

                          // Movement History Tab
                          FutureBuilder<List<Map<String, dynamic>>>(
                            future: _movementHistory,
                            builder: (context, snapshot) {
                              if (snapshot.connectionState == ConnectionState.waiting) {
                                return const Center(child: CircularProgressIndicator());
                              }

                              if (snapshot.hasError) {
                                return Center(
                                  child: Text('Error: ${snapshot.error}'),
                                );
                              }

                              final movements = snapshot.data ?? [];
                              if (movements.isEmpty) {
                                return const Center(
                                  child: Text('No movement history'),
                                );
                              }

                              return ListView.builder(
                                padding: const EdgeInsets.all(12),
                                itemCount: movements.length,
                                itemBuilder: (context, index) {
                                  final mov = movements[index];
                                  return Card(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Text(
                                                mov['type'] ?? 'Unknown',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              Text(
                                                mov['quantity'].toString(),
                                                style: TextStyle(
                                                  color: (mov['type'] ?? '').toString().toLowerCase().contains('in')
                                                      ? Colors.green
                                                      : Colors.red,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            mov['warehouseName'] ?? 'Unknown',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey[700],
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            mov['transactionDate'].toString().split(' ')[0],
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey[600],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStat(String label, String value) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}