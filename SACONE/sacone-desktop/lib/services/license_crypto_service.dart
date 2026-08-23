import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../models/license_models.dart';

/// HMAC signing and tamper detection for offline license validation.
class LicenseCryptoService {
  /// Dev secret — override via --dart-define=TRACINVENT_LICENSE_SECRET=...
  static const String _defaultSecret = 'tracinvent-license-secret-change-in-prod';

  static String get _secret {
    const fromEnv = String.fromEnvironment('TRACINVENT_LICENSE_SECRET');
    return fromEnv.isNotEmpty ? fromEnv : _defaultSecret;
  }

  static String hashKey(String licenseKey) {
    return sha256.convert(utf8.encode(licenseKey.trim().toUpperCase())).toString();
  }

  static String signPayload(Map<String, dynamic> payload) {
    final canonical = jsonEncode(_sortMap(payload));
    final hmac = Hmac(sha256, utf8.encode(_secret));
    return hmac.convert(utf8.encode(canonical)).toString();
  }

  static bool verifyPayload(Map<String, dynamic> payload, String signature) {
    return signPayload(payload) == signature;
  }

  static String computeTamperHash(Map<String, dynamic> recordFields) {
    final hmac = Hmac(sha256, utf8.encode('$_secret|tamper'));
    return hmac.convert(utf8.encode(jsonEncode(_sortMap(recordFields)))).toString();
  }

  /// Parse license key: TRINV-{base64url(payload)}-{sig8}
  static LicensePayload? parseLicenseKey(String key) {
    final normalized = key.trim().toUpperCase();
    if (!normalized.startsWith('TRINV-')) return null;

    final parts = normalized.split('-');
    if (parts.length < 3) return null;

    final payloadB64 = parts.sublist(1, parts.length - 1).join('-');
    final sigShort = parts.last;

    try {
      final padded = payloadB64.padRight(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=');
      final jsonStr = utf8.decode(base64Url.decode(padded));
      final map = jsonDecode(jsonStr) as Map<String, dynamic>;
      final fullSig = signPayload(map);
      if (!fullSig.startsWith(sigShort.toLowerCase()) && !fullSig.startsWith(sigShort)) {
        return null;
      }
      return LicensePayload.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic> _sortMap(Map<String, dynamic> map) {
    final sorted = Map<String, dynamic>.fromEntries(
      map.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    for (final e in sorted.entries) {
      if (e.value is Map) {
        sorted[e.key] = _sortMap(Map<String, dynamic>.from(e.value as Map));
      }
    }
    return sorted;
  }
}
