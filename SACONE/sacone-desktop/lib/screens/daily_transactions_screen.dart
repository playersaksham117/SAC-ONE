import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/warehouse_provider.dart';
import '../services/unified_database_manager.dart';

/// Screen showing daily transaction logs
/// Displays purchases, sales, transfers, and adjustments per day
class DailyTransactionsScreen extends StatefulWidget {
  const DailyTransactionsScreen({super.key});

  @override
  State<DailyTransactionsScreen> createState() => _DailyTransactionsScreenState();
}

class _DailyTransactionsScreenState extends State<DailyTransactionsScreen> {
  DateTime _selectedDate = DateTime.now();
  String _selectedType = 'all';
  String? _selectedWarehouseId;
  List<Map<String, dynamic>> _dailyTransactions = [];
  bool _isLoading = false;
  
  // Summary data
  double _totalPurchases = 0;
  double _totalSales = 0;
  double _totalPurchaseValue = 0;
  double _totalSalesValue = 0;
  int _transactionCount = 0;

  @override
  void initState() {
    super.initState();
    _loadTransactions();
  }

  Future<void> _loadTransactions() async {
    setState(() => _isLoading = true);
    
    final db = await DatabaseManager.instance.database;
    
    final startOfDay = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    
    String query = '''
      SELECT 
        t.id,
        t.type,
        t.itemId,
        t.warehouseId,
        t.locationId,
        t.quantity,
        t.unitPrice,
        t.totalAmount,
        t.referenceNumber,
        t.supplier,
        t.customer,
        t.notes,
        t.transactionDate,
        t.createdAt,
        i.name as itemName,
        i.sku,
        i.unit,
        i.category,
        w.name as warehouseName,
        c.name as cellName,
        c.code as cellCode
      FROM transactions t
      JOIN inventory_items i ON t.itemId = i.id
      JOIN warehouses w ON t.warehouseId = w.id
      LEFT JOIN cells c ON t.locationId = c.id
      WHERE date(t.transactionDate) = date(?)
    ''';
    
    List<dynamic> args = [startOfDay.toIso8601String()];
    
    if (_selectedType != 'all') {
      query += ' AND t.type = ?';
      args.add(_selectedType);
    }
    
    if (_selectedWarehouseId != null) {
      query += ' AND t.warehouseId = ?';
      args.add(_selectedWarehouseId);
    }
    
    query += ' ORDER BY t.transactionDate DESC';
    
    final results = await db.rawQuery(query, args);
    
    // Calculate summaries
    double purchases = 0;
    double sales = 0;
    double purchaseValue = 0;
    double salesValue = 0;
    
    for (var t in results) {
      final type = t['type'] as String?;
      final qty = (t['quantity'] as num? ?? 0).toDouble();
      final amount = (t['totalAmount'] as num? ?? 0).toDouble();
      
      if (type == 'purchase') {
        purchases += qty;
        purchaseValue += amount;
      } else if (type == 'sale') {
        sales += qty;
        salesValue += amount;
      }
    }
    
    setState(() {
      _dailyTransactions = results.cast<Map<String, dynamic>>();
      _totalPurchases = purchases;
      _totalSales = sales;
      _totalPurchaseValue = purchaseValue;
      _totalSalesValue = salesValue;
      _transactionCount = results.length;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _buildTopBar(context),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Date Navigation & Filters
                  _buildDateNavigation(),
                  const SizedBox(height: 24),
                  
                  // Daily Summary Cards
                  _buildDailySummary(),
                  const SizedBox(height: 24),
                  
                  // Transaction List
                  _buildTransactionList(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
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
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.calendar_today, color: Color(0xFF6366F1), size: 24),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Daily Log',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF0F172A),
                        ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'VIEW ONLY',
                          style: TextStyle(
                            color: Color(0xFF6366F1),
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'View daily stock movements and transaction history',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: () {
              _loadTransactions();
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
              _showExportDialog();
            },
            icon: const Icon(Icons.file_download, size: 18),
            label: const Text('Export'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDateNavigation() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          // Date Navigator
          IconButton(
            onPressed: () {
              setState(() {
                _selectedDate = _selectedDate.subtract(const Duration(days: 1));
              });
              _loadTransactions();
            },
            icon: const Icon(Icons.chevron_left),
            style: IconButton.styleFrom(
              backgroundColor: Colors.grey.shade100,
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: _selectedDate,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
              );
              if (date != null) {
                setState(() => _selectedDate = date);
                _loadTransactions();
              }
            },
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today, size: 18, color: Color(0xFF2563EB)),
                  const SizedBox(width: 8),
                  Text(
                    DateFormat('EEEE, MMMM d, yyyy').format(_selectedDate),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _selectedDate.isBefore(DateTime.now().subtract(const Duration(days: 1)))
                ? () {
                    setState(() {
                      _selectedDate = _selectedDate.add(const Duration(days: 1));
                    });
                    _loadTransactions();
                  }
                : null,
            icon: const Icon(Icons.chevron_right),
            style: IconButton.styleFrom(
              backgroundColor: Colors.grey.shade100,
            ),
          ),
          const SizedBox(width: 16),
          TextButton(
            onPressed: () {
              setState(() => _selectedDate = DateTime.now());
              _loadTransactions();
            },
            child: const Text('Today'),
          ),
          
          const Spacer(),
          
          // Filters
          Consumer<WarehouseProvider>(
            builder: (context, warehouseProvider, _) {
              return DropdownButton<String?>(
                value: _selectedWarehouseId,
                hint: const Text('All Warehouses'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('All Warehouses')),
                  ...warehouseProvider.warehouses.map((w) => DropdownMenuItem(
                        value: w.id,
                        child: Text(w.name),
                      )),
                ],
                onChanged: (value) {
                  setState(() => _selectedWarehouseId = value);
                  _loadTransactions();
                },
              );
            },
          ),
          const SizedBox(width: 16),
          
          // Type Filter
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'all', label: Text('All')),
              ButtonSegment(value: 'purchase', label: Text('Purchases')),
              ButtonSegment(value: 'sale', label: Text('Sales')),
              ButtonSegment(value: 'transfer', label: Text('Transfers')),
            ],
            selected: {_selectedType},
            onSelectionChanged: (Set<String> newSelection) {
              setState(() => _selectedType = newSelection.first);
              _loadTransactions();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildDailySummary() {
    final isToday = DateFormat('yyyy-MM-dd').format(_selectedDate) == 
                    DateFormat('yyyy-MM-dd').format(DateTime.now());
    
    return Row(
      children: [
        // Transactions Count
        Expanded(
          child: _buildSummaryCard(
            'Total Transactions',
            _transactionCount.toString(),
            'Activity ${isToday ? "today" : "on this day"}',
            Icons.receipt_long,
            const Color(0xFF3B82F6),
          ),
        ),
        const SizedBox(width: 16),
        
        // Purchases
        Expanded(
          child: _buildSummaryCard(
            'Purchases',
            '${_totalPurchases.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_totalPurchaseValue),
            Icons.add_shopping_cart,
            const Color(0xFF10B981),
          ),
        ),
        const SizedBox(width: 16),
        
        // Sales
        Expanded(
          child: _buildSummaryCard(
            'Sales',
            '${_totalSales.toInt()} units',
            NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(_totalSalesValue),
            Icons.shopping_cart,
            const Color(0xFF8B5CF6),
          ),
        ),
        const SizedBox(width: 16),
        
        // Net Movement
        Expanded(
          child: _buildSummaryCard(
            'Net Movement',
            '${(_totalPurchases - _totalSales).toInt()} units',
            _totalPurchases >= _totalSales ? 'Stock increased' : 'Stock decreased',
            _totalPurchases >= _totalSales ? Icons.trending_up : Icons.trending_down,
            _totalPurchases >= _totalSales ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(
    String title,
    String value,
    String subtitle,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
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
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 11,
                    color: color,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionList() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    // Group transactions by hour
    final Map<int, List<Map<String, dynamic>>> groupedByHour = {};
    for (var t in _dailyTransactions) {
      final date = DateTime.parse(t['transactionDate'] as String);
      final hour = date.hour;
      if (!groupedByHour.containsKey(hour)) {
        groupedByHour[hour] = [];
      }
      groupedByHour[hour]!.add(t);
    }

    final sortedHours = groupedByHour.keys.toList()..sort((a, b) => b.compareTo(a));

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.history, color: Color(0xFF64748B), size: 20),
                const SizedBox(width: 8),
                const Text(
                  'Transaction Timeline',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const Spacer(),
                Text(
                  '${_dailyTransactions.length} transactions',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: Colors.grey.shade200),
          
          if (_dailyTransactions.isEmpty)
            _buildEmptyState()
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: sortedHours.length,
              itemBuilder: (context, index) {
                final hour = sortedHours[index];
                final transactions = groupedByHour[hour]!;
                
                return _buildHourGroup(hour, transactions);
              },
            ),
        ],
      ),
    );
  }

  Widget _buildHourGroup(int hour, List<Map<String, dynamic>> transactions) {
    final timeStr = hour == 0 
        ? '12:00 AM' 
        : (hour < 12 ? '$hour:00 AM' : (hour == 12 ? '12:00 PM' : '${hour - 12}:00 PM'));
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: const Color(0xFFF8FAFC),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  timeStr,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF2563EB),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${transactions.length} transactions',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
        ...transactions.map((t) => _buildTransactionRow(t)),
      ],
    );
  }

