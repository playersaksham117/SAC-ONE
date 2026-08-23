import 'unified_database_manager.dart';

/// Dead stock and aging analytics.
class DeadStockAnalyticsService {
  Future<List<Map<String, dynamic>>> getUnsoldProducts({int inactiveDays = 90}) async {
    final db = await DatabaseManager.instance.database;
    final cutoff = DateTime.now().subtract(Duration(days: inactiveDays)).toIso8601String();

    return db.rawQuery('''
      SELECT i.id, i.name, i.sku, i.category,
             COALESCE(SUM(s.quantity), 0) as onHand,
             COALESCE(i.costPrice, 0) * COALESCE(SUM(s.quantity), 0) as tiedUpValue,
             MAX(sl.createdAt) as lastSaleDate
      FROM inventory_items i
      LEFT JOIN stocks s ON s.itemId = i.id
      LEFT JOIN sale_lines sl ON sl.itemId = i.id
      WHERE i.isActive = 1
      GROUP BY i.id
      HAVING onHand > 0 AND (lastSaleDate IS NULL OR lastSaleDate < ?)
      ORDER BY tiedUpValue DESC
      LIMIT 100
    ''', [cutoff]);
  }

  Future<List<Map<String, dynamic>>> getAgingStockReport() async {
    final db = await DatabaseManager.instance.database;
    return db.rawQuery('''
      SELECT i.id, i.name, i.sku, i.category,
             COALESCE(SUM(s.quantity), 0) as onHand,
             MIN(s.lastUpdated) as oldestStockDate,
             MAX(sl.createdAt) as lastSaleDate
      FROM inventory_items i
      LEFT JOIN stocks s ON s.itemId = i.id AND s.quantity > 0
      LEFT JOIN sale_lines sl ON sl.itemId = i.id
      WHERE i.isActive = 1
      GROUP BY i.id
      HAVING onHand > 0
      ORDER BY oldestStockDate ASC
      LIMIT 100
    ''');
  }

  Future<List<Map<String, dynamic>>> classifyAgingBuckets() async {
    final items = await getAgingStockReport();
    final buckets = {'0-30': 0, '31-60': 0, '61-90': 0, '90+': 0};
    final now = DateTime.now();

    for (final item in items) {
      final lastSale = item['lastSaleDate'] as String?;
      final days = lastSale == null
          ? 999
          : now.difference(DateTime.parse(lastSale)).inDays;

      if (days <= 30) {
        buckets['0-30'] = buckets['0-30']! + 1;
      } else if (days <= 60) {
        buckets['31-60'] = buckets['31-60']! + 1;
      } else if (days <= 90) {
        buckets['61-90'] = buckets['61-90']! + 1;
      } else {
        buckets['90+'] = buckets['90+']! + 1;
      }
    }

    return buckets.entries.map((e) => {'bucket': e.key, 'count': e.value}).toList();
  }
}
