/// ============================================================
/// BASE ENTITY - Common properties for all domain entities
/// ============================================================
/// 
/// Provides common fields like id, timestamps, and sync status
/// that all domain entities inherit from.
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'package:uuid/uuid.dart';

/// Base class for all domain entities
abstract class BaseEntity {
  /// Unique identifier (UUID v4)
  final String id;
  
  /// Creation timestamp
  final DateTime createdAt;
  
  /// Last update timestamp
  final DateTime updatedAt;
  
  /// Sync status for future API integration
  final SyncStatus syncStatus;
  
  /// Server-side ID for synced entities
  final String? serverId;
  
  BaseEntity({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.syncStatus = SyncStatus.local,
    this.serverId,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();
  
  /// Creates a copy with updated fields
  BaseEntity copyWithBase({
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
  });
  
  /// Converts to database map
  Map<String, dynamic> toMap();
  
  /// Common fields for database map
  Map<String, dynamic> baseToMap() => {
    'id': id,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'syncStatus': syncStatus.name,
    'serverId': serverId,
  };
  
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BaseEntity && runtimeType == other.runtimeType && id == other.id;
  
  @override
  int get hashCode => id.hashCode;
}

/// Sync status for offline-first architecture
enum SyncStatus {
  /// Created/modified locally, not yet synced
  local,
  
  /// Successfully synced with server
  synced,
  
  /// Pending sync (queued for upload)
  pending,
  
  /// Sync conflict needs resolution
  conflict,
  
  /// Sync failed, needs retry
  failed,
}

/// Extension for SyncStatus
extension SyncStatusExtension on SyncStatus {
  bool get needsSync => this == SyncStatus.local || 
                        this == SyncStatus.pending || 
                        this == SyncStatus.failed;
  
  bool get isSynced => this == SyncStatus.synced;
  
  bool get hasConflict => this == SyncStatus.conflict;
}

/// Mixin for entities that can be soft-deleted
mixin SoftDeletable {
  bool get isDeleted;
  DateTime? get deletedAt;
  String? get deletedBy;
}

/// Mixin for entities that track who created/modified them
mixin Auditable {
  String? get createdBy;
  String? get updatedBy;
}

/// Mixin for entities that have a code field
mixin CodedEntity {
  String get code;
  
  /// Validates code format (alphanumeric + dashes)
  static bool isValidCode(String code) {
    return RegExp(r'^[A-Z0-9\-]+$').hasMatch(code.toUpperCase());
  }
  
  /// Generates code from name
  static String generateCode(String name, {int maxLength = 10}) {
    return name
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]+'), '-')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '')
        .substring(0, name.length < maxLength ? name.length : maxLength);
  }
}
