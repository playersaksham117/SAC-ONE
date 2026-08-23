import 'dart:convert';

import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';

/// Central audit trail for Phase 2 modules.
class AuditService {
  static const _uuid = Uuid();

  static Future<void> log({
    required String module,
    required String action,
    required String entityType,
    String? entityId,
    String? userId,
    Map<String, dynamic>? payload,
    Transaction? txn,
  }) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final row = {
      'id': _uuid.v4(),
      'module': module,
      'action': action,
      'entityType': entityType,
      'entityId': entityId,
      'userId': userId,
      'payloadJson': payload != null ? jsonEncode(payload) : null,
      'createdAt': DateTime.now().toIso8601String(),
    };

    if (txn != null) {
      await txn.insert('audit_events', row);
    } else {
      await db.insert('audit_events', row);
    }
  }
}
