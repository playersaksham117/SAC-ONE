/// ============================================================
/// USER ENTITY - Authentication and authorization
/// ============================================================
/// 
/// Represents system users with role-based access control.
/// Supports password and PIN authentication.
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'base_entity.dart';

/// User roles
enum UserRole {
  admin,
  manager,
  operator,
  viewer,
}

extension UserRoleExtension on UserRole {
  String get displayName => switch (this) {
    UserRole.admin => 'Administrator',
    UserRole.manager => 'Manager',
    UserRole.operator => 'Operator',
    UserRole.viewer => 'Viewer',
  };
  
  /// Permission level (higher = more permissions)
  int get level => switch (this) {
    UserRole.admin => 100,
    UserRole.manager => 75,
    UserRole.operator => 50,
    UserRole.viewer => 25,
  };
  
  /// Check if this role can perform admin actions
  bool get canAdmin => this == UserRole.admin;
  
  /// Check if this role can manage inventory
  bool get canManageInventory => level >= UserRole.manager.level;
  
  /// Check if this role can perform stock operations
  bool get canOperateStock => level >= UserRole.operator.level;
  
  /// Check if this role can adjust stock
  bool get canAdjustStock => level >= UserRole.manager.level;
  
  /// Check if this role can manage users
  bool get canManageUsers => this == UserRole.admin;
  
  /// Check if this role can view reports
  bool get canViewReports => level >= UserRole.manager.level;
  
  /// Check if this role can export data
  bool get canExportData => level >= UserRole.manager.level;
}

/// System user
class User extends BaseEntity with SoftDeletable {
  /// Username for login
  final String username;
  
  /// Email address
  final String? email;
  
  /// Display name
  final String displayName;
  
  /// Password hash (never stored in plain text)
  final String passwordHash;
  
  /// PIN hash for quick login (4-6 digits)
  final String? pinHash;
  
  /// User role
  final UserRole role;
  
  /// Assigned warehouse IDs (null = all warehouses)
  final List<String>? assignedWarehouses;
  
  /// Is user active
  final bool isActive;
  
  /// Last login timestamp
  final DateTime? lastLoginAt;
  
  /// Login attempt count (for lockout)
  final int loginAttempts;
  
  /// Lockout until timestamp
  final DateTime? lockedUntil;
  
  /// Password change required
  final bool passwordChangeRequired;
  
  /// Password last changed
  final DateTime? passwordChangedAt;
  
  /// User preferences (JSON)
  final Map<String, dynamic>? preferences;
  
  /// Contact phone
  final String? phone;
  
  /// Profile image URL
  final String? avatarUrl;
  
  // SoftDeletable mixin
  @override
  final bool isDeleted;
  @override
  final DateTime? deletedAt;
  @override
  final String? deletedBy;
  
  User({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required this.username,
    this.email,
    required this.displayName,
    required this.passwordHash,
    this.pinHash,
    this.role = UserRole.operator,
    this.assignedWarehouses,
    this.isActive = true,
    this.lastLoginAt,
    this.loginAttempts = 0,
    this.lockedUntil,
    this.passwordChangeRequired = false,
    this.passwordChangedAt,
    this.preferences,
    this.phone,
    this.avatarUrl,
    this.isDeleted = false,
    this.deletedAt,
    this.deletedBy,
  });
  
  /// Check if user is locked out
  bool get isLockedOut {
    if (lockedUntil == null) return false;
    return DateTime.now().isBefore(lockedUntil!);
  }
  
  /// Check if user can access a specific warehouse
  bool canAccessWarehouse(String warehouseId) {
    if (role == UserRole.admin) return true;
    if (assignedWarehouses == null) return true;
    return assignedWarehouses!.contains(warehouseId);
  }
  
  /// Get initials for avatar
  String get initials {
    final parts = displayName.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  }
  
  @override
  User copyWithBase({
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
  }) {
    return copyWith(
      updatedAt: updatedAt,
      syncStatus: syncStatus,
      serverId: serverId,
    );
  }
  
