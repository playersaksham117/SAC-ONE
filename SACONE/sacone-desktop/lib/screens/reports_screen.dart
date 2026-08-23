import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import '../models/inventory_item.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../providers/settings_provider.dart';
import '../providers/reports_provider.dart';
import '../providers/retail_providers.dart';
import '../services/pdf_service.dart';
import '../services/excel_service.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _selectedReportType = 'stock_valuation';
  bool _isExporting = false;
  String _searchQuery = '';
  String _selectedWarehouseId = 'all';
  String _sortBy = 'name';
  bool _sortAscending = true;

  @override
  void initState() {
    super.initState();
    // Ensure fresh data when screen loads
    Future.microtask(() {
      if (mounted) {
        context.read<ReportsProvider>().refreshReports();
        context.read<RetailReportsProvider>().load();
        context.read<LedgerProvider>().loadDues();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer4<ReportsProvider, WarehouseProvider, SettingsProvider, InventoryProvider>(
      builder: (context, reportsProvider, warehouseProvider, settingsProvider, inventoryProvider, _) {
        return Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          body: Column(
            children: [
              _buildTopBar(context, reportsProvider, settingsProvider),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildReportTypeSelector(),
                      const SizedBox(height: 24),
                      _buildFilterSortBar(warehouseProvider),
                      const SizedBox(height: 24),
                      _buildReportContent(reportsProvider, settingsProvider),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTopBar(BuildContext context, ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
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
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.assessment_outlined,
              color: Color(0xFF3B82F6),
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Reports & Analytics',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Generate and export inventory reports',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: _isExporting ? null : () => _exportToExcel(context),
            icon: _isExporting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.table_chart, size: 18),
            label: const Text('Export to Excel'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF10B981),
              side: const BorderSide(color: Color(0xFF10B981)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          const SizedBox(width: 12),
          FilledButton.icon(
            onPressed: _isExporting ? null : () => _exportToPDF(context),
            icon: _isExporting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.picture_as_pdf, size: 18),
            label: const Text('Export to PDF'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReportTypeSelector() {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildReportTypeButton('stock_valuation', 'Stock Valuation', Icons.inventory_2_outlined),
          _buildReportTypeButton('low_stock', 'Low Stock', Icons.warning_amber_rounded),
          _buildReportTypeButton('transactions', 'Transactions', Icons.receipt_long_outlined),
          _buildReportTypeButton('warehouse', 'By Warehouse', Icons.warehouse_outlined),
          _buildReportTypeButton('sales', 'Sales', Icons.point_of_sale_outlined),
          _buildReportTypeButton('purchases', 'Purchases', Icons.shopping_bag_outlined),
          _buildReportTypeButton('customer_dues', 'Customer Dues', Icons.people_outline),
          _buildReportTypeButton('supplier_dues', 'Supplier Dues', Icons.local_shipping_outlined),
        ],
      ),
    );
  }

  Widget _buildReportTypeButton(String type, String label, IconData icon) {
    final isSelected = _selectedReportType == type;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: FilledButton.icon(
        onPressed: () {
          setState(() {
            _selectedReportType = type;
          });
        },
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: isSelected ? const Color(0xFF3B82F6) : Colors.transparent,
          foregroundColor: isSelected ? Colors.white : const Color(0xFF64748B),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildReportContent(ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    switch (_selectedReportType) {
      case 'stock_valuation':
        return _buildStockValuationReport(reportsProvider, settingsProvider);
      case 'low_stock':
        return _buildLowStockReport(reportsProvider, settingsProvider);
      case 'transactions':
        return _buildTransactionsReport(reportsProvider, settingsProvider);
      case 'warehouse':
        return _buildWarehouseReport(reportsProvider, settingsProvider);
      case 'sales':
        return _buildRetailSalesReport();
      case 'purchases':
        return _buildRetailPurchaseReport();
      case 'customer_dues':
        return _buildCustomerDuesReport();
      case 'supplier_dues':
        return _buildSupplierDuesReport();
      default:
        return const SizedBox();
    }
  }

  Widget _buildFilterSortBar(WarehouseProvider warehouseProvider) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(
            width: 280,
            child: TextField(
              decoration: const InputDecoration(
                labelText: 'Search',
                hintText: 'Item, SKU, category or notes',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (value) => setState(() => _searchQuery = value.trim().toLowerCase()),
            ),
          ),
          SizedBox(
            width: 220,
            child: DropdownButtonFormField<String>(
              initialValue: _selectedWarehouseId,
              decoration: const InputDecoration(
                labelText: 'Warehouse',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem(value: 'all', child: Text('All Warehouses')),
                ...warehouseProvider.warehouses
                    .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))),
              ],
              onChanged: (value) => setState(() => _selectedWarehouseId = value ?? 'all'),
            ),
          ),
          SizedBox(
            width: 180,
            child: DropdownButtonFormField<String>(
              initialValue: _sortBy,
              decoration: const InputDecoration(
                labelText: 'Sort by',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: const [
                DropdownMenuItem(value: 'name', child: Text('Name')),
                DropdownMenuItem(value: 'qty', child: Text('Quantity')),
                DropdownMenuItem(value: 'value', child: Text('Value/Amount')),
                DropdownMenuItem(value: 'date', child: Text('Date')),
              ],
              onChanged: (value) => setState(() => _sortBy = value ?? 'name'),
            ),
          ),
          FilledButton.tonalIcon(
            onPressed: () => setState(() => _sortAscending = !_sortAscending),
            icon: Icon(_sortAscending ? Icons.arrow_upward : Icons.arrow_downward),
            label: Text(_sortAscending ? 'Ascending' : 'Descending'),
          ),
        ],
      ),
    );
  }

  Widget _buildStockValuationReport(ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    final items = reportsProvider.stockValuationReport;
    final filtered = _applyFiltersToReportData(items);

    double totalValue = 0;
    for (var item in filtered) {
      totalValue += item.totalValue;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Summary Cards
        Row(
          children: [
            Expanded(child: _buildSummaryCard('Total Items', filtered.length.toString(), Icons.inventory_2, const Color(0xFF3B82F6))),
            const SizedBox(width: 16),
            Expanded(child: _buildSummaryCard('Total Stock Units', filtered.fold<double>(0, (sum, i) => sum + i.totalQuantity).toStringAsFixed(0), Icons.widgets, const Color(0xFF8B5CF6))),
            const SizedBox(width: 16),
            Expanded(child: _buildSummaryCard('Total Value', settingsProvider.formatCurrency(totalValue, compact: true), Icons.currency_rupee, const Color(0xFF10B981))),
          ],
        ),
        const SizedBox(height: 24),

        // Stock Table
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.table_chart, color: Color(0xFF64748B), size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Stock Valuation Details',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (filtered.isEmpty)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(40),
                    child: Text(
                      'No inventory items found',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ),
                )
              else
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Item Name')),
                      DataColumn(label: Text('SKU')),
                      DataColumn(label: Text('Category')),
                      DataColumn(label: Text('Stock Qty')),
                      DataColumn(label: Text('Unit Price')),
                      DataColumn(label: Text('Total Value')),
                    ],
                    rows: filtered.map((item) {
                      return DataRow(cells: [
                        DataCell(Text(item.itemName)),
                        DataCell(Text(item.sku)),
                        DataCell(Text(item.category)),
                        DataCell(Text(item.totalQuantity.toStringAsFixed(0))),
                        DataCell(Text(settingsProvider.formatCurrency(item.costPrice))),
                        DataCell(Text(settingsProvider.formatCurrency(item.totalValue))),
                      ]);
                    }).toList(),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLowStockReport(ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    final criticalItems = reportsProvider.criticalStockReport;
    final lowItems = reportsProvider.lowStockReport;
    final allAlertItems = [...criticalItems, ...lowItems];
    final filtered = _applyFiltersToReportData(allAlertItems);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Color(0xFFF59E0B), size: 20),
              const SizedBox(width: 8),
              const Text(
                'Low Stock Alert',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${criticalItems.length} Critical',
                  style: const TextStyle(
                    color: Color(0xFFEF4444),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${lowItems.length} Low',
                  style: const TextStyle(
                    color: Color(0xFFF59E0B),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (filtered.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  children: [
                    Icon(Icons.check_circle_outline, size: 48, color: Colors.green.shade300),
                    const SizedBox(height: 12),
                    Text(
                      'All stock levels are healthy!',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            )
          else
            ...filtered.map((item) {
              final isCritical = item.totalQuantity <= item.minStockLevel;

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isCritical ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: isCritical ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      isCritical ? Icons.error_outline : Icons.warning_amber_rounded,
                      color: isCritical ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.itemName,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            'SKU: ${item.sku} | Current: ${item.totalQuantity.toInt()} ${item.unit}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        isCritical ? 'CRITICAL' : 'LOW STOCK',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isCritical ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildTransactionsReport(ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    final transactions = reportsProvider.transactionReport.take(100).toList();

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.receipt_long_outlined, color: Color(0xFF64748B), size: 20),
              SizedBox(width: 8),
              Text(
                'Recent Transactions (Last 30 Days)',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (transactions.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Text(
                  'No transactions found',
                  style: TextStyle(color: Colors.grey.shade500),
                ),
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('Date')),
                  DataColumn(label: Text('Type')),
                  DataColumn(label: Text('Count')),
                  DataColumn(label: Text('Quantity')),
                  DataColumn(label: Text('Value')),
                ],
                rows: transactions.map((trans) {
                  return DataRow(cells: [
                    DataCell(Text(trans.date.toString().substring(0, 10))),
                    DataCell(Text(trans.type)),
                    DataCell(Text(trans.count.toString())),
                    DataCell(Text(trans.totalQuantity.toStringAsFixed(0))),
                    DataCell(Text(settingsProvider.formatCurrency(trans.totalValue))),
                  ]);
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildWarehouseReport(ReportsProvider reportsProvider, SettingsProvider settingsProvider) {
    final warehouses = reportsProvider.warehouseReport;
    final filtered = warehouses.where((warehouse) {
      if (_selectedWarehouseId != 'all' && warehouse.warehouseId != _selectedWarehouseId) return false;
      if (_searchQuery.isEmpty) return true;
      return warehouse.warehouseName.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warehouse_outlined, color: Color(0xFF64748B), size: 20),
              SizedBox(width: 8),
              Text(
                'Warehouse Distribution',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (filtered.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Text(
                  'No warehouses found',
                  style: TextStyle(color: Colors.grey.shade500),
                ),
              ),
            )
          else
            ...filtered.map((warehouse) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.warehouse, color: Color(0xFF3B82F6)),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            warehouse.warehouseName,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            '${warehouse.itemCount} items',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          warehouse.totalQuantity.toStringAsFixed(0),
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF3B82F6),
                          ),
                        ),
                        Text(
                          'Units',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          settingsProvider.formatCurrency(warehouse.totalValue, compact: true),
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF10B981),
                          ),
                        ),
                        const Text(
                          'Value',
                          style: TextStyle(
                            fontSize: 11,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  /// Apply filters to report data
  List<ReportData> _applyFiltersToReportData(List<ReportData> items) {
    final filtered = items.where((item) {
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        if (!item.itemName.toLowerCase().contains(query) &&
            !item.sku.toLowerCase().contains(query) &&
            !item.category.toLowerCase().contains(query)) {
          return false;
        }
      }
      return true;
    }).toList();

    // Apply sorting
    switch (_sortBy) {
      case 'name':
        filtered.sort((a, b) => a.itemName.compareTo(b.itemName));
        break;
      case 'qty':
        filtered.sort((a, b) => a.totalQuantity.compareTo(b.totalQuantity));
        break;
      case 'value':
        filtered.sort((a, b) => a.totalValue.compareTo(b.totalValue));
        break;
      case 'sku':
        filtered.sort((a, b) => a.sku.compareTo(b.sku));
        break;
    }

    if (!_sortAscending) {
      return filtered.reversed.toList();
    }
    return filtered;
  }

  Widget _buildSummaryCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _exportToPDF(BuildContext context) async {
    setState(() => _isExporting = true);

    try {
      final reportsProvider = Provider.of<ReportsProvider>(context, listen: false);
      final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);
      
      await PDFService.generateStockReport(
        items: reportsProvider.stockValuationReport.map((r) => InventoryItem(
          id: r.itemId,
          name: r.itemName,
          sku: r.sku,
          category: r.category,
          unit: r.unit,
          costPrice: r.costPrice,
          sellingPrice: r.sellingPrice,
          reorderLevel: r.reorderLevel,
          minStockLevel: r.minStockLevel,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        )).toList(),
        stocks: [], // Not needed for export now
        currencySymbol: settingsProvider.currency.symbol,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('PDF report generated successfully!'),
            backgroundColor: Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error generating PDF: $e'),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  Future<void> _exportToExcel(BuildContext context) async {
    setState(() => _isExporting = true);

    try {
      final reportsProvider = Provider.of<ReportsProvider>(context, listen: false);
      final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);

      final filePath = await ExcelService.generateStockReport(
        items: reportsProvider.stockValuationReport.map((r) => InventoryItem(
          id: r.itemId,
          name: r.itemName,
          sku: r.sku,
          category: r.category,
          unit: r.unit,
          costPrice: r.costPrice,
          sellingPrice: r.sellingPrice,
          reorderLevel: r.reorderLevel,
          minStockLevel: r.minStockLevel,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        )).toList(),
        stocks: [], // Not needed for export now
        currencySymbol: settingsProvider.currency.symbol,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Excel report saved to: $filePath'),
            backgroundColor: const Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'Open',
              textColor: Colors.white,
              onPressed: () {
                // Open file location
                if (Platform.isWindows) {
                  Process.run('explorer', ['/select,', filePath]);
                }
              },
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error generating Excel: $e'),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  Widget _buildRetailSalesReport() {
    return Consumer<RetailReportsProvider>(
      builder: (context, retail, _) {
        final s = retail.salesSummary;
        return _retailSummaryCard('Sales Report (30 days)', [
          _metric('Invoices', '${s['count'] ?? 0}'),
          _metric('Total Sales', '₹${((s['total'] as num?) ?? 0).toStringAsFixed(2)}'),
          _metric('Collected', '₹${((s['paid'] as num?) ?? 0).toStringAsFixed(2)}'),
          _metric('Outstanding', '₹${((s['due'] as num?) ?? 0).toStringAsFixed(2)}'),
        ]);
      },
    );
  }

  Widget _buildRetailPurchaseReport() {
    return Consumer<RetailReportsProvider>(
      builder: (context, retail, _) {
        final p = retail.purchaseSummary;
        return _retailSummaryCard('Purchase Report (30 days)', [
          _metric('Orders', '${p['count'] ?? 0}'),
          _metric('Total Purchases', '₹${((p['total'] as num?) ?? 0).toStringAsFixed(2)}'),
          _metric('Paid', '₹${((p['paid'] as num?) ?? 0).toStringAsFixed(2)}'),
          _metric('Due to Suppliers', '₹${((p['due'] as num?) ?? 0).toStringAsFixed(2)}'),
        ]);
      },
    );
  }

  Widget _buildCustomerDuesReport() {
    return Consumer<LedgerProvider>(
      builder: (context, ledger, _) {
        if (ledger.customerDues.isEmpty) {
          return const Center(child: Text('No customer dues'));
        }
        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: ledger.customerDues.length,
          itemBuilder: (context, i) {
            final r = ledger.customerDues[i];
            return ListTile(
              title: Text(r['name'] as String),
              subtitle: Text(r['phone'] as String? ?? ''),
              trailing: Text('₹${(r['outstandingBalance'] as num).toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
            );
          },
        );
      },
    );
  }

  Widget _buildSupplierDuesReport() {
    return Consumer<LedgerProvider>(
      builder: (context, ledger, _) {
        if (ledger.supplierDues.isEmpty) {
          return const Center(child: Text('No supplier dues'));
        }
        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: ledger.supplierDues.length,
          itemBuilder: (context, i) {
            final r = ledger.supplierDues[i];
            return ListTile(
              title: Text(r['name'] as String),
              subtitle: Text(r['phone'] as String? ?? ''),
              trailing: Text('₹${(r['outstandingBalance'] as num).toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
            );
          },
        );
      },
    );
  }

  Widget _retailSummaryCard(String title, List<Widget> metrics) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          Wrap(spacing: 24, runSpacing: 16, children: metrics),
        ],
      ),
    );
  }

  Widget _metric(String label, String value) {
    return SizedBox(
      width: 180,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
