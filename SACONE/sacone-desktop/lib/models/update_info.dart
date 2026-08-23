class AppVersion {
  final int major;
  final int minor;
  final int patch;
  final String? buildNumber;

  AppVersion({
    required this.major,
    required this.minor,
    required this.patch,
    this.buildNumber,
  });

  String get version => '$major.$minor.$patch';
  String get fullVersion => buildNumber != null ? '$version+$buildNumber' : version;

  factory AppVersion.fromString(String version) {
    final parts = version.split('+');
    final versionParts = parts[0].split('.');
    
    return AppVersion(
      major: int.parse(versionParts[0]),
      minor: int.parse(versionParts[1]),
      patch: int.parse(versionParts[2]),
      buildNumber: parts.length > 1 ? parts[1] : null,
    );
  }

  bool isNewerThan(AppVersion other) {
    if (major > other.major) return true;
    if (major < other.major) return false;
    
    if (minor > other.minor) return true;
    if (minor < other.minor) return false;
    
    if (patch > other.patch) return true;
    return false;
  }

  Map<String, dynamic> toJson() => {
    'major': major,
    'minor': minor,
    'patch': patch,
    'buildNumber': buildNumber,
  };

  factory AppVersion.fromJson(Map<String, dynamic> json) => AppVersion(
    major: json['major'],
    minor: json['minor'],
    patch: json['patch'],
    buildNumber: json['buildNumber'],
  );
}

class UpdateInfo {
  final AppVersion version;
  final String downloadUrl;
  final int fileSize;
  final String releaseNotes;
  final DateTime releaseDate;
  final bool isRequired;
  final String checksum;

  UpdateInfo({
    required this.version,
    required this.downloadUrl,
    required this.fileSize,
    required this.releaseNotes,
    required this.releaseDate,
    this.isRequired = false,
    required this.checksum,
  });

  factory UpdateInfo.fromJson(Map<String, dynamic> json) {
    return UpdateInfo(
      version: AppVersion.fromJson(json['version']),
      downloadUrl: json['downloadUrl'],
      fileSize: json['fileSize'],
      releaseNotes: json['releaseNotes'],
      releaseDate: DateTime.parse(json['releaseDate']),
      isRequired: json['isRequired'] ?? false,
      checksum: json['checksum'],
    );
  }
}
