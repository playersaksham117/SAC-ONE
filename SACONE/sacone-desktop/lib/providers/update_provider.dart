import 'package:flutter/foundation.dart';
import '../services/github_update_service.dart';

enum UpdateStatus {
  idle,
  checking,
  available,
  downloading,
  readyToInstall,
  installing,
  error,
  upToDate,
}

class UpdateProvider extends ChangeNotifier {
  GitHubRelease? _availableUpdate;
  UpdateStatus _status = UpdateStatus.idle;
  String? _errorMessage;
  DateTime? _lastChecked;
  double _downloadProgress = 0.0;
  String? _downloadedFilePath;
  int _downloadedBytes = 0;
  int _totalBytes = 0;

  // Getters
  GitHubRelease? get availableUpdate => _availableUpdate;
  UpdateStatus get status => _status;
  String? get errorMessage => _errorMessage;
  DateTime? get lastChecked => _lastChecked;
  double get downloadProgress => _downloadProgress;
  String? get downloadedFilePath => _downloadedFilePath;
  int get downloadedBytes => _downloadedBytes;
  int get totalBytes => _totalBytes;
  
  bool get isChecking => _status == UpdateStatus.checking;
  bool get isDownloading => _status == UpdateStatus.downloading;
  bool get hasUpdate => _availableUpdate != null && _status == UpdateStatus.available;
  bool get isReadyToInstall => _status == UpdateStatus.readyToInstall && _downloadedFilePath != null;
  bool get hasError => _status == UpdateStatus.error;

  String get currentVersion => GitHubUpdateService.versionString;
  String get downloadProgressText => '${GitHubUpdateService.formatBytes(_downloadedBytes)} / ${GitHubUpdateService.formatBytes(_totalBytes)}';

  /// Check for updates from GitHub
  Future<void> checkForUpdates({bool silent = false}) async {
    if (_status == UpdateStatus.checking || _status == UpdateStatus.downloading) return;

    _status = UpdateStatus.checking;
    _errorMessage = null;
    if (!silent) notifyListeners();

    try {
      final release = await GitHubUpdateService.checkForUpdates();
      
      _lastChecked = DateTime.now();
      
      if (release != null) {
        _availableUpdate = release;
        _status = UpdateStatus.available;
        debugPrint('Update available: ${release.tagName}');
      } else {
        _availableUpdate = null;
        _status = UpdateStatus.upToDate;
        debugPrint('Already up to date');
      }
      
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Failed to check for updates: ${e.toString().replaceAll('Exception: ', '')}';
      _status = UpdateStatus.error;
      debugPrint('Update check error: $e');
      if (!silent) notifyListeners();
    }
  }

  /// Download the update
  Future<void> downloadUpdate() async {
    if (_availableUpdate == null) return;
    
    final asset = _availableUpdate!.windowsAsset;
    if (asset == null) {
      _errorMessage = 'No Windows installer found in this release';
      _status = UpdateStatus.error;
      notifyListeners();
      return;
    }

    _status = UpdateStatus.downloading;
    _downloadProgress = 0.0;
    _downloadedBytes = 0;
    _totalBytes = asset.size;
    _errorMessage = null;
    notifyListeners();

    try {
      final filePath = await GitHubUpdateService.downloadUpdate(
        asset,
        (received, total) {
          _downloadedBytes = received;
          _totalBytes = total > 0 ? total : asset.size;
          _downloadProgress = total > 0 ? received / total : 0;
          notifyListeners();
        },
      );

      if (filePath != null) {
        _downloadedFilePath = filePath;
        _status = UpdateStatus.readyToInstall;
        _downloadProgress = 1.0;
        debugPrint('Download complete: $filePath');
      } else {
        throw Exception('Download failed');
      }
      
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Download failed: ${e.toString().replaceAll('Exception: ', '')}';
      _status = UpdateStatus.error;
      _downloadProgress = 0.0;
      debugPrint('Download error: $e');
      notifyListeners();
    }
  }

  /// Install the downloaded update
  Future<void> installUpdate() async {
    if (_downloadedFilePath == null) return;

    _status = UpdateStatus.installing;
    _errorMessage = null;
    notifyListeners();

    try {
      await GitHubUpdateService.installUpdate(_downloadedFilePath!);
      // If we reach here, installation didn't trigger app exit
      _status = UpdateStatus.error;
      _errorMessage = 'Installation may require manual restart';
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Installation failed: ${e.toString().replaceAll('Exception: ', '')}';
      _status = UpdateStatus.error;
      debugPrint('Install error: $e');
      notifyListeners();
    }
  }

  /// Dismiss update notification
  void dismissUpdate() {
    _availableUpdate = null;
    _status = UpdateStatus.idle;
    _downloadProgress = 0.0;
    _downloadedFilePath = null;
    notifyListeners();
  }

  /// Force refresh check
  Future<void> forceCheck() async {
    _lastChecked = null;
    _availableUpdate = null;
    _status = UpdateStatus.idle;
    await checkForUpdates(silent: false);
  }

  /// Reset state
  void reset() {
    _availableUpdate = null;
    _status = UpdateStatus.idle;
    _errorMessage = null;
    _downloadProgress = 0.0;
    _downloadedFilePath = null;
    _downloadedBytes = 0;
    _totalBytes = 0;
    notifyListeners();
  }
}