  User copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? username,
    String? email,
    String? displayName,
    String? passwordHash,
    String? pinHash,
    UserRole? role,
    List<String>? assignedWarehouses,
    bool? isActive,
    DateTime? lastLoginAt,
    int? loginAttempts,
    DateTime? lockedUntil,
    bool? passwordChangeRequired,
    DateTime? passwordChangedAt,
    Map<String, dynamic>? preferences,
    String? phone,
    String? avatarUrl,
    bool? isDeleted,
    DateTime? deletedAt,
    String? deletedBy,
  }) {
    return User(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      username: username ?? this.username,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      passwordHash: passwordHash ?? this.passwordHash,
      pinHash: pinHash ?? this.pinHash,
      role: role ?? this.role,
      assignedWarehouses: assignedWarehouses ?? this.assignedWarehouses,
      isActive: isActive ?? this.isActive,
      lastLoginAt: lastLoginAt ?? this.lastLoginAt,
      loginAttempts: loginAttempts ?? this.loginAttempts,
      lockedUntil: lockedUntil ?? this.lockedUntil,
      passwordChangeRequired: passwordChangeRequired ?? this.passwordChangeRequired,
      passwordChangedAt: passwordChangedAt ?? this.passwordChangedAt,
      preferences: preferences ?? this.preferences,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isDeleted: isDeleted ?? this.isDeleted,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...baseToMap(),
      'username': username,
      'email': email,
      'displayName': displayName,
      'passwordHash': passwordHash,
      'pinHash': pinHash,
      'role': role.name,
      'assignedWarehouses': assignedWarehouses?.join(','),
      'isActive': isActive ? 1 : 0,
      'lastLoginAt': lastLoginAt?.toIso8601String(),
      'loginAttempts': loginAttempts,
      'lockedUntil': lockedUntil?.toIso8601String(),
      'passwordChangeRequired': passwordChangeRequired ? 1 : 0,
      'passwordChangedAt': passwordChangedAt?.toIso8601String(),
      'preferences': preferences?.toString(),
      'phone': phone,
      'avatarUrl': avatarUrl,
      'isDeleted': isDeleted ? 1 : 0,
      'deletedAt': deletedAt?.toIso8601String(),
      'deletedBy': deletedBy,
    };
  }
  
  factory User.fromMap(Map<String, dynamic> map) {
    final warehousesStr = map['assignedWarehouses'] as String?;
    
    return User(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      username: map['username'] as String,
      email: map['email'] as String?,
      displayName: map['displayName'] as String,
      passwordHash: map['passwordHash'] as String,
      pinHash: map['pinHash'] as String?,
      role: UserRole.values.byName(map['role'] as String? ?? 'operator'),
      assignedWarehouses: warehousesStr?.isNotEmpty == true 
          ? warehousesStr!.split(',') 
          : null,
      isActive: (map['isActive'] as int?) != 0,
      lastLoginAt: map['lastLoginAt'] != null 
          ? DateTime.parse(map['lastLoginAt'] as String) 
          : null,
      loginAttempts: (map['loginAttempts'] as int?) ?? 0,
      lockedUntil: map['lockedUntil'] != null 
          ? DateTime.parse(map['lockedUntil'] as String) 
          : null,
      passwordChangeRequired: (map['passwordChangeRequired'] as int?) == 1,
      passwordChangedAt: map['passwordChangedAt'] != null 
          ? DateTime.parse(map['passwordChangedAt'] as String) 
          : null,
      phone: map['phone'] as String?,
      avatarUrl: map['avatarUrl'] as String?,
      isDeleted: (map['isDeleted'] as int?) == 1,
      deletedAt: map['deletedAt'] != null 
          ? DateTime.parse(map['deletedAt'] as String) 
          : null,
      deletedBy: map['deletedBy'] as String?,
    );
  }
  
  /// Create a safe copy without sensitive data (for UI)
  User toSafe() {
    return copyWith(
      passwordHash: '***',
      pinHash: pinHash != null ? '***' : null,
    );
  }
  
  @override
  String toString() => 'User($username: $displayName [${role.displayName}])';
}

/// User session information
class UserSession {
  final User user;
  final String sessionToken;
  final DateTime expiresAt;
  final String? deviceId;
  final String? deviceName;
  
  const UserSession({
    required this.user,
    required this.sessionToken,
    required this.expiresAt,
    this.deviceId,
    this.deviceName,
  });
  
  bool get isExpired => DateTime.now().isAfter(expiresAt);
  
  Map<String, dynamic> toMap() => {
    'userId': user.id,
    'sessionToken': sessionToken,
    'expiresAt': expiresAt.toIso8601String(),
    'deviceId': deviceId,
    'deviceName': deviceName,
  };
}
