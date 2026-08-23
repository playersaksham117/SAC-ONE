import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../services/unified_database_manager.dart';

/// Widget showing daily and monthly sales/purchase statistics
class SalesStatsWidget extends StatefulWidget {
  const SalesStatsWidget({super.key});

  @override
  State<SalesStatsWidget> createState() => _SalesStatsWidgetState();
}

class _SalesStatsWidgetState extends State<SalesStatsWidget> {
  bool _isLoading = true;
  String _viewMode = 'daily'; // 'daily' or 'monthly'
  
  // Daily stats
  double _todayPurchases = 0;
  double _todaySales = 0;
  double _todayPurchaseValue = 0;
  double _todaySalesValue = 0;
  
  // Monthly stats
  double _monthPurchases = 0;
  double _monthSales = 0;
  double _monthPurchaseValue = 0;
  double _monthSalesValue = 0;
  
  // Last 7 days data for chart
  List<Map<String, dynamic>> _last7DaysData = [];
  
  // Last 6 months data for chart
  List<Map<String, dynamic>> _last6MonthsData = [];

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final startOfMonth = DateTime(now.year, now.month, 1);
    
    // Today's stats
    final todayStats = await db.rawQuery('''
      SELECT 
        type,
        SUM(quantity) as totalQty,
        SUM(totalAmount) as totalValue
      FROM transactions
      WHERE date(transactionDate) = date(?)
      GROUP BY type
    ''', [startOfToday.toIso8601String()]);
    
    for (var stat in todayStats) {
      final type = stat['type'] as String?;
      final qty = (stat['totalQty'] as num? ?? 0).toDouble();
      final value = (stat['totalValue'] as num? ?? 0).toDouble();
      
      if (type == 'purchase') {
        _todayPurchases = qty;
        _todayPurchaseValue = value;
      } else if (type == 'sale') {
        _todaySales = qty;
        _todaySalesValue = value;
      }
    }
    
    // This month's stats
    final monthStats = await db.rawQuery('''
      SELECT 
        type,
        SUM(quantity) as totalQty,
        SUM(totalAmount) as totalValue
      FROM transactions
      WHERE date(transactionDate) >= date(?)
      GROUP BY type
    ''', [startOfMonth.toIso8601String()]);
    
    for (var stat in monthStats) {
      final type = stat['type'] as String?;
      final qty = (stat['totalQty'] as num? ?? 0).toDouble();
      final value = (stat['totalValue'] as num? ?? 0).toDouble();
      
      if (type == 'purchase') {
        _monthPurchases = qty;
        _monthPurchaseValue = value;
      } else if (type == 'sale') {
        _monthSales = qty;
        _monthSalesValue = value;
      }
    }
    
    // Last 7 days data
    _last7DaysData = [];
    for (int i = 6; i >= 0; i--) {
      final date = now.subtract(Duration(days: i));
      final startOfDay = DateTime(date.year, date.month, date.day);
      
      final dayStats = await db.rawQuery('''
        SELECT 
          type,
          SUM(quantity) as totalQty,
          SUM(totalAmount) as totalValue
        FROM transactions
        WHERE date(transactionDate) = date(?)
        GROUP BY type
      ''', [startOfDay.toIso8601String()]);
      
      double purchases = 0;
      double sales = 0;
      
      for (var stat in dayStats) {
        final type = stat['type'] as String?;
        final qty = (stat['totalQty'] as num? ?? 0).toDouble();
        
        if (type == 'purchase') {
          purchases = qty;
        } else if (type == 'sale') {
          sales = qty;
        }
      }
      
      _last7DaysData.add({
        'date': date,
        'purchases': purchases,
        'sales': sales,
      });
    }
    
