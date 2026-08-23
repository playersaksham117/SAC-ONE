import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'api_client.dart';
import 'sync_queue_service.dart';
import 'unified_database_manager.dart';
import 'audit_service.dart';

/// Event-driven sync engine: drain sync_queue → push → pull → apply deltas.
class SyncEngine {
  final ApiClient _api;

  SyncEngine({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  Future<SyncResult> runFullSync() async {
    if (!await _api.checkHealth()) {
      return SyncResult(success: false, error: 'Server unavailable');
    }

    try {
      final pushed = await _pushPending();
      final pulled = await _pullAndApply();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('last_sync_time', DateTime.now().toIso8601String());
      return SyncResult(success: true, pushed: pushed, pulled: pulled);
    } catch (e) {
      return SyncResult(success: false, error: e.toString());
    }
  }

  Future<int> _pushPending() async {
    final pending = await SyncQueueService.pending(limit: 100);
    if (pending.isEmpty) return 0;

    final changes = pending.map((row) {
      return {
        'client_id': row['id'],
        'table_name': row['tableName'],
        'record_id': row['recordId'],
        'operation': row['operation'],
        'payload': jsonDecode(row['payload'] as String),
        'client_updated_at': row['createdAt'],
      };
    }).toList();

    final result = await _api.syncPush(changes: changes);
    if (result['success'] != true) {
      throw Exception(result['error'] ?? 'Push failed');
    }

    final results = (result['data']['results'] as List?) ?? [];
    var applied = 0;
    for (final r in results) {
      final clientId = r['client_id'] as String;
      final status = r['status'] as String;
      if (status == 'applied' || status == 'duplicate') {
        await SyncQueueService.markDone(clientId);
        applied++;
      } else {
        await SyncQueueService.markFailed(clientId, r['reason']?.toString() ?? 'rejected');
      }
    }
    return applied;
  }

  Future<int> _pullAndApply() async {
    final prefs = await SharedPreferences.getInstance();
    final since = prefs.getString('last_sync_time');
    final result = await _api.syncPull(since: since);
    if (result['success'] != true) {
      throw Exception(result['error'] ?? 'Pull failed');
    }

    final data = result['data'] as Map<String, dynamic>;
    final changes = data['changes'] as Map<String, dynamic>? ?? {};
    final deleted = data['deleted'] as Map<String, dynamic>? ?? {};
    var count = 0;

    final db = await DatabaseManager.instance.database;
    await db.transaction((txn) async {
      for (final entry in changes.entries) {
        final table = _mapTableName(entry.key);
        for (final row in entry.value as List) {
          final map = Map<String, dynamic>.from(row as Map);
          await txn.insert(table, map, conflictAlgorithm: ConflictAlgorithm.replace);
          count++;
        }
      }
      for (final entry in deleted.entries) {
        final table = _mapTableName(entry.key);
        for (final id in entry.value as List) {
          await txn.delete(table, where: 'id = ?', whereArgs: [id]);
          count++;
        }
      }
    });

    await AuditService.log(
      module: 'sync',
      action: 'pull_applied',
      entityType: 'sync_batch',
      payload: {'count': count},
    );

    return count;
  }

  String _mapTableName(String apiTable) {
    const map = {
      'inventory_items': 'inventory_items',
      'inventory': 'inventory_items',
      'warehouses': 'warehouses',
      'stocks': 'stocks',
      'stock': 'stocks',
      'transactions': 'transactions',
      'sales_invoices': 'sales_invoices',
      'sale_lines': 'sale_lines',
    };
    return map[apiTable] ?? apiTable;
  }
}

class SyncResult {
  final bool success;
  final int pushed;
  final int pulled;
  final String? error;

  SyncResult({required this.success, this.pushed = 0, this.pulled = 0, this.error});
}
