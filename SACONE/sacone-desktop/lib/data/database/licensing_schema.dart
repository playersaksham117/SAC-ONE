import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Phase 5 licensing tables — subscriptions, activations, audit.
class LicensingSchema {
  static Future<void> createTables(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS license_records (
        id TEXT PRIMARY KEY,
        licenseKey TEXT NOT NULL UNIQUE,
        licenseKeyHash TEXT NOT NULL,
        organizationName TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'basic',
        status TEXT NOT NULL DEFAULT 'active',
        maxDevices INTEGER NOT NULL DEFAULT 1,
        activatedDevices INTEGER NOT NULL DEFAULT 0,
        issuedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        renewedAt TEXT,
        featuresJson TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        signature TEXT NOT NULL,
        tamperHash TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS license_activations (
        id TEXT PRIMARY KEY,
        licenseId TEXT NOT NULL,
        deviceFingerprint TEXT NOT NULL,
        deviceName TEXT NOT NULL,
        platform TEXT NOT NULL,
        activatedAt TEXT NOT NULL,
        lastValidatedAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        FOREIGN KEY (licenseId) REFERENCES license_records(id) ON DELETE CASCADE,
        UNIQUE(licenseId, deviceFingerprint)
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS subscription_events (
        id TEXT PRIMARY KEY,
        licenseId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        eventDate TEXT NOT NULL,
        notes TEXT,
        metadataJson TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (licenseId) REFERENCES license_records(id) ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS update_manifest_cache (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL DEFAULT 'stable',
        minVersion TEXT NOT NULL,
        latestVersion TEXT NOT NULL,
        forceUpdate INTEGER NOT NULL DEFAULT 0,
        downloadUrl TEXT,
        checksumSha256 TEXT,
        manifestJson TEXT NOT NULL,
        fetchedAt TEXT NOT NULL
      )
    ''');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_license_status ON license_records(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_license_expires ON license_records(expiresAt)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_activation_device ON license_activations(deviceFingerprint)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_subscription_license ON subscription_events(licenseId)');
  }
}
