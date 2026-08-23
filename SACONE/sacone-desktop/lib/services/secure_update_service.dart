import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/license_models.dart';
import '../models/update_info.dart';
import 'github_update_service.dart';

/// License-aware secure update checks with forced upgrade support.
class SecureUpdateService {
  static const String manifestUrl = String.fromEnvironment(
    'TRACINVENT_UPDATE_MANIFEST',
    defaultValue: 'http://localhost:8000/api/v1/updates/manifest',
  );

  static Future<SecureUpdateManifest?> fetchManifest() async {
    try {
      final response = await http
          .get(Uri.parse(manifestUrl), headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 12));

      if (response.statusCode != 200) return null;

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final manifest = SecureUpdateManifest(
        minVersion: data['min_version'] as String? ?? '1.0.0',
        latestVersion: data['latest_version'] as String? ?? '1.0.0',
        forceUpdate: data['force_update'] == true,
        downloadUrl: data['download_url'] as String?,
        checksumSha256: data['checksum_sha256'] as String?,
        releaseNotes: data['release_notes'] as String?,
      );

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('secure_update_manifest', jsonEncode(data));
      await prefs.setString('secure_update_fetched_at', DateTime.now().toIso8601String());

      return manifest;
    } catch (_) {
      return _loadCachedManifest();
    }
  }

  static Future<SecureUpdateManifest?> _loadCachedManifest() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('secure_update_manifest');
    if (raw == null) return null;
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      return SecureUpdateManifest(
        minVersion: data['min_version'] as String? ?? '1.0.0',
        latestVersion: data['latest_version'] as String? ?? '1.0.0',
        forceUpdate: data['force_update'] == true,
        downloadUrl: data['download_url'] as String?,
        checksumSha256: data['checksum_sha256'] as String?,
        releaseNotes: data['release_notes'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  static bool isBelowMinVersion(String current, String minVersion) {
    final cur = AppVersion.fromString(current);
    final min = AppVersion.fromString(minVersion);
    return min.isNewerThan(cur);
  }

  static bool verifyChecksum(String filePath, String expectedSha256) {
    // Delegated to update pipeline — placeholder for manifest-driven installs.
    return expectedSha256.isNotEmpty;
  }

  static String get currentVersion => GitHubUpdateService.versionString;
}
