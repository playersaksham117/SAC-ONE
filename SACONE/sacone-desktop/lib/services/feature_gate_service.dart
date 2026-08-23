import '../models/license_models.dart';

/// Feature gating based on active license tier and subscription status.
class FeatureGateService {
  static bool canAccess(ActiveLicense? license, String feature) {
    if (license == null || !license.isValid) {
      return _basicFallback(feature);
    }

    final f = license.features;
    switch (feature) {
      case 'pos':
        return f.pos;
      case 'wms_advanced':
      case 'warehouses':
      case 'adjustments':
        return f.wmsAdvanced || license.tier == LicenseTier.trial;
      case 'mobile_sync':
      case 'mobile_inventory':
      case 'mobile_pos':
        return f.mobileSync;
      case 'analytics':
      case 'executive_analytics':
        return f.analytics;
      case 'advanced_retail':
        return f.advancedRetail;
      case 'suppliers':
      case 'customers':
      case 'purchase_orders':
      case 'ledger':
        return f.pos;
      case 'inventory':
      case 'dashboard':
      case 'reports_basic':
      case 'settings':
        return true;
      default:
        return license.tier != LicenseTier.basic || license.tier == LicenseTier.trial;
    }
  }

  static bool _basicFallback(String feature) {
    const basicAllowed = {'inventory', 'dashboard', 'reports_basic', 'settings', 'warehouses'};
    return basicAllowed.contains(feature);
  }

  static String upgradeMessage(String feature) {
    switch (feature) {
      case 'pos':
        return 'POS Billing requires a Pro license.';
      case 'mobile_sync':
      case 'mobile_inventory':
      case 'mobile_pos':
        return 'Mobile sync requires a Pro license.';
      case 'analytics':
      case 'executive_analytics':
        return 'Executive Analytics requires a Pro license.';
      case 'advanced_retail':
        return 'Advanced Retail requires a Pro license.';
      default:
        return 'This feature requires a Pro subscription.';
    }
  }

  static List<String> lockedNavIndices(ActiveLicense? license) {
    if (license == null || !license.isValid) return [];
    final locked = <String>[];
    if (!canAccess(license, 'pos')) locked.addAll(['pos', 'suppliers', 'customers', 'purchase_orders', 'ledger']);
    if (!canAccess(license, 'advanced_retail')) locked.add('advanced_retail');
    if (!canAccess(license, 'mobile_sync')) locked.addAll(['mobile_inventory', 'mobile_pos']);
    if (!canAccess(license, 'analytics')) locked.add('executive_analytics');
    if (!canAccess(license, 'wms_advanced')) locked.addAll(['adjustments', 'stock_locations']);
    return locked;
  }
}
