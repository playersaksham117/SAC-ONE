
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';

/// Resolves unit price by tier, quantity breaks, and customer assignment.
class PricingEngine {
  static const tiers = ['retail', 'wholesale', 'contractor', 'bulk'];

  static Future<double> resolveUnitPrice({
    required String itemId,
    required double quantity,
    String? customerId,
    String? overrideTier,
  }) async {
    final db = await DatabaseManager.instance.database;
    String tier = overrideTier ?? 'retail';

    if (customerId != null && overrideTier == null) {
      final cTier = await db.query(
        'customer_price_tiers',
        where: 'customerId = ?',
        whereArgs: [customerId],
        limit: 1,
      );
      if (cTier.isNotEmpty) {
        tier = cTier.first['tier'] as String;
      } else {
        final customer = await db.query('customers', where: 'id = ?', whereArgs: [customerId], limit: 1);
        if (customer.isNotEmpty) tier = customer.first['priceTier'] as String? ?? 'retail';
      }
    }

    final now = DateTime.now().toIso8601String();
    final tierRows = await db.rawQuery('''
      SELECT unitPrice, minQty FROM price_tiers
      WHERE itemId = ? AND tier = ? AND isActive = 1
        AND (validFrom IS NULL OR validFrom <= ?)
        AND (validUntil IS NULL OR validUntil >= ?)
        AND minQty <= ?
      ORDER BY minQty DESC
      LIMIT 1
    ''', [itemId, tier, now, now, quantity]);

    if (tierRows.isNotEmpty) {
      return (tierRows.first['unitPrice'] as num).toDouble();
    }

    final item = await db.query('inventory_items', where: 'id = ?', whereArgs: [itemId], limit: 1);
    if (item.isEmpty) return 0;
    return (item.first['sellingPrice'] as num).toDouble();
  }

  static Future<void> upsertTierPrice({
    required String itemId,
    required String tier,
    required double unitPrice,
    double minQty = 1,
  }) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    final id = '${itemId}_${tier}_${minQty.toInt()}';

    await db.insert(
      'price_tiers',
      {
        'id': id,
        'itemId': itemId,
        'tier': tier,
        'minQty': minQty,
        'unitPrice': unitPrice,
        'isActive': 1,
        'createdAt': now,
        'updatedAt': now,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<List<Map<String, dynamic>>> getItemTiers(String itemId) async {
    final db = await DatabaseManager.instance.database;
    return db.query('price_tiers', where: 'itemId = ?', whereArgs: [itemId], orderBy: 'tier, minQty');
  }
}
