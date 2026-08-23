import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../models/inventory_item.dart';
import '../widgets/sales_stats_widget.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer2<InventoryProvider, WarehouseProvider>(
      builder: (context, inventoryProvider, warehouseProvider, _) {
        return Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          body: Column(
            children: [
              // Top Bar
              _buildTopBar(context, inventoryProvider, warehouseProvider),
              
              // Main Content
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // KPI Cards Grid
                      _buildKPICards(context, inventoryProvider, warehouseProvider),
                      const SizedBox(height: 32),
                      
                      // Sales & Purchases Stats (New)
                      const SalesStatsWidget(),
                      const SizedBox(height: 24),
                      
                      // Charts & Alerts Row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Charts Section (Left)
                          Expanded(
                            flex: 2,
                            child: Column(
                              children: [
                                _buildInventoryMovementChart(context, inventoryProvider),
                                const SizedBox(height: 24),
                                _buildStockDistributionChart(context, inventoryProvider, warehouseProvider),
                              ],
                            ),
                          ),
                          const SizedBox(width: 24),
                          
                          // Alerts Section (Right)
                          Expanded(
                            flex: 1,
                            child: _buildStockAlerts(context, inventoryProvider),
                          ),
                        ],
                      ),
                      const SizedBox(height: 32),
                      
                      // Cell Stock Overview (New)
                      const CellStockOverviewWidget(),
                      const SizedBox(height: 32),
                      
                      // Recent Transactions Table
                      _buildRecentTransactions(context, inventoryProvider),
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

  // ========== TOP BAR ==========
  Widget _buildTopBar(
    BuildContext context,
    InventoryProvider inventoryProvider,
    WarehouseProvider warehouseProvider,
  ) {
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
          // Logo
          SvgPicture.asset(
            'assets/icons/tracinvent_logo_horizontal.svg',
            height: 36,
            placeholderBuilder: (context) => const SizedBox(
              height: 36,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            errorBuilder: (context, error, stackTrace) {
              return Container(
                height: 36,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                ),
                child: const Center(
                  child: Text(
                    'TracInvent',
                    style: TextStyle(
                      color: Color(0xFF1E40AF),
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 24),
          Container(
            height: 40,
            width: 1,
            color: Colors.grey.shade300,
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Dashboard',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Welcome back! Here\'s your inventory overview',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: () {
              inventoryProvider.loadInventoryItems();
              warehouseProvider.loadWarehouses();
            },
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Refresh'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF475569),
              side: BorderSide(color: Colors.grey.shade300),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          const SizedBox(width: 12),
          FilledButton.icon(
            onPressed: () {
              // Export functionality
            },
            icon: const Icon(Icons.file_download, size: 18),
            label: const Text('Export Report'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }

  // ========== KPI CARDS ==========
  Widget _buildKPICards(
    BuildContext context,
    InventoryProvider inventoryProvider,
    WarehouseProvider warehouseProvider,
  ) {
    final totalItems = inventoryProvider.items.length;
    final lowStockCount = inventoryProvider.lowStockItems.length;
    final criticalStockCount = inventoryProvider.criticalStockItems.length;
    final warehouseCount = warehouseProvider.activeWarehouses.length;
    
    double totalInventoryValue = 0;
    for (var item in inventoryProvider.items) {
      final stock = inventoryProvider.getTotalStock(item.id);
      totalInventoryValue += stock * item.costPrice;
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        int crossAxisCount = 5;
        if (constraints.maxWidth < 1400) crossAxisCount = 4;
        if (constraints.maxWidth < 1100) crossAxisCount = 3;
        if (constraints.maxWidth < 800) crossAxisCount = 2;
        
        return GridView.count(
          crossAxisCount: crossAxisCount,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          childAspectRatio: 1.6,
          children: [
            _buildKPICard(
              context,
              'Total Items',
              totalItems.toString(),
              Icons.inventory_2_outlined,
              const Color(0xFF3B82F6),
              const Color(0xFFEFF6FF),
              '+12% from last month',
              true,
            ),
            _buildKPICard(
              context,
              'Inventory Value',
              NumberFormat.compactCurrency(symbol: '₹', locale: 'en_IN').format(totalInventoryValue),
              Icons.currency_rupee,
              const Color(0xFF8B5CF6),
              const Color(0xFFF5F3FF),
              NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(totalInventoryValue),
              false,
            ),
            _buildKPICard(
              context,
              'Low Stock',
              lowStockCount.toString(),
              Icons.trending_down,
              const Color(0xFFF59E0B),
              const Color(0xFFFEF3C7),
              '$lowStockCount items need reorder',
              false,
            ),
            _buildKPICard(
              context,
              'Critical Stock',
              criticalStockCount.toString(),
              Icons.warning_amber_rounded,
              const Color(0xFFEF4444),
              const Color(0xFFFEE2E2),
              'Immediate action required',
              false,
            ),
            _buildKPICard(
              context,
              'Warehouses',
              warehouseCount.toString(),
              Icons.warehouse_outlined,
              const Color(0xFF10B981),
              const Color(0xFFD1FAE5),
              'Active locations',
              false,
            ),
          ],
        );
      },
    );
  }

  Widget _buildKPICard(
    BuildContext context,
    String title,
    String value,
    IconData icon,
    Color iconColor,
    Color bgColor,
    String subtitle,
    bool showTrend,
  ) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              if (showTrend)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD1FAE5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.trending_up, size: 12, color: Color(0xFF10B981)),
                      SizedBox(width: 4),
                      Text(
                        '12%',
                        style: TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const Spacer(),
          Text(
            title,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
              height: 1.0,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: TextStyle(
              color: Colors.grey.shade500,
              fontSize: 11,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // ========== INVENTORY MOVEMENT CHART ==========
  Widget _buildInventoryMovementChart(BuildContext context, InventoryProvider inventoryProvider) {
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
              const Icon(Icons.show_chart, color: Color(0xFF64748B), size: 20),
              const SizedBox(width: 8),
              const Text(
                'Inventory Movement',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const Spacer(),
              _buildLegendItem('Incoming', const Color(0xFF10B981)),
              const SizedBox(width: 16),
              _buildLegendItem('Outgoing', const Color(0xFFEF4444)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Last 7 days transaction overview',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 280,
            child: inventoryProvider.transactions.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.insert_chart_outlined, size: 48, color: Colors.grey.shade300),
                        const SizedBox(height: 12),
                        Text(
                          'No transaction data available',
                          style: TextStyle(color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  )
                : _buildBarChart(inventoryProvider),
          ),
        ],
      ),
    );
  }

  Widget _buildBarChart(InventoryProvider inventoryProvider) {
    // Aggregate transactions by day
    final now = DateTime.now();
    final Map<int, double> incomingData = {};
    final Map<int, double> outgoingData = {};
    
    for (int i = 0; i < 7; i++) {
      incomingData[i] = 0;
      outgoingData[i] = 0;
    }

    for (var transaction in inventoryProvider.transactions) {
      final daysDiff = now.difference(transaction.transactionDate).inDays;
      if (daysDiff < 7) {
        final index = 6 - daysDiff;
        if (transaction.type == 'purchase') {
          incomingData[index] = (incomingData[index] ?? 0) + transaction.quantity;
        } else if (transaction.type == 'sale') {
          outgoingData[index] = (outgoingData[index] ?? 0) + transaction.quantity;
        }
      }
    }

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: _getMaxY(incomingData, outgoingData),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            tooltipPadding: const EdgeInsets.all(8),
            tooltipMargin: 8,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final value = rod.toY.toInt();
              final label = rodIndex == 0 ? 'Incoming' : 'Outgoing';
              return BarTooltipItem(
                '$label\n$value units',
                const TextStyle(color: Colors.white, fontSize: 12),
              );
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final date = now.subtract(Duration(days: 6 - value.toInt()));
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    DateFormat('E').format(date),
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                );
              },
            ),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (value, meta) {
                return Text(
                  value.toInt().toString(),
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 11,
                  ),
                );
              },
            ),
          ),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: 1,
          getDrawingHorizontalLine: (value) {
            return const FlLine(
              color: Color(0xFFF1F5F9),
              strokeWidth: 1,
            );
          },
        ),
        borderData: FlBorderData(show: false),
        barGroups: List.generate(7, (index) {
          return BarChartGroupData(
            x: index,
            barRods: [
              BarChartRodData(
                toY: incomingData[index] ?? 0,
                color: const Color(0xFF10B981),
                width: 12,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(4),
                ),
              ),
              BarChartRodData(
                toY: outgoingData[index] ?? 0,
                color: const Color(0xFFEF4444),
                width: 12,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(4),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  double _getMaxY(Map<int, double> incoming, Map<int, double> outgoing) {
    double max = 0;
    for (var value in incoming.values) {
      if (value > max) max = value;
    }
    for (var value in outgoing.values) {
      if (value > max) max = value;
    }
    return max == 0 ? 10 : (max * 1.2);
  }

  Widget _buildLegendItem(String label, Color color) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF64748B),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  // ========== STOCK DISTRIBUTION CHART ==========
  Widget _buildStockDistributionChart(
    BuildContext context,
    InventoryProvider inventoryProvider,
    WarehouseProvider warehouseProvider,
  ) {
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
              Icon(Icons.pie_chart_outline, color: Color(0xFF64748B), size: 20),
              SizedBox(width: 8),
              Text(
                'Stock Distribution by Warehouse',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Current inventory spread across locations',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 240,
            child: warehouseProvider.warehouses.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.warehouse_outlined, size: 48, color: Colors.grey.shade300),
                        const SizedBox(height: 12),
                        Text(
                          'No warehouse data available',
                          style: TextStyle(color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  )
                : _buildPieChart(inventoryProvider, warehouseProvider),
          ),
        ],
      ),
    );
  }

  Widget _buildPieChart(InventoryProvider inventoryProvider, WarehouseProvider warehouseProvider) {
    final List<Color> chartColors = [
      const Color(0xFF3B82F6),
      const Color(0xFF8B5CF6),
      const Color(0xFF10B981),
      const Color(0xFFF59E0B),
      const Color(0xFFEF4444),
      const Color(0xFF06B6D4),
    ];

    final Map<String, double> warehouseStocks = {};
    
    for (var stock in inventoryProvider.stocks) {
      warehouseStocks[stock.warehouseId] = (warehouseStocks[stock.warehouseId] ?? 0) + stock.quantity;
    }

    if (warehouseStocks.isEmpty) {
      return Center(
        child: Text(
          'No stock data available',
          style: TextStyle(color: Colors.grey.shade500),
        ),
      );
    }

    final sections = warehouseStocks.entries.toList().asMap().entries.map((entry) {
      final index = entry.key;
      // Warehouse lookup - reserved for future features
      // final warehouse = warehouseProvider.warehouses.firstWhere(
      //   (w) => w.id == entry.value.key,
      //   orElse: () => warehouseProvider.warehouses.first,
      // );
      final value = entry.value.value;
      final color = chartColors[index % chartColors.length];

      return PieChartSectionData(
        value: value,
        title: '${(value / warehouseStocks.values.reduce((a, b) => a + b) * 100).toStringAsFixed(0)}%',
        color: color,
        radius: 80,
        titleStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      );
    }).toList();

    return Row(
      children: [
        Expanded(
          flex: 3,
          child: PieChart(
            PieChartData(
              sections: sections,
              sectionsSpace: 2,
              centerSpaceRadius: 50,
              pieTouchData: PieTouchData(
                touchCallback: (FlTouchEvent event, pieTouchResponse) {},
              ),
            ),
          ),
        ),
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: warehouseStocks.entries.toList().asMap().entries.map((entry) {
              final index = entry.key;
              final warehouse = warehouseProvider.warehouses.firstWhere(
                (w) => w.id == entry.value.key,
                orElse: () => warehouseProvider.warehouses.first,
              );
              final color = chartColors[index % chartColors.length];
              
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            warehouse.name,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${entry.value.value.toInt()} units',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  // ========== STOCK ALERTS ==========
  Widget _buildStockAlerts(BuildContext context, InventoryProvider inventoryProvider) {
    final criticalStockItems = inventoryProvider.criticalStockItems;
    final lowStockItems = inventoryProvider.lowStockItems;
    final allAlerts = [...criticalStockItems, ...lowStockItems.where((item) => !criticalStockItems.contains(item))];

    return Container(
      height: 612, // Match combined height of two chart containers
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
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.notifications_active, color: Color(0xFFEF4444), size: 16),
              ),
              const SizedBox(width: 8),
              const Text(
                'Stock Alerts',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${allAlerts.length} items require attention',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 20),
          
          if (allAlerts.isEmpty)
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check_circle_outline, size: 48, color: Colors.grey.shade300),
                    const SizedBox(height: 12),
                    Text(
                      'All stock levels are healthy',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                itemCount: allAlerts.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final item = allAlerts[index];
                  final stock = inventoryProvider.getTotalStock(item.id);
                  final isCritical = criticalStockItems.contains(item);
                  
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isCritical ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            isCritical ? Icons.error_outline : Icons.warning_amber_rounded,
                            color: isCritical ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.name,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF0F172A),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'SKU: ${item.sku}',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: isCritical
                                          ? const Color(0xFFFEE2E2)
                                          : const Color(0xFFFEF3C7),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      isCritical ? 'CRITICAL' : 'LOW STOCK',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        color: isCritical
                                            ? const Color(0xFFEF4444)
                                            : const Color(0xFFF59E0B),
                                      ),
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    '${stock.toInt()} ${item.unit}',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: isCritical
                                          ? const Color(0xFFEF4444)
                                          : const Color(0xFFF59E0B),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  // ========== RECENT TRANSACTIONS TABLE ==========
  Widget _buildRecentTransactions(BuildContext context, InventoryProvider inventoryProvider) {
    final recentTransactions = inventoryProvider.transactions.take(10).toList();

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
              const Icon(Icons.receipt_long_outlined, color: Color(0xFF64748B), size: 20),
              const SizedBox(width: 8),
              const Text(
                'Recent Transactions',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () {
                  // Navigate to transactions screen
                },
                child: const Text('View All'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Latest inventory movements',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 20),
          
          if (recentTransactions.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  children: [
                    Icon(Icons.inbox_outlined, size: 48, color: Colors.grey.shade300),
                    const SizedBox(height: 12),
                    Text(
                      'No transactions yet',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            )
          else
            Table(
              columnWidths: const {
                0: FlexColumnWidth(2),
                1: FlexColumnWidth(1.5),
                2: FlexColumnWidth(1.5),
                3: FlexColumnWidth(1),
                4: FlexColumnWidth(1),
              },
              children: [
                // Header
                TableRow(
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Colors.grey.shade200, width: 1),
                    ),
                  ),
                  children: [
                    _buildTableHeader('Item'),
                    _buildTableHeader('Type'),
                    _buildTableHeader('Date'),
                    _buildTableHeader('Quantity'),
                    _buildTableHeader('Status'),
                  ],
                ),
                // Rows
                ...recentTransactions.map((transaction) {
                  final item = inventoryProvider.items.firstWhere(
                    (item) => item.id == transaction.itemId,
                    orElse: () => inventoryProvider.items.isNotEmpty
                        ? inventoryProvider.items.first
                        : InventoryItem(
                            id: '',
                            name: 'Unknown',
                            sku: '',
                            category: '',
                            unit: '',
                            reorderLevel: 0,
                            minStockLevel: 0,
                            costPrice: 0,
                            sellingPrice: 0,
                            createdAt: DateTime.now(),
                            updatedAt: DateTime.now(),
                          ),
                  );
                  
                  return TableRow(
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Colors.grey.shade100, width: 1),
                      ),
                    ),
                    children: [
                      _buildTableCell(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF0F172A),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'SKU: ${item.sku}',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _buildTableCell(_buildTransactionType(transaction.type)),
                      _buildTableCell(
                        Text(
                          DateFormat('MMM dd, yyyy').format(transaction.transactionDate),
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF475569),
                          ),
                        ),
                      ),
                      _buildTableCell(
                        Text(
                          '${transaction.quantity.toInt()}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ),
                      _buildTableCell(
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFD1FAE5),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'Completed',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF10B981),
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                }),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildTableHeader(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Colors.grey.shade700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Widget _buildTableCell(Widget child) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      child: child,
    );
  }

  Widget _buildTransactionType(String type) {
    IconData icon;
    Color color;
    String label;
    
    switch (type) {
      case 'purchase':
        icon = Icons.arrow_downward;
        color = const Color(0xFF10B981);
        label = 'Purchase';
        break;
      case 'sale':
        icon = Icons.arrow_upward;
        color = const Color(0xFF3B82F6);
        label = 'Sale';
        break;
      case 'transfer':
        icon = Icons.sync_alt;
        color = const Color(0xFF8B5CF6);
        label = 'Transfer';
        break;
      default:
        icon = Icons.remove;
        color = Colors.grey;
        label = 'Other';
    }
    
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: color,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
