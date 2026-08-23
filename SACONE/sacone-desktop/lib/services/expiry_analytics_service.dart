import 'unified_database_manager.dart';

/// Expiry intelligence — near-expiry alerts and FEFO pick recommendations.
class ExpiryAnalyticsService {
  Future<List<Map<String, dynamic>>> getNearExpiryAlerts({int withinDays = 30}) async {
    final db = await DatabaseManager.instance.database;
    final until = DateTime.now().add(Duration(days: withinDays)).toIso8601String();
    final today = DateTime.now().toIso8601String();

    return db.rawQuery('''
      SELECT s.id, s.itemId, i.name, i.sku, s.warehouseId, s.quantity,
             s.expiryDate, s.batchNumber,
             CAST(julianday(s.expiryDate) - julianday(?) AS INTEGER) as daysLeft
      FROM stocks s
      JOIN inventory_items i ON i.id = s.itemId
      WHERE s.quantity > 0 AND s.expiryDate IS NOT NULL
        AND s.expiryDate <= ? AND s.expiryDate >= ?
      ORDER BY s.expiryDate ASC
    ''', [today, until, today]);
  }

  Future<List<Map<String, dynamic>>> getFefoRecommendations({
    required String itemId,
    required String warehouseId,
    required double quantity,
  }) async {
    final db = await DatabaseManager.instance.database;
    return db.rawQuery('''
      SELECT s.*, i.name, i.sku,
             COALESCE(s.expiryDate, '9999-12-31') as sortExpiry
      FROM stocks s
      JOIN inventory_items i ON i.id = s.itemId
      WHERE s.itemId = ? AND s.warehouseId = ? AND (s.quantity - COALESCE(s.reservedQty, 0)) > 0
      ORDER BY sortExpiry ASC, s.lastUpdated ASC
    ''', [itemId, warehouseId]);
  }

  Future<Map<String, dynamic>> getExpiryDashboardSummary() async {
    final db = await DatabaseManager.instance.database;
    final today = DateTime.now().toIso8601String();
    final d7 = DateTime.now().add(const Duration(days: 7)).toIso8601String();
    final d30 = DateTime.now().add(const Duration(days: 30)).toIso8601String();

    final expired = await db.rawQuery('''
      SELECT COUNT(*) as c, COALESCE(SUM(quantity),0) as qty
      FROM stocks WHERE expiryDate < ? AND quantity > 0
    ''', [today]);

    final week = await db.rawQuery('''
      SELECT COUNT(*) as c, COALESCE(SUM(quantity),0) as qty
      FROM stocks WHERE expiryDate >= ? AND expiryDate <= ? AND quantity > 0
    ''', [today, d7]);

    final month = await db.rawQuery('''
      SELECT COUNT(*) as c, COALESCE(SUM(quantity),0) as qty
      FROM stocks WHERE expiryDate > ? AND expiryDate <= ? AND quantity > 0
    ''', [d7, d30]);

    return {
      'expired': expired.first,
      'within7Days': week.first,
      'within30Days': month.first,
    };
  }
}