    // Last 6 months data
    _last6MonthsData = [];
    for (int i = 5; i >= 0; i--) {
      final date = DateTime(now.year, now.month - i, 1);
      final endOfMonth = DateTime(date.year, date.month + 1, 0);
      
      final monthStats = await db.rawQuery('''
        SELECT 
          type,
          SUM(quantity) as totalQty,
          SUM(totalAmount) as totalValue
        FROM transactions
        WHERE date(transactionDate) >= date(?) AND date(transactionDate) <= date(?)
        GROUP BY type
      ''', [date.toIso8601String(), endOfMonth.toIso8601String()]);
      
      double purchases = 0;
      double sales = 0;
      double purchaseValue = 0;
      double salesValue = 0;
      
      for (var stat in monthStats) {
        final type = stat['type'] as String?;
        final qty = (stat['totalQty'] as num? ?? 0).toDouble();
        final value = (stat['totalValue'] as num? ?? 0).toDouble();
        
        if (type == 'purchase') {
          purchases = qty;
          purchaseValue = value;
        } else if (type == 'sale') {
          sales = qty;
          salesValue = value;
        }
      }
      
      _last6MonthsData.add({
        'date': date,
        'purchases': purchases,
        'sales': sales,
        'purchaseValue': purchaseValue,
        'salesValue': salesValue,
      });
    }
    
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

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
          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.analytics, color: Color(0xFF10B981), size: 20),
              ),
              const SizedBox(width: 12),
              const Text(
                'Sales & Purchases',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const Spacer(),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'daily', label: Text('Daily')),
                  ButtonSegment(value: 'monthly', label: Text('Monthly')),
                ],
                selected: {_viewMode},
                onSelectionChanged: (Set<String> newSelection) {
                  setState(() => _viewMode = newSelection.first);
                },
                style: ButtonStyle(
                  textStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          
          // Stats Cards
          if (_viewMode == 'daily')
            _buildDailyStats()
          else
            _buildMonthlyStats(),
          
          const SizedBox(height: 20),
          
          // Chart
          SizedBox(
            height: 200,
            child: _viewMode == 'daily' ? _buildDailyChart() : _buildMonthlyChart(),
          ),
        ],
      ),
    );
  }

  Widget _buildDailyStats() {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            'Today\'s Purchases',
            '${_todayPurchases.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_todayPurchaseValue),
            Icons.add_shopping_cart,
            const Color(0xFF10B981),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildStatCard(
            'Today\'s Sales',
            '${_todaySales.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_todaySalesValue),
            Icons.shopping_cart,
            const Color(0xFF3B82F6),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildStatCard(
            'Net Movement',
            '${(_todayPurchases - _todaySales).toInt()} units',
            _todayPurchases >= _todaySales ? 'Stock up' : 'Stock down',
            _todayPurchases >= _todaySales ? Icons.trending_up : Icons.trending_down,
            _todayPurchases >= _todaySales ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        ),
      ],
    );
  }

  Widget _buildMonthlyStats() {
    final monthName = DateFormat('MMMM').format(DateTime.now());
    
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            '$monthName Purchases',
            '${_monthPurchases.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_monthPurchaseValue),
            Icons.add_shopping_cart,
            const Color(0xFF10B981),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildStatCard(
            '$monthName Sales',
            '${_monthSales.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_monthSalesValue),
            Icons.shopping_cart,
            const Color(0xFF3B82F6),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildStatCard(
            'Net Movement',
            '${(_monthPurchases - _monthSales).toInt()} units',
            _monthPurchases >= _monthSales ? 'Stock up' : 'Stock down',
            _monthPurchases >= _monthSales ? Icons.trending_up : Icons.trending_down,
            _monthPurchases >= _monthSales ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(
    String title,
    String value,
    String subtitle,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 8),
              Text(
                title,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDailyChart() {
    if (_last7DaysData.isEmpty) {
      return Center(
        child: Text(
          'No data available',
          style: TextStyle(color: Colors.grey.shade500),
        ),
      );
    }

    double maxY = 0;
    for (var data in _last7DaysData) {
      final purchases = (data['purchases'] as num).toDouble();
      final sales = (data['sales'] as num).toDouble();
      if (purchases > maxY) maxY = purchases;
      if (sales > maxY) maxY = sales;
    }
    maxY = maxY == 0 ? 10 : maxY * 1.2;

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY,
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            tooltipPadding: const EdgeInsets.all(8),
            tooltipMargin: 8,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final value = rod.toY.toInt();
              final label = rodIndex == 0 ? 'Purchases' : 'Sales';
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
                final index = value.toInt();
                if (index < 0 || index >= _last7DaysData.length) return const SizedBox();
                final date = _last7DaysData[index]['date'] as DateTime;
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
          getDrawingHorizontalLine: (value) => FlLine(
            color: Colors.grey.shade200,
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        barGroups: _last7DaysData.asMap().entries.map((entry) {
          final index = entry.key;
          final data = entry.value;
          return BarChartGroupData(
            x: index,
            barRods: [
              BarChartRodData(
                toY: (data['purchases'] as num).toDouble(),
                color: const Color(0xFF10B981),
                width: 10,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(4),
                ),
              ),
              BarChartRodData(
                toY: (data['sales'] as num).toDouble(),
                color: const Color(0xFF3B82F6),
                width: 10,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(4),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildMonthlyChart() {
    if (_last6MonthsData.isEmpty) {
      return Center(
        child: Text(
          'No data available',
          style: TextStyle(color: Colors.grey.shade500),
        ),
      );
    }

    double maxY = 0;
    for (var data in _last6MonthsData) {
      final purchases = (data['purchases'] as num).toDouble();
      final sales = (data['sales'] as num).toDouble();
      if (purchases > maxY) maxY = purchases;
      if (sales > maxY) maxY = sales;
    }
    maxY = maxY == 0 ? 10 : maxY * 1.2;

    return LineChart(
      LineChartData(
        minY: 0,
        maxY: maxY,
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touchedSpots) {
              return touchedSpots.map((spot) {
                final label = spot.barIndex == 0 ? 'Purchases' : 'Sales';
                final color = spot.barIndex == 0 ? const Color(0xFF10B981) : const Color(0xFF3B82F6);
                return LineTooltipItem(
                  '$label: ${spot.y.toInt()}',
                  TextStyle(color: color, fontWeight: FontWeight.w600),
                );
              }).toList();
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index < 0 || index >= _last6MonthsData.length) return const SizedBox();
                final date = _last6MonthsData[index]['date'] as DateTime;
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    DateFormat('MMM').format(date),
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
          getDrawingHorizontalLine: (value) => FlLine(
            color: Colors.grey.shade200,
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          // Purchases line
          LineChartBarData(
            spots: _last6MonthsData.asMap().entries.map((entry) {
              return FlSpot(entry.key.toDouble(), (entry.value['purchases'] as num).toDouble());
            }).toList(),
            isCurved: true,
            color: const Color(0xFF10B981),
            barWidth: 3,
            isStrokeCapRound: true,
            dotData: FlDotData(
              show: true,
              getDotPainter: (spot, percent, barData, index) {
                return FlDotCirclePainter(
                  radius: 4,
                  color: const Color(0xFF10B981),
                  strokeWidth: 2,
                  strokeColor: Colors.white,
                );
              },
            ),
            belowBarData: BarAreaData(
              show: true,
              color: const Color(0xFF10B981).withValues(alpha: 0.1),
            ),
          ),
          // Sales line
          LineChartBarData(
            spots: _last6MonthsData.asMap().entries.map((entry) {
              return FlSpot(entry.key.toDouble(), (entry.value['sales'] as num).toDouble());
            }).toList(),
            isCurved: true,
            color: const Color(0xFF3B82F6),
            barWidth: 3,
            isStrokeCapRound: true,
            dotData: FlDotData(
              show: true,
              getDotPainter: (spot, percent, barData, index) {
                return FlDotCirclePainter(
                  radius: 4,
                  color: const Color(0xFF3B82F6),
                  strokeWidth: 2,
                  strokeColor: Colors.white,
                );
              },
            ),
            belowBarData: BarAreaData(
              show: true,
              color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact widget for cell stock overview
class CellStockOverviewWidget extends StatefulWidget {
  const CellStockOverviewWidget({super.key});

  @override
  State<CellStockOverviewWidget> createState() => _CellStockOverviewWidgetState();
}

class _CellStockOverviewWidgetState extends State<CellStockOverviewWidget> {
  List<Map<String, dynamic>> _cellSummary = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadCellSummary();
  }

  Future<void> _loadCellSummary() async {
    final db = await DatabaseManager.instance.database;
    
    final results = await db.rawQuery('''
      SELECT 
        c.id as cellId,
        c.name as cellName,
        c.code as cellCode,
        w.name as warehouseName,
        COUNT(DISTINCT s.itemId) as productCount,
        SUM(s.quantity) as totalQuantity
      FROM cells c
      JOIN warehouses w ON c.warehouseId = w.id
      LEFT JOIN stocks s ON s.cellId = c.id AND s.quantity > 0
      GROUP BY c.id
      ORDER BY totalQuantity DESC
      LIMIT 8
    ''');
    
    setState(() {
      _cellSummary = results.cast<Map<String, dynamic>>();
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
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
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.grid_view, color: Color(0xFF8B5CF6), size: 20),
              ),
              const SizedBox(width: 12),
              const Text(
                'Cell Stock Overview',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () {
                  // Navigate to stock locations
                },
                child: const Text('View All'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          
          if (_isLoading)
            const Center(child: CircularProgressIndicator())
          else if (_cellSummary.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Icon(Icons.grid_off, size: 40, color: Colors.grey.shade300),
                    const SizedBox(height: 8),
                    Text(
                      'No cells with stock',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            )
          else
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: _cellSummary.map((cell) {
                final productCount = cell['productCount'] as int? ?? 0;
                final totalQty = (cell['totalQuantity'] as num? ?? 0).toDouble();
                
                return Container(
                  width: 180,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(
                              Icons.inventory_2,
                              size: 14,
                              color: Color(0xFF8B5CF6),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              cell['cellCode'] as String? ?? 'N/A',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF0F172A),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        cell['cellName'] as String? ?? '',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '$productCount items',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF3B82F6),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Text(
                            '${totalQty.toInt()} units',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF10B981),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}
