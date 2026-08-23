import 'package:flutter/foundation.dart';

import '../models/license_models.dart';
import '../services/feature_gate_service.dart';
import '../services/license_activation_service.dart';
import '../services/secure_update_service.dart';

class LicenseProvider with ChangeNotifier {
  final LicenseActivationService _activation = LicenseActivationService();

  bool _loading = true;
  ActiveLicense? _license;
  String? _error;
  SecureUpdateManifest? _updateManifest;
  bool _forceUpdateRequired = false;
  List<Map<String, dynamic>> _subscriptionHistory = [];

  bool get isLoading => _loading;
  ActiveLicense? get license => _license;
  String? get error => _error;
  SecureUpdateManifest? get updateManifest => _updateManifest;
  bool get forceUpdateRequired => _forceUpdateRequired;
  List<Map<String, dynamic>> get subscriptionHistory => _subscriptionHistory;

  bool get isTrial => _license?.tier == LicenseTier.trial;
  bool get isPro => _license?.tier == LicenseTier.pro || _license?.tier == LicenseTier.enterprise;
  bool get isExpired => _license != null && !_license!.isValid;

  Future<void> initialize() async {
    _loading = true;
    notifyListeners();

    try {
      await _activation.startTrialIfNeeded();
      await _activation.validateLocalLicense();
      _license = await _activation.getActiveLicense();
      _updateManifest = await SecureUpdateService.fetchManifest();
      _forceUpdateRequired = _updateManifest != null &&
          SecureUpdateService.isBelowMinVersion(
            SecureUpdateService.currentVersion,
            _updateManifest!.minVersion,
          );
      if (_license != null && _license!.id != 'trial') {
        _subscriptionHistory = await _activation.getSubscriptionHistory(_license!.id);
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<ActiveLicense> activate(String licenseKey) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _license = await _activation.activateLicenseKey(licenseKey);
      _subscriptionHistory = await _activation.getSubscriptionHistory(_license!.id);
      return _license!;
    } catch (e) {
      _error = e.toString();
      rethrow;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    await initialize();
  }

  bool canAccess(String feature) => FeatureGateService.canAccess(_license, feature);

  String upgradeMessage(String feature) => FeatureGateService.upgradeMessage(feature);

  Future<void> deactivateDevice() async {
    await _activation.deactivateCurrentDevice();
    await initialize();
  }
}
