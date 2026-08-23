/// Role-based access control service for TracInvent
/// Defines user roles and their associated permissions
library;

enum UserRole {
  admin,
  warehouseManager,
  staff,
  auditor,
}

enum Permission {
  // User Management
  manageUsers,
  managePins,
  
  // Warehouse Management
  manageWarehouses,
  manageLocations,
  
  // Inventory Management
  manageInventory,
  viewInventory,
  
  // Stock Operations
  stockIn,
  stockOut,
  stockTransfer,
  
  // View & Reports
  viewReports,
  exportData,
  viewAuditTrail,
  
  // System
  manageSettings,
  accessSystem,
}

class PermissionService {
  /// Maps each role to its list of permissions
  static const Map<UserRole, List<Permission>> rolePermissions = {
    UserRole.admin: [
      // Full access
      Permission.manageUsers,
      Permission.managePins,
      Permission.manageWarehouses,
      Permission.manageLocations,
      Permission.manageInventory,
      Permission.viewInventory,
      Permission.stockIn,
      Permission.stockOut,
      Permission.stockTransfer,
      Permission.viewReports,
      Permission.exportData,
      Permission.viewAuditTrail,
      Permission.manageSettings,
      Permission.accessSystem,
    ],
    UserRole.warehouseManager: [
      // Can manage warehouse operations
      Permission.viewInventory,
      Permission.stockIn,
      Permission.stockOut,
      Permission.stockTransfer,
      Permission.manageLocations,
      Permission.viewReports,
      Permission.exportData,
      Permission.viewAuditTrail,
      Permission.accessSystem,
    ],
    UserRole.staff: [
      // Can perform stock operations
      Permission.viewInventory,
      Permission.stockIn,
      Permission.stockOut,
      Permission.viewAuditTrail,
      Permission.accessSystem,
    ],
    UserRole.auditor: [
      // Read-only access
      Permission.viewInventory,
      Permission.viewReports,
      Permission.viewAuditTrail,
      Permission.exportData,
      Permission.accessSystem,
    ],
  };

  /// Check if a role has a specific permission
  static bool hasPermission(UserRole role, Permission permission) {
    return rolePermissions[role]?.contains(permission) ?? false;
  }

  /// Get all permissions for a role
  static List<Permission> getPermissionsForRole(UserRole role) {
    return rolePermissions[role] ?? [];
  }

  /// Check if user can access a screen
  static bool canAccessScreen(UserRole role, String screenName) {
    final screenPermissions = _screenPermissionMap[screenName];
    if (screenPermissions == null) return true; // No restrictions if not in map

    return screenPermissions.any((permission) => hasPermission(role, permission));
  }

  /// Get user-friendly role name
  static String getRoleName(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return 'Administrator';
      case UserRole.warehouseManager:
        return 'Warehouse Manager';
      case UserRole.staff:
        return 'Staff';
      case UserRole.auditor:
        return 'Auditor';
    }
  }

  /// Get role icon
  static String getRoleIcon(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return '👑';
      case UserRole.warehouseManager:
        return '🏢';
      case UserRole.staff:
        return '👤';
      case UserRole.auditor:
        return '📋';
    }
  }

  /// Map screens to required permissions
  static const Map<String, List<Permission>> _screenPermissionMap = {
    'dashboard': [Permission.accessSystem],
    'inventory': [Permission.viewInventory],
    'stock_search': [Permission.viewInventory],
    'warehouses': [Permission.manageWarehouses],
    'transactions': [Permission.viewInventory],
    'reports': [Permission.viewReports],
    'settings': [Permission.manageSettings],
    'user_management': [Permission.manageUsers],
    'stock_transfer': [Permission.stockTransfer],
    'audit_trail': [Permission.viewAuditTrail],
  };

  /// Check if role can manage users
  static bool canManageUsers(UserRole role) => hasPermission(role, Permission.manageUsers);

  /// Check if role can manage pins
  static bool canManagePins(UserRole role) => hasPermission(role, Permission.managePins);

  /// Check if role can manage inventory
  static bool canManageInventory(UserRole role) =>
      hasPermission(role, Permission.manageInventory);

  /// Check if role can view inventory
  static bool canViewInventory(UserRole role) =>
      hasPermission(role, Permission.viewInventory);

  /// Check if role can perform stock in
  static bool canStockIn(UserRole role) => hasPermission(role, Permission.stockIn);

  /// Check if role can perform stock out
  static bool canStockOut(UserRole role) => hasPermission(role, Permission.stockOut);

  /// Check if role can transfer stock
  static bool canTransferStock(UserRole role) =>
      hasPermission(role, Permission.stockTransfer);

  /// Check if role can view reports
  static bool canViewReports(UserRole role) => hasPermission(role, Permission.viewReports);

  /// Check if role can export data
  static bool canExportData(UserRole role) => hasPermission(role, Permission.exportData);

  /// Check if role can view audit trail
  static bool canViewAuditTrail(UserRole role) =>
      hasPermission(role, Permission.viewAuditTrail);

  /// Check if role can manage settings
  static bool canManageSettings(UserRole role) =>
      hasPermission(role, Permission.manageSettings);
}
