import 'dart:io';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:crypto/crypto.dart';
import '../models/update_info.dart';

/// GitHub-based auto-update service for TracInvent
class GitHubUpdateService {
  // ============ CONFIGURATION ============
  static const String githubOwner = 'playersaksham117';  // Your GitHub username
  static const String githubRepo = 'tracinvent';         // Your repository name
  static const String currentVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.1.0',
  );
  
  // GitHub API URLs
  static String get _releasesApiUrl => 
      'https://api.github.com/repos/$githubOwner/$githubRepo/releases/latest';
  
  // ignore: unused_element - kept for future use (fetching all releases)
  static String get _allReleasesApiUrl => 
      'https://api.github.com/repos/$githubOwner/$githubRepo/releases';

  /// Check GitHub for latest release
  static Future<GitHubRelease?> checkForUpdates() async {
    try {
      debugPrint('Checking for updates from GitHub...');
      
      final response = await http.get(
        Uri.parse(_releasesApiUrl),
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TracInvent-App',
        },
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final release = GitHubRelease.fromJson(data);
        
        final current = AppVersion.fromString(currentVersion);
        final latest = AppVersion.fromString(release.tagName.replaceFirst('v', ''));
        
        debugPrint('Current version: ${current.version}, Latest: ${latest.version}');
        
        if (latest.isNewerThan(current)) {
          debugPrint('New version available!');
          return release;
        } else {
          debugPrint('Already on latest version');
        }
      } else if (response.statusCode == 404) {
        debugPrint('No releases found on GitHub');
      } else {
        debugPrint('GitHub API error: ${response.statusCode}');
      }
      
      return null;
    } catch (e) {
      debugPrint('Error checking for updates: $e');
      rethrow;
    }
  }

  /// Download update file with progress callback
  static Future<String?> downloadUpdate(
    GitHubAsset asset,
    void Function(int received, int total)? onProgress,
  ) async {
    try {
      debugPrint('Starting download: ${asset.name}');
      
      final directory = await getTemporaryDirectory();
      final filePath = p.join(directory.path, asset.name);
      
      // Check if file already exists and is complete
      final existingFile = File(filePath);
      if (await existingFile.exists()) {
        final existingSize = await existingFile.length();
        if (existingSize == asset.size) {
          debugPrint('Update file already downloaded');
          return filePath;
        }
        await existingFile.delete();
      }

      // Download file with progress
      final request = http.Request('GET', Uri.parse(asset.browserDownloadUrl));
      request.headers['Accept'] = 'application/octet-stream';
      request.headers['User-Agent'] = 'TracInvent-App';
      
      final client = http.Client();
      final response = await client.send(request);

      if (response.statusCode != 200) {
        throw Exception('Download failed: HTTP ${response.statusCode}');
      }

      final file = File(filePath);
      final sink = file.openWrite();
      int received = 0;
      final total = response.contentLength ?? asset.size;

      await for (var chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress?.call(received, total);
      }

      await sink.close();
      client.close();

      debugPrint('Download complete: $filePath');
      return filePath;
    } catch (e) {
      debugPrint('Error downloading update: $e');
      rethrow;
    }
  }

  /// Install the downloaded update (Windows)
  static Future<bool> installUpdate(String installerPath) async {
    try {
      debugPrint('Installing update from: $installerPath');
      
      final file = File(installerPath);
      if (!await file.exists()) {
        throw Exception('Installer file not found');
      }

      final extension = p.extension(installerPath).toLowerCase();
      
      if (extension == '.exe') {
        // Run the installer
        // For MSIX: Use Add-AppxPackage
        // For EXE installer: Run with /SILENT flag
        await Process.start(
          installerPath,
          ['/SILENT', '/CLOSEAPPLICATIONS'],
          mode: ProcessStartMode.detached,
        );
        
        // Give the installer time to start
        await Future.delayed(const Duration(seconds: 2));
        
        // Exit current app
        exit(0);
      } else if (extension == '.msix' || extension == '.msixbundle') {
        // For MSIX packages
        final result = await Process.run(
          'powershell',
          [
            '-Command',
            'Add-AppxPackage -Path "$installerPath" -ForceApplicationShutdown'
          ],
        );
        
        if (result.exitCode == 0) {
          exit(0);
        } else {
          throw Exception('MSIX installation failed: ${result.stderr}');
        }
      } else if (extension == '.zip') {
        // For portable ZIP - extract and replace
        return await _installFromZip(installerPath);
      } else {
        throw Exception('Unsupported installer format: $extension');
      }
    } catch (e) {
      debugPrint('Error installing update: $e');
      rethrow;
    }
  }

  /// Install from ZIP (portable version)
  static Future<bool> _installFromZip(String zipPath) async {
    try {
      final appDir = File(Platform.resolvedExecutable).parent;
      final backupDir = Directory(p.join(appDir.parent.path, 'backup_${DateTime.now().millisecondsSinceEpoch}'));
      
      // Create batch script for update
      final scriptPath = p.join(await getTemporaryDirectory().then((d) => d.path), 'update_tracinvent.bat');
      final script = '''
@echo off
echo Waiting for application to close...
timeout /t 3 /nobreak > nul

echo Creating backup...
xcopy "${appDir.path}" "${backupDir.path}" /E /I /H /Y

echo Extracting update...
powershell -Command "Expand-Archive -Path '$zipPath' -DestinationPath '${appDir.path}' -Force"

echo Starting updated application...
start "" "${Platform.resolvedExecutable}"

echo Cleaning up...
del "$zipPath"
del "%~f0"
''';

      await File(scriptPath).writeAsString(script);
      
      await Process.start(
        'cmd',
        ['/c', scriptPath],
        mode: ProcessStartMode.detached,
      );
      
      await Future.delayed(const Duration(seconds: 1));
      exit(0);
    } catch (e) {
      debugPrint('Error installing from ZIP: $e');
      return false;
    }
  }

  /// Verify file checksum (SHA256)
  static Future<bool> verifyChecksum(String filePath, String expectedChecksum) async {
    try {
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      final digest = sha256.convert(bytes);
      final matches = digest.toString().toLowerCase() == expectedChecksum.toLowerCase();
      debugPrint('Checksum ${matches ? "verified" : "mismatch"}');
      return matches;
    } catch (e) {
      debugPrint('Error verifying checksum: $e');
      return false;
    }
  }

  /// Format bytes for display
  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  /// Get current app version
  static AppVersion getCurrentVersion() {
    return AppVersion.fromString(currentVersion);
  }
  
  /// Get version string
  static String get versionString => 'v$currentVersion';
}

