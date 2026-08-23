import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

/// Enhanced Dashboard Chart Widgets
/// 
/// CHART COMPONENTS:
/// 1. InventoryMovementLineChart - Time series showing IN vs OUT flow
/// 2. CategoryDistributionDonutChart - Proportional breakdown by category
/// 3. WarehouseComparisonBarChart - Side-by-side warehouse stock levels
/// 4. StockHealthIndicator - Low/Critical stock visual gauge
///
/// DESIGN RATIONALE:
/// - Line charts for temporal trends (better than bar for continuous data)
/// - Donut charts for part-to-whole relationships (cleaner than pie)
/// - Horizontal bars for warehouse comparison (better label readability)
/// - Color-coded health indicators (red/amber/green convention)

class InventoryMovementLineChart extends StatelessWidget {
  final Map<DateTime, double> incomingData;
  final Map<DateTime, double> outgoingData;

  const InventoryMovementLineChart({
    super.key,
    required this.incomingData,
    required this.outgoingData,
  });

  @override
  Widget build(BuildContext context) {
    if (incomingData.isEmpty && outgoingData.isEmpty) {
      return _buildEmptyState('No movement data available', Icons.trending_up);
    }

    final allDates = {...incomingData.keys, ...outgoingData.keys}.toList()..sort();

    return Padding(
      padding: const EdgeInsets.only(right: 16, top: 16),
      child: LineChart(
        LineChartData(
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
          titlesData: FlTitlesData(
            show: true,
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 32,
                interval: 1,
                getTitlesWidget: (value, meta) {
                  if (value.toInt() >= allDates.length) return const SizedBox.shrink();
                  final date = allDates[value.toInt()];
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      DateFormat('MMM dd').format(date),
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
          borderData: FlBorderData(show: false),
          minX: 0,
          maxX: (allDates.length - 1).toDouble(),
          minY: 0,
          maxY: _getMaxY() * 1.2,
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(

              tooltipPadding: const EdgeInsets.all(12),
              tooltipMargin: 8,
              getTooltipItems: (touchedSpots) {
                return touchedSpots.map((spot) {
                  final date = allDates[spot.x.toInt()];
                  final label = spot.barIndex == 0 ? 'Incoming' : 'Outgoing';
                  return LineTooltipItem(
                    '$label\n${DateFormat('MMM dd').format(date)}\n${spot.y.toInt()} units',
                    const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  );
                }).toList();
              },
            ),
          ),
          lineBarsData: [
            // Incoming line
            LineChartBarData(
              spots: _generateSpots(incomingData, allDates),
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
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF10B981).withValues(alpha: 0.3),
                    const Color(0xFF10B981).withValues(alpha: 0.0),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
            // Outgoing line
            LineChartBarData(
              spots: _generateSpots(outgoingData, allDates),
              isCurved: true,
              color: const Color(0xFFEF4444),
              barWidth: 3,
              isStrokeCapRound: true,
              dotData: FlDotData(
                show: true,
                getDotPainter: (spot, percent, barData, index) {
                  return FlDotCirclePainter(
                    radius: 4,
                    color: const Color(0xFFEF4444),
                    strokeWidth: 2,
                    strokeColor: Colors.white,
                  );
                },
              ),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFFEF4444).withValues(alpha: 0.3),
                    const Color(0xFFEF4444).withValues(alpha: 0.0),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<FlSpot> _generateSpots(Map<DateTime, double> data, List<DateTime> allDates) {
    return allDates.asMap().entries.map((entry) {
      final index = entry.key;
      final date = entry.value;
      final value = data[date] ?? 0;
      return FlSpot(index.toDouble(), value);
    }).toList();
  }

  double _getMaxY() {
    double max = 0;
    for (var value in incomingData.values) {
      if (value > max) max = value;
    }
    for (var value in outgoingData.values) {
      if (value > max) max = value;
    }
    return max == 0 ? 10 : max;
  }

  Widget _buildEmptyState(String message, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: Colors.grey.shade300),
          const SizedBox(height: 12),
          Text(
            message,
            style: TextStyle(color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }
}

class CategoryDistributionDonutChart extends StatelessWidget {
  final Map<String, double> categoryData;
  final Map<String, Color> categoryColors;

  const CategoryDistributionDonutChart({
    super.key,
    required this.categoryData,
    required this.categoryColors,
  });

  @override
  Widget build(BuildContext context) {
    if (categoryData.isEmpty) {
      return _buildEmptyState('No category data available', Icons.category);
    }

    final total = categoryData.values.reduce((a, b) => a + b);
    final sections = categoryData.entries.map((entry) {
      final percentage = (entry.value / total * 100);
      final color = categoryColors[entry.key] ?? Colors.grey;

      return PieChartSectionData(
        value: entry.value,
        title: '${percentage.toStringAsFixed(0)}%',
        color: color,
        radius: 70,
        titleStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
        badgeWidget: percentage < 5 ? null : null, // Hide labels for small slices
      );
    }).toList();

    return Row(
      children: [
        // Donut Chart
        Expanded(
          flex: 3,
          child: PieChart(
            PieChartData(
              sections: sections,
              sectionsSpace: 3,
              centerSpaceRadius: 60,
              pieTouchData: PieTouchData(
                touchCallback: (FlTouchEvent event, pieTouchResponse) {},
              ),
            ),
          ),
        ),
        // Legend
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: categoryData.entries.map((entry) {
              final color = categoryColors[entry.key] ?? Colors.grey;
              final percentage = (entry.value / total * 100).toStringAsFixed(1);
              
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            entry.key,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '$percentage% • ${entry.value.toInt()} items',
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

  Widget _buildEmptyState(String message, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: Colors.grey.shade300),
          const SizedBox(height: 12),
          Text(
            message,
            style: TextStyle(color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }
}

class WarehouseComparisonBarChart extends StatelessWidget {
  final Map<String, double> warehouseData;
  final Map<String, String> warehouseNames;

  const WarehouseComparisonBarChart({
    super.key,
    required this.warehouseData,
    required this.warehouseNames,
  });

  @override
  Widget build(BuildContext context) {
    if (warehouseData.isEmpty) {
      return _buildEmptyState('No warehouse data available', Icons.warehouse);
    }

    final sortedEntries = warehouseData.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final colors = [
      const Color(0xFF3B82F6),
      const Color(0xFF8B5CF6),
      const Color(0xFF10B981),
      const Color(0xFFF59E0B),
      const Color(0xFFEF4444),
      const Color(0xFF06B6D4),
    ];

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: _getMaxY() * 1.2,
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            tooltipPadding: const EdgeInsets.all(10),
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final warehouseId = sortedEntries[group.x.toInt()].key;
              final name = warehouseNames[warehouseId] ?? 'Unknown';
              return BarTooltipItem(
                '$name\n${rod.toY.toInt()} units',
                const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              );
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (value, meta) {
                if (value.toInt() >= sortedEntries.length) {
                  return const SizedBox.shrink();
                }
                final warehouseId = sortedEntries[value.toInt()].key;
                final name = warehouseNames[warehouseId] ?? 'Unknown';
                
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    name.length > 10 ? '${name.substring(0, 10)}...' : name,
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                );
              },
            ),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 50,
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
        barGroups: sortedEntries.asMap().entries.map((entry) {
          final index = entry.key;
          final value = entry.value.value;
          final color = colors[index % colors.length];

          return BarChartGroupData(
            x: index,
            barRods: [
              BarChartRodData(
                toY: value,
                color: color,
                width: 32,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(6),
                ),
                gradient: LinearGradient(
                  colors: [
                    color,
                    color.withValues(alpha: 0.7),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  double _getMaxY() {
    if (warehouseData.isEmpty) return 10;
    return warehouseData.values.reduce((a, b) => a > b ? a : b);
  }

  Widget _buildEmptyState(String message, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: Colors.grey.shade300),
          const SizedBox(height: 12),
          Text(
            message,
            style: TextStyle(color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }
}

class StockHealthIndicator extends StatelessWidget {
  final int totalItems;
  final int lowStockItems;
  final int criticalStockItems;

  const StockHealthIndicator({
    super.key,
    required this.totalItems,
    required this.lowStockItems,
    required this.criticalStockItems,
  });

  @override
  Widget build(BuildContext context) {
    final healthyItems = totalItems - lowStockItems - criticalStockItems;
    final healthyPercent = totalItems > 0 ? (healthyItems / totalItems * 100) : 0;
    final lowPercent = totalItems > 0 ? (lowStockItems / totalItems * 100) : 0;
    final criticalPercent = totalItems > 0 ? (criticalStockItems / totalItems * 100) : 0;

    return Column(
      children: [
        // Progress Bar
        Container(
          height: 32,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: Colors.grey.shade100,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Row(
              children: [
                if (healthyPercent > 0)
                  Flexible(
                    flex: healthyPercent.toInt(),
                    child: Container(color: const Color(0xFF10B981)),
                  ),
                if (lowPercent > 0)
                  Flexible(
                    flex: lowPercent.toInt(),
                    child: Container(color: const Color(0xFFF59E0B)),
                  ),
                if (criticalPercent > 0)
                  Flexible(
                    flex: criticalPercent.toInt(),
                    child: Container(color: const Color(0xFFEF4444)),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        // Legend
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildLegendItem(
              'Healthy',
              healthyItems,
              const Color(0xFF10B981),
            ),
            _buildLegendItem(
              'Low Stock',
              lowStockItems,
              const Color(0xFFF59E0B),
            ),
            _buildLegendItem(
              'Critical',
              criticalStockItems,
              const Color(0xFFEF4444),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildLegendItem(String label, int count, Color color) {
    return Column(
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Color(0xFF64748B),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          count.toString(),
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }
}
