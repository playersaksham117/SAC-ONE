import 'dart:io';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:crypto/crypto.dart';
import '../models/update_info.dart';

/// Auto-update service for checking and downloading updates
class UpdateService {
  // TODO: Replace with your actual update server URL
  static const String updateServerUrl = 'https://your-server.com/api/updates';
  static const String currentVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.1.0',
  );
  
  /// Check if updates are available
  static Future<UpdateInfo?> checkForUpdates() async {
    try {
      final response = await http.get(
        Uri.parse('$updateServerUrl/latest'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final updateInfo = UpdateInfo.fromJson(data);
        
        final current = AppVersion.fromString(currentVersion);
        
        // Check if new version is available
        if (updateInfo.version.isNewerThan(current)) {
          return updateInfo;
        }
      }
      return null;
    } catch (e) {
      print('Error checking for updates: $e');
      return null;
    }
  }

  /// Download update file with progress callback
  static Future<String?> downloadUpdate(
    UpdateInfo updateInfo,
    Function(int received, int total)? onProgress,
  ) async {
    try {
      final directory = await getTemporaryDirectory();
      final fileName = 'tracinvent_update_${updateInfo.version.fullVersion}.exe';
      final filePath = join(directory.path, fileName);

      // Download file
      final request = http.Request('GET', Uri.parse(updateInfo.downloadUrl));
      final response = await http.Client().send(request);

      if (response.statusCode != 200) {
        throw Exception('Failed to download update: ${response.statusCode}');
      }

      final file = File(filePath);
      final sink = file.openWrite();
      int received = 0;
      final total = response.contentLength ?? 0;

      await for (var chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress?.call(received, total);
      }

      await sink.close();

      // Verify checksum
      if (!await _verifyChecksum(filePath, updateInfo.checksum)) {
        await file.delete();
        throw Exception('Checksum verification failed');
      }

      return filePath;
    } catch (e) {
      print('Error downloading update: $e');
      return null;
    }
  }

  /// Verify file checksum
  static Future<bool> _verifyChecksum(String filePath, String expectedChecksum) async {
    try {
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      final digest = sha256.convert(bytes);
      return digest.toString() == expectedChecksum;
    } catch (e) {
      print('Error verifying checksum: $e');
      return false;
    }
  }

  /// Install update (Windows)
  static Future<bool> installUpdate(String installerPath) async {
    try {
      // Launch installer with elevated privileges
      final result = await Process.run(
        'powershell',
        [
          '-Command',
          'Start-Process',
          '-FilePath',
          '"$installerPath"',
          '-Verb',
          'RunAs',
          '-Wait'
        ],
      );

      if (result.exitCode == 0) {
        // Exit current application to allow update
        exit(0);
      }

      return result.exitCode == 0;
    } catch (e) {
      print('Error installing update: $e');
      return false;
    }
  }

  /// Format bytes for display
  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(2)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  /// Get current app version
  static AppVersion getCurrentVersion() {
    return AppVersion.fromString(currentVersion);
  }
}