/// GitHub Release model
class GitHubRelease {
  final String tagName;
  final String name;
  final String body;
  final bool prerelease;
  final DateTime publishedAt;
  final List<GitHubAsset> assets;
  final String htmlUrl;

  GitHubRelease({
    required this.tagName,
    required this.name,
    required this.body,
    required this.prerelease,
    required this.publishedAt,
    required this.assets,
    required this.htmlUrl,
  });

  factory GitHubRelease.fromJson(Map<String, dynamic> json) {
    return GitHubRelease(
      tagName: json['tag_name'] ?? '',
      name: json['name'] ?? '',
      body: json['body'] ?? '',
      prerelease: json['prerelease'] ?? false,
      publishedAt: DateTime.parse(json['published_at'] ?? DateTime.now().toIso8601String()),
      htmlUrl: json['html_url'] ?? '',
      assets: (json['assets'] as List<dynamic>?)
          ?.map((a) => GitHubAsset.fromJson(a))
          .toList() ?? [],
    );
  }

  /// Get the Windows installer asset
  GitHubAsset? get windowsAsset {
    // Priority: .exe > .msix > .zip
    for (var ext in ['.exe', '.msix', '.msixbundle', '.zip']) {
      final asset = assets.where((a) => 
        a.name.toLowerCase().endsWith(ext) && 
        (a.name.toLowerCase().contains('windows') || 
         a.name.toLowerCase().contains('win') ||
         a.name.toLowerCase().contains('x64'))
      ).firstOrNull;
      if (asset != null) return asset;
    }
    // Fallback: any exe or zip
    return assets.where((a) => 
      a.name.toLowerCase().endsWith('.exe') ||
      a.name.toLowerCase().endsWith('.zip')
    ).firstOrNull;
  }

  /// Get version from tag
  String get version => tagName.replaceFirst('v', '');
}

/// GitHub Asset model
class GitHubAsset {
  final int id;
  final String name;
  final String contentType;
  final int size;
  final int downloadCount;
  final String browserDownloadUrl;

  GitHubAsset({
    required this.id,
    required this.name,
    required this.contentType,
    required this.size,
    required this.downloadCount,
    required this.browserDownloadUrl,
  });

  factory GitHubAsset.fromJson(Map<String, dynamic> json) {
    return GitHubAsset(
      id: json['id'] ?? 0,
      name: json['name'] ?? '',
      contentType: json['content_type'] ?? '',
      size: json['size'] ?? 0,
      downloadCount: json['download_count'] ?? 0,
      browserDownloadUrl: json['browser_download_url'] ?? '',
    );
  }

  String get formattedSize => GitHubUpdateService.formatBytes(size);
}