  Widget _buildTransactionRow(Map<String, dynamic> transaction) {
    final type = transaction['type'] as String? ?? 'other';
    final quantity = (transaction['quantity'] as num? ?? 0).toDouble();
    final totalAmount = (transaction['totalAmount'] as num? ?? 0).toDouble();
    final transactionDate = DateTime.parse(transaction['transactionDate'] as String);
    
    IconData icon;
    Color color;
    String typeLabel;
    
    switch (type) {
      case 'purchase':
        icon = Icons.add_shopping_cart;
        color = const Color(0xFF10B981);
        typeLabel = 'PURCHASE';
        break;
      case 'sale':
        icon = Icons.shopping_cart;
        color = const Color(0xFF3B82F6);
        typeLabel = 'SALE';
        break;
      case 'transfer':
        icon = Icons.sync_alt;
        color = const Color(0xFF8B5CF6);
        typeLabel = 'TRANSFER';
        break;
      default:
        icon = Icons.edit;
        color = const Color(0xFFF59E0B);
        typeLabel = 'ADJUSTMENT';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade100),
        ),
      ),
      child: Row(
        children: [
          // Type Icon
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 16),
          
          // Item Details
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        typeLabel,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      DateFormat('HH:mm').format(transactionDate),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  transaction['itemName'] as String? ?? 'Unknown Item',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'SKU: ${transaction['sku'] ?? 'N/A'}',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          
          // Location
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.warehouse, size: 14, color: Colors.grey.shade500),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        transaction['warehouseName'] as String? ?? 'N/A',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                if (transaction['cellName'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      children: [
                        Icon(Icons.grid_view, size: 14, color: Colors.grey.shade500),
                        const SizedBox(width: 4),
                        Text(
                          '${transaction['cellName']} (${transaction['cellCode']})',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (transaction['supplier'] != null || transaction['customer'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      children: [
                        Icon(Icons.person, size: 14, color: Colors.grey.shade500),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            transaction['supplier'] ?? transaction['customer'] ?? '',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          
          // Quantity
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${type == 'purchase' ? '+' : '-'}${quantity.toInt()}',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: type == 'purchase' ? const Color(0xFF10B981) : const Color(0xFF3B82F6),
                  ),
                ),
                Text(
                  transaction['unit'] as String? ?? 'units',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          
          // Amount
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  NumberFormat.currency(symbol: '₹', locale: 'en_IN', decimalDigits: 2).format(totalAmount),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                if (transaction['referenceNumber'] != null)
                  Text(
                    'Ref: ${transaction['referenceNumber']}',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.grey.shade500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.all(60),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long_outlined, size: 80, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              'No transactions on this day',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Select a different date or add some transactions',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showExportDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Export Transactions'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.table_chart),
              title: const Text('Export as Excel'),
              onTap: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Excel export coming soon!')),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf),
              title: const Text('Export as PDF'),
              onTap: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('PDF export coming soon!')),
                );
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
