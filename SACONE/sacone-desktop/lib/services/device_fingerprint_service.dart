import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

/// Stable device fingerprint for license binding (offline-capable).
class DeviceFingerprintService {
  static String? _cached;

  static Future<String> getFingerprint() async {
    if (_cached != null) return _cached!;

    final parts = <String>[
      Platform.operatingSystem,
      Platform.operatingSystemVersion,
      Platform.localHostname,
      Platform.numberOfProcessors.toString(),
      if (Platform.environment.containsKey('COMPUTERNAME'))
        Platform.environment['COMPUTERNAME']!,
      if (Platform.environment.containsKey('USERNAME'))
        Platform.environment['USERNAME']!,
    ];

    final digest = sha256.convert(utf8.encode(parts.join('|')));
    _cached = digest.toString().substring(0, 32);
    return _cached!;
  }

  static String getDeviceName() {
    return Platform.environment['COMPUTERNAME'] ??
        Platform.localHostname.replaceAll('.local', '');
  }

  static String getPlatformLabel() {
    if (Platform.isWindows) return 'windows';
    if (Platform.isMacOS) return 'macos';
    if (Platform.isLinux) return 'linux';
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return Platform.operatingSystem;
  }
}
