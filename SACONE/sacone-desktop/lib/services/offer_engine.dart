import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../models/retail_models.dart';
import 'unified_database_manager.dart';
import 'audit_service.dart';

/// Applies offers, combos, buy-X-get-Y, coupons, and time-based discounts.
class OfferEngine {
  static const _uuid = Uuid();

  Future<List<Map<String, dynamic>>> getActiveOffers() async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    return db.rawQuery('''
      SELECT * FROM offers
      WHERE isActive = 1 AND startDate <= ?
        AND (endDate IS NULL OR endDate >= ?)
      ORDER BY priority DESC
    ''', [now, now]);
  }

  Future<Map<String, dynamic>> applyOffers({
    required List<PosCartItem> cart,
    String? couponCode,
  }) async {
    double discount = 0;
    final applied = <String>[];
    final offers = await getActiveOffers();
    final now = DateTime.now();

    for (final offer in offers) {
      final config = jsonDecode(offer['configJson'] as String) as Map<String, dynamic>;
      final type = offer['offerType'] as String;

      if (type == 'percent_off') {
        final percent = (config['percent'] as num?)?.toDouble() ?? 0;
        final d = cart.fold(0.0, (s, i) => s + i.lineSubtotal) * percent / 100;
        discount += d;
        applied.add('${offer['name']}: $percent% off');
      } else if (type == 'buy_x_get_y') {
        final buyQty = (config['buyQty'] as num?)?.toInt() ?? 2;
        final freeQty = (config['freeQty'] as num?)?.toInt() ?? 1;
        final itemId = config['itemId'] as String?;
        for (final line in cart) {
          if (itemId != null && line.itemId != itemId) continue;
          final sets = (line.quantity / buyQty).floor();
          discount += sets * freeQty * line.unitPrice;
          if (sets > 0) applied.add('${offer['name']}: buy $buyQty get $freeQty');
        }
      } else if (type == 'combo') {
        final requiredIds = (config['itemIds'] as List?)?.cast<String>() ?? [];
        if (requiredIds.isEmpty) continue;
        final hasAll = requiredIds.every((id) => cart.any((c) => c.itemId == id && c.quantity >= 1));
        if (hasAll) {
          final comboDiscount = (config['discount'] as num?)?.toDouble() ?? 0;
          discount += comboDiscount;
          applied.add('${offer['name']}: combo -₹$comboDiscount');
        }
      } else if (type == 'time_based') {
        final startHour = (config['startHour'] as num?)?.toInt() ?? 0;
        final endHour = (config['endHour'] as num?)?.toInt() ?? 23;
        if (now.hour >= startHour && now.hour <= endHour) {
          final percent = (config['percent'] as num?)?.toDouble() ?? 0;
          discount += cart.fold(0.0, (s, i) => s + i.lineSubtotal) * percent / 100;
          applied.add('${offer['name']}: happy hours $percent%');
        }
      }
    }

    if (couponCode != null && couponCode.isNotEmpty) {
      final couponDiscount = await _applyCoupon(couponCode, cart);
      discount += couponDiscount.amount;
      if (couponDiscount.amount > 0) applied.add('Coupon ${couponCode.toUpperCase()}');
    }

    return {
      'discountAmount': discount,
      'appliedOffers': applied,
    };
  }

  Future<({double amount, String? couponId})> _applyCoupon(String code, List<PosCartItem> cart) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now().toIso8601String();
    final rows = await db.query(
      'coupons',
      where: 'code = ? AND isActive = 1 AND validFrom <= ? AND (validUntil IS NULL OR validUntil >= ?)',
      whereArgs: [code.toUpperCase(), now, now],
      limit: 1,
    );
    if (rows.isEmpty) return (amount: 0.0, couponId: null);

    final coupon = rows.first;
    final maxUses = coupon['maxUses'] as int;
    final used = coupon['usedCount'] as int;
    if (maxUses > 0 && used >= maxUses) return (amount: 0.0, couponId: null);

    final subtotal = cart.fold(0.0, (s, i) => s + i.lineSubtotal);
    final minPurchase = (coupon['minPurchase'] as num).toDouble();
    if (subtotal < minPurchase) return (amount: 0.0, couponId: null);

    final type = coupon['discountType'] as String;
    final value = (coupon['discountValue'] as num).toDouble();
    final amount = type == 'percent' ? subtotal * value / 100 : value;

    await db.update(
      'coupons',
      {'usedCount': used + 1},
      where: 'id = ?',
      whereArgs: [coupon['id']],
    );

    await AuditService.log(
      module: 'offer',
      action: 'coupon_redeemed',
      entityType: 'coupon',
      entityId: coupon['id'] as String,
      payload: {'code': code, 'amount': amount},
    );

    return (amount: amount, couponId: coupon['id'] as String);
  }

  Future<void> createOffer({
    required String name,
    required String offerType,
    required Map<String, dynamic> config,
    DateTime? endDate,
    int priority = 0,
  }) async {
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    await db.insert('offers', {
      'id': _uuid.v4(),
      'name': name,
      'offerType': offerType,
      'configJson': jsonEncode(config),
      'startDate': now.toIso8601String(),
      'endDate': endDate?.toIso8601String(),
      'isActive': 1,
      'priority': priority,
      'createdAt': now.toIso8601String(),
      'updatedAt': now.toIso8601String(),
    });
  }

  Future<void> createCoupon({
    required String code,
    required String discountType,
    required double discountValue,
    double minPurchase = 0,
    int maxUses = 0,
    DateTime? validUntil,
  }) async {
    final db = await DatabaseManager.instance.database;
    await db.insert('coupons', {
      'id': _uuid.v4(),
      'code': code.toUpperCase(),
      'discountType': discountType,
      'discountValue': discountValue,
      'minPurchase': minPurchase,
      'maxUses': maxUses,
      'usedCount': 0,
      'validFrom': DateTime.now().toIso8601String(),
      'validUntil': validUntil?.toIso8601String(),
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }
}
