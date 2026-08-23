import 'dart:convert';

import 'package:uuid/uuid.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'unified_database_manager.dart';

/// Writes mutations to SQLite sync_queue for outbound sync.
class SyncQueueService {
  static const _uuid = Uuid();

  static Future<void> enqueue({
    required String tableName,
    required String recordId,
    required String operation,
    required Map<String, dynamic> payload,
    int priority = 0,
    Transaction? txn,
  }) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final row = {
      'id': _uuid.v4(),
      'tableName': tableName,
      'recordId': recordId,
      'operation': operation,
      'payload': jsonEncode(payload),
      'priority': priority,
      'attempts': 0,
      'status': 'pending',
      'createdAt': DateTime.now().toIso8601String(),
    };

    if (txn != null) {
      await txn.insert('sync_queue', row);
    } else {
      await db.insert('sync_queue', row);
    }
  }

  static Future<List<Map<String, dynamic>>> pending({int limit = 50}) async {
    final db = await DatabaseManager.instance.database;
    return db.query(
      'sync_queue',
      where: "status = 'pending' OR status = 'failed'",
      orderBy: 'priority DESC, createdAt ASC',
      limit: limit,
    );
  }

  static Future<int> pendingCount() async {
    final db = await DatabaseManager.instance.database;
    final r = await db.rawQuery(
      "SELECT COUNT(*) as c FROM sync_queue WHERE status IN ('pending','failed')",
    );
    return (r.first['c'] as int?) ?? 0;
  }

  static Future<void> markDone(String id, {Transaction? txn}) async {
    final db = txn ?? await DatabaseManager.instance.database;
    await db.update('sync_queue', {'status': 'done'}, where: 'id = ?', whereArgs: [id]);
  }

  static Future<void> markFailed(String id, String error, {Transaction? txn}) async {
    final db = txn ?? await DatabaseManager.instance.database;
    final rows = await db.query('sync_queue', columns: ['attempts'], where: 'id = ?', whereArgs: [id], limit: 1);
    final attempts = ((rows.first['attempts'] as int?) ?? 0) + 1;
    await db.update(
      'sync_queue',
      {
        'status': 'failed',
        'attempts': attempts,
        'lastAttemptAt': DateTime.now().toIso8601String(),
        'errorMessage': error,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}

/// Helper to enqueue after local DB writes.
Future<void> trackMutation({
  required String tableName,
  required String recordId,
  required String operation,
  required Map<String, dynamic> payload,
  Transaction? txn,
}) =>
    SyncQueueService.enqueue(
      tableName: tableName,
      recordId: recordId,
      operation: operation,
      payload: payload,
      txn: txn,
    );
