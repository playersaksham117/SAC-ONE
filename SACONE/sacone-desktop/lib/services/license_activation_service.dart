import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

import '../models/license_models.dart';
import 'device_fingerprint_service.dart';
import 'license_crypto_service.dart';
import 'unified_database_manager.dart';

/// Offline-first license activation, validation, and device binding.
class LicenseActivationService {
  static const _uuid = Uuid();
  static const _prefTrialStart = 'license_trial_started_at';

  Future<DateTime?> getTrialStartDate() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefTrialStart);
    return raw != null ? DateTime.tryParse(raw) : null;
  }

  Future<DateTime> startTrialIfNeeded() async {
    final existing = await getTrialStartDate();
    if (existing != null) return existing;

    final now = DateTime.now();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefTrialStart, now.toIso8601String());
    return now;
  }

  Future<ActiveLicense?> getActiveLicense() async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query(
      'license_records',
      where: "status IN ('active', 'expired')",
      orderBy: 'updatedAt DESC',
      limit: 1,
    );
    if (rows.isEmpty) {
      return _buildTrialLicense(await startTrialIfNeeded());
    }

    final row = rows.first;
    if (!_verifyTamper(row)) return null;

    return _mapRowToActiveLicense(row);
  }

  Future<ActiveLicense> activateLicenseKey(String licenseKey) async {
    final payload = LicenseCryptoService.parseLicenseKey(licenseKey);
    if (payload == null) {
      throw Exception('Invalid license key format or signature');
    }

    if (payload.expiresAt.isBefore(DateTime.now())) {
      throw Exception('License key has expired');
    }

    final fingerprint = await DeviceFingerprintService.getFingerprint();
    final db = await DatabaseManager.instance.database;
    final now = DateTime.now();
    final keyHash = LicenseCryptoService.hashKey(licenseKey);
    final signature = LicenseCryptoService.signPayload(payload.toJson());

    final existing = await db.query(
      'license_records',
      where: 'licenseKeyHash = ?',
      whereArgs: [keyHash],
      limit: 1,
    );

    String licenseId;
    if (existing.isNotEmpty) {
      licenseId = existing.first['id'] as String;
      final maxDevices = (existing.first['maxDevices'] as num?)?.toInt() ?? 1;
      final activations = await db.query(
        'license_activations',
        where: 'licenseId = ? AND status = ?',
        whereArgs: [licenseId, 'active'],
      );
      final alreadyBound = activations.any((a) => a['deviceFingerprint'] == fingerprint);
      if (!alreadyBound && activations.length >= maxDevices) {
        throw Exception('Activation limit reached ($maxDevices devices)');
      }
    } else {
      licenseId = payload.licenseId.isNotEmpty ? payload.licenseId : _uuid.v4();
    }

    final record = {
      'id': licenseId,
      'licenseKey': licenseKey.trim().toUpperCase(),
      'licenseKeyHash': keyHash,
      'organizationName': payload.organizationName,
      'tier': payload.tier.name,
      'status': 'active',
      'maxDevices': payload.maxDevices,
      'activatedDevices': 0,
      'issuedAt': payload.issuedAt.toIso8601String(),
      'expiresAt': payload.expiresAt.toIso8601String(),
      'renewedAt': null,
      'featuresJson': jsonEncode(payload.features.toJson()),
      'payloadJson': jsonEncode(payload.toJson()),
      'signature': signature,
      'tamperHash': '',
      'createdAt': now.toIso8601String(),
      'updatedAt': now.toIso8601String(),
    };
    record['tamperHash'] = LicenseCryptoService.computeTamperHash(record);

    await db.transaction((txn) async {
      await txn.insert('license_records', record, conflictAlgorithm: ConflictAlgorithm.replace);

      final activationId = _uuid.v4();
      await txn.insert(
        'license_activations',
        {
          'id': activationId,
          'licenseId': licenseId,
          'deviceFingerprint': fingerprint,
          'deviceName': DeviceFingerprintService.getDeviceName(),
          'platform': DeviceFingerprintService.getPlatformLabel(),
          'activatedAt': now.toIso8601String(),
          'lastValidatedAt': now.toIso8601String(),
          'status': 'active',
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

      final countRows = await txn.rawQuery(
        "SELECT COUNT(*) as c FROM license_activations WHERE licenseId = ? AND status = 'active'",
        [licenseId],
      );
      final count = (countRows.first['c'] as num?)?.toInt() ?? 1;

      await txn.update(
        'license_records',
        {
          'activatedDevices': count,
          'updatedAt': now.toIso8601String(),
          'tamperHash': LicenseCryptoService.computeTamperHash({...record, 'activatedDevices': count}),
        },
        where: 'id = ?',
        whereArgs: [licenseId],
      );

      await txn.insert('subscription_events', {
        'id': _uuid.v4(),
        'licenseId': licenseId,
        'eventType': SubscriptionEventType.activated.name,
        'eventDate': now.toIso8601String(),
        'notes': 'Device bound: ${DeviceFingerprintService.getDeviceName()}',
        'metadataJson': jsonEncode({'fingerprint': fingerprint}),
        'createdAt': now.toIso8601String(),
      });
    });

    final active = await getActiveLicense();
    if (active == null) throw Exception('Activation failed');
    return active;
  }

  Future<void> validateLocalLicense() async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query('license_records', limit: 1);
    if (rows.isEmpty) return;

    final row = rows.first;
    if (!_verifyTamper(row)) {
      await _suspendLicense(row['id'] as String, 'Tamper detected');
      return;
    }

    final expiresAt = DateTime.parse(row['expiresAt'] as String);
    if (expiresAt.isBefore(DateTime.now()) && row['status'] == 'active') {
      await db.update(
        'license_records',
        {'status': 'expired', 'updatedAt': DateTime.now().toIso8601String()},
        where: 'id = ?',
        whereArgs: [row['id']],
      );
      await db.insert('subscription_events', {
        'id': _uuid.v4(),
        'licenseId': row['id'],
        'eventType': SubscriptionEventType.expired.name,
        'eventDate': DateTime.now().toIso8601String(),
        'notes': 'Subscription expired',
        'createdAt': DateTime.now().toIso8601String(),
      });
    }

    final fingerprint = await DeviceFingerprintService.getFingerprint();
    await db.update(
      'license_activations',
      {'lastValidatedAt': DateTime.now().toIso8601String()},
      where: 'licenseId = ? AND deviceFingerprint = ?',
      whereArgs: [row['id'], fingerprint],
    );
  }

  Future<List<Map<String, dynamic>>> getSubscriptionHistory(String licenseId) async {
    final db = await DatabaseManager.instance.database;
    return db.query(
      'subscription_events',
      where: 'licenseId = ?',
      whereArgs: [licenseId],
      orderBy: 'eventDate DESC',
      limit: 50,
    );
  }

  Future<void> deactivateCurrentDevice() async {
    final db = await DatabaseManager.instance.database;
    final fingerprint = await DeviceFingerprintService.getFingerprint();
    await db.update(
      'license_activations',
      {'status': 'revoked'},
      where: 'deviceFingerprint = ?',
      whereArgs: [fingerprint],
    );
  }

  ActiveLicense _buildTrialLicense(DateTime trialStart) {
    const trialDays = 14;
    final expiresAt = trialStart.add(const Duration(days: trialDays));
    final remaining = expiresAt.difference(DateTime.now()).inDays;
    final valid = remaining >= 0;

    return ActiveLicense(
      id: 'trial',
      licenseKey: '',
      organizationName: 'Trial Workspace',
      tier: LicenseTier.trial,
      status: valid ? LicenseStatus.active : LicenseStatus.expired,
      maxDevices: 1,
      activatedDevices: 1,
      expiresAt: expiresAt,
      features: LicenseFeatures.forTier(LicenseTier.trial),
      isValid: valid,
      daysRemaining: remaining.clamp(0, trialDays),
    );
  }

  ActiveLicense _mapRowToActiveLicense(Map<String, dynamic> row) {
    final expiresAt = DateTime.parse(row['expiresAt'] as String);
    final statusStr = row['status'] as String? ?? 'active';
    final status = LicenseStatus.values.firstWhere(
      (s) => s.name == statusStr,
      orElse: () => LicenseStatus.active,
    );
    final daysRemaining = expiresAt.difference(DateTime.now()).inDays;
    final tier = LicenseTier.values.firstWhere(
      (t) => t.name == (row['tier'] as String? ?? 'basic'),
      orElse: () => LicenseTier.basic,
    );

    LicenseFeatures features;
    try {
      features = LicenseFeatures.fromJson(
        jsonDecode(row['featuresJson'] as String) as Map<String, dynamic>,
      );
    } catch (_) {
      features = LicenseFeatures.forTier(tier);
    }

    final isValid = status == LicenseStatus.active && daysRemaining >= 0;

    return ActiveLicense(
      id: row['id'] as String,
      licenseKey: row['licenseKey'] as String? ?? '',
      organizationName: row['organizationName'] as String? ?? 'Licensed',
      tier: tier,
      status: isValid ? status : LicenseStatus.expired,
      maxDevices: (row['maxDevices'] as num?)?.toInt() ?? 1,
      activatedDevices: (row['activatedDevices'] as num?)?.toInt() ?? 0,
      expiresAt: expiresAt,
      renewedAt: row['renewedAt'] != null ? DateTime.tryParse(row['renewedAt'] as String) : null,
      features: features,
      isValid: isValid,
      daysRemaining: daysRemaining.clamp(0, 9999),
    );
  }

  bool _verifyTamper(Map<String, dynamic> row) {
    final stored = row['tamperHash'] as String?;
    if (stored == null || stored.isEmpty) return true;
    final copy = Map<String, dynamic>.from(row)..remove('tamperHash');
    copy['tamperHash'] = '';
    return LicenseCryptoService.computeTamperHash(copy) == stored ||
        LicenseCryptoService.computeTamperHash({...copy, 'tamperHash': ''}) == stored;
  }

  Future<void> _suspendLicense(String licenseId, String reason) async {
    final db = await DatabaseManager.instance.database;
    await db.update(
      'license_records',
      {'status': 'suspended', 'updatedAt': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [licenseId],
    );
    await db.insert('subscription_events', {
      'id': _uuid.v4(),
      'licenseId': licenseId,
      'eventType': SubscriptionEventType.validationFailed.name,
      'eventDate': DateTime.now().toIso8601String(),
      'notes': reason,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }
}
