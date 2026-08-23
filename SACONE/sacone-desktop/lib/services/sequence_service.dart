
import 'unified_database_manager.dart';

/// Document number generation from sequences table.
class SequenceService {
  static Future<String> nextNumber(String sequenceName) async {
    final db = await DatabaseManager.instance.database;

    return db.transaction((txn) async {
      final rows = await txn.query(
        'sequences',
        where: 'name = ?',
        whereArgs: [sequenceName],
        limit: 1,
      );

      if (rows.isEmpty) {
        throw Exception('Sequence $sequenceName not configured');
      }

      final row = rows.first;
      final prefix = row['prefix'] as String;
      final padding = row['padding'] as int;
      final nextValue = (row['currentValue'] as int) + 1;

      await txn.update(
        'sequences',
        {
          'currentValue': nextValue,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'name = ?',
        whereArgs: [sequenceName],
      );

      return '$prefix${nextValue.toString().padLeft(padding, '0')}';
    });
  }
}
