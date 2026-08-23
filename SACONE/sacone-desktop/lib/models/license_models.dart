/// Commercial license models for Phase 5.
enum LicenseTier { trial, basic, pro, enterprise }

enum LicenseStatus { active, expired, suspended, revoked }

enum SubscriptionEventType {
  activated,
  renewed,
  expired,
  suspended,
  revoked,
  deviceBound,
  validationFailed,
}

/// Feature flags unlocked by subscription tier.
class LicenseFeatures {
  final bool pos;
  final bool wmsAdvanced;
  final bool mobileSync;
  final bool analytics;
  final bool multiWarehouse;
  final bool advancedRetail;

  const LicenseFeatures({
    this.pos = false,
    this.wmsAdvanced = false,
    this.mobileSync = false,
    this.analytics = false,
    this.multiWarehouse = true,
    this.advancedRetail = false,
  });

  static LicenseFeatures forTier(LicenseTier tier) {
    switch (tier) {
      case LicenseTier.trial:
        return const LicenseFeatures(
          pos: true,
          wmsAdvanced: true,
          mobileSync: true,
          analytics: true,
          multiWarehouse: true,
          advancedRetail: true,
        );
      case LicenseTier.basic:
        return const LicenseFeatures(
          pos: false,
          wmsAdvanced: false,
          mobileSync: false,
          analytics: false,
          multiWarehouse: true,
          advancedRetail: false,
        );
      case LicenseTier.pro:
        return const LicenseFeatures(
          pos: true,
          wmsAdvanced: true,
          mobileSync: true,
          analytics: true,
          multiWarehouse: true,
          advancedRetail: true,
        );
      case LicenseTier.enterprise:
        return const LicenseFeatures(
          pos: true,
          wmsAdvanced: true,
          mobileSync: true,
          analytics: true,
          multiWarehouse: true,
          advancedRetail: true,
        );
    }
  }

  Map<String, dynamic> toJson() => {
        'pos': pos,
        'wmsAdvanced': wmsAdvanced,
        'mobileSync': mobileSync,
        'analytics': analytics,
        'multiWarehouse': multiWarehouse,
        'advancedRetail': advancedRetail,
      };

  factory LicenseFeatures.fromJson(Map<String, dynamic> json) {
    return LicenseFeatures(
      pos: json['pos'] == true,
      wmsAdvanced: json['wmsAdvanced'] == true,
      mobileSync: json['mobileSync'] == true,
      analytics: json['analytics'] == true,
      multiWarehouse: json['multiWarehouse'] != false,
      advancedRetail: json['advancedRetail'] == true,
    );
  }
}

class LicensePayload {
  final String licenseId;
  final String organizationName;
  final LicenseTier tier;
  final int maxDevices;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final LicenseFeatures features;

  const LicensePayload({
    required this.licenseId,
    required this.organizationName,
    required this.tier,
    required this.maxDevices,
    required this.issuedAt,
    required this.expiresAt,
    required this.features,
  });

  Map<String, dynamic> toJson() => {
        'licenseId': licenseId,
        'organizationName': organizationName,
        'tier': tier.name,
        'maxDevices': maxDevices,
        'issuedAt': issuedAt.toIso8601String(),
        'expiresAt': expiresAt.toIso8601String(),
        'features': features.toJson(),
      };

  factory LicensePayload.fromJson(Map<String, dynamic> json) {
    return LicensePayload(
      licenseId: json['licenseId'] as String,
      organizationName: json['organizationName'] as String,
      tier: LicenseTier.values.firstWhere(
        (t) => t.name == json['tier'],
        orElse: () => LicenseTier.basic,
      ),
      maxDevices: (json['maxDevices'] as num?)?.toInt() ?? 1,
      issuedAt: DateTime.parse(json['issuedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      features: json['features'] != null
          ? LicenseFeatures.fromJson(Map<String, dynamic>.from(json['features'] as Map))
          : LicenseFeatures.forTier(LicenseTier.basic),
    );
  }
}

class ActiveLicense {
  final String id;
  final String licenseKey;
  final String organizationName;
  final LicenseTier tier;
  final LicenseStatus status;
  final int maxDevices;
  final int activatedDevices;
  final DateTime expiresAt;
  final DateTime? renewedAt;
  final LicenseFeatures features;
  final bool isValid;
  final int daysRemaining;

  const ActiveLicense({
    required this.id,
    required this.licenseKey,
    required this.organizationName,
    required this.tier,
    required this.status,
    required this.maxDevices,
    required this.activatedDevices,
    required this.expiresAt,
    this.renewedAt,
    required this.features,
    required this.isValid,
    required this.daysRemaining,
  });
}

/// Update manifest with optional forced upgrade.
class SecureUpdateManifest {
  final String minVersion;
  final String latestVersion;
  final bool forceUpdate;
  final String? downloadUrl;
  final String? checksumSha256;
  final String? releaseNotes;

  const SecureUpdateManifest({
    required this.minVersion,
    required this.latestVersion,
    this.forceUpdate = false,
    this.downloadUrl,
    this.checksumSha256,
    this.releaseNotes,
  });
}
