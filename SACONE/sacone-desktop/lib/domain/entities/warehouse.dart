/// ============================================================
/// WAREHOUSE & LOCATION ENTITIES - Hierarchical storage structure
/// ============================================================
/// 
/// Defines the warehouse location hierarchy:
/// Warehouse → Zone → Rack → Shelf → Bin
/// 
/// Each level can have capacity, status, and configuration.
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'base_entity.dart';

/// Location types in the hierarchy
enum LocationType {
  warehouse,
  zone,
  rack,
  shelf,
  bin,
}

extension LocationTypeExtension on LocationType {
  String get displayName => switch (this) {
    LocationType.warehouse => 'Warehouse',
    LocationType.zone => 'Zone',
    LocationType.rack => 'Rack',
    LocationType.shelf => 'Shelf',
    LocationType.bin => 'Bin',
  };
  
  LocationType? get childType => switch (this) {
    LocationType.warehouse => LocationType.zone,
    LocationType.zone => LocationType.rack,
    LocationType.rack => LocationType.shelf,
    LocationType.shelf => LocationType.bin,
    LocationType.bin => null,
  };
  
  LocationType? get parentType => switch (this) {
    LocationType.warehouse => null,
    LocationType.zone => LocationType.warehouse,
    LocationType.rack => LocationType.zone,
    LocationType.shelf => LocationType.rack,
    LocationType.bin => LocationType.shelf,
  };
  
  int get depth => switch (this) {
    LocationType.warehouse => 0,
    LocationType.zone => 1,
    LocationType.rack => 2,
    LocationType.shelf => 3,
    LocationType.bin => 4,
  };
}

/// Base class for all location entities
abstract class LocationEntity extends BaseEntity with CodedEntity, Auditable, SoftDeletable {
  /// Location code (unique within parent)
  @override
  final String code;
  
  /// Display name
  final String name;
  
  /// Location type
  final LocationType locationType;
  
  /// Parent location ID (null for warehouses)
  final String? parentId;
  
  /// Warehouse ID (for quick lookups)
  final String warehouseId;
  
  /// Maximum capacity (units or weight)
  final double? capacity;
  
  /// Capacity unit (UNITS, KG, M3)
  final String? capacityUnit;
  
  /// Is location active
  final bool isActive;
  
  /// Sort order within parent
  final int sortOrder;
  
  /// Additional configuration (JSON)
  final Map<String, dynamic>? config;
  
  /// Description/notes
  final String? description;
  
  // Auditable mixin
  @override
  final String? createdBy;
  @override
  final String? updatedBy;
  
  // SoftDeletable mixin
  @override
  final bool isDeleted;
  @override
  final DateTime? deletedAt;
  @override
  final String? deletedBy;
  
  LocationEntity({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required this.code,
    required this.name,
    required this.locationType,
    this.parentId,
    required this.warehouseId,
    this.capacity,
    this.capacityUnit,
    this.isActive = true,
    this.sortOrder = 0,
    this.config,
    this.description,
    this.createdBy,
    this.updatedBy,
    this.isDeleted = false,
    this.deletedAt,
    this.deletedBy,
  });
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...baseToMap(),
      'code': code,
      'name': name,
      'locationType': locationType.name,
      'parentId': parentId,
      'warehouseId': warehouseId,
      'capacity': capacity,
      'capacityUnit': capacityUnit,
      'isActive': isActive ? 1 : 0,
      'sortOrder': sortOrder,
      'config': config?.toString(),
      'description': description,
      'createdBy': createdBy,
      'updatedBy': updatedBy,
      'isDeleted': isDeleted ? 1 : 0,
      'deletedAt': deletedAt?.toIso8601String(),
      'deletedBy': deletedBy,
    };
  }
}

/// Warehouse entity - top level storage facility
class Warehouse extends LocationEntity {
  /// Street address
  final String? address;
  
  /// City
  final String? city;
  
  /// State/Province
  final String? state;
  
  /// Postal/ZIP code
  final String? postalCode;
  
  /// Country
  final String? country;
  
  /// Contact person name
  final String? contactPerson;
  
  /// Contact phone
  final String? contactPhone;
  
  /// Contact email
  final String? contactEmail;
  
  /// Operating hours
  final String? operatingHours;
  
  /// Geo coordinates
  final double? latitude;
  final double? longitude;
  
  Warehouse({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required super.code,
    required super.name,
    super.capacity,
    super.capacityUnit,
    super.isActive = true,
    super.sortOrder = 0,
    super.config,
    super.description,
    super.createdBy,
    super.updatedBy,
    super.isDeleted = false,
    super.deletedAt,
    super.deletedBy,
    this.address,
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.contactPerson,
    this.contactPhone,
    this.contactEmail,
    this.operatingHours,
    this.latitude,
    this.longitude,
  }) : super(
    locationType: LocationType.warehouse,
    parentId: null,
    warehouseId: id ?? '',
  );
  
  @override
  Warehouse copyWithBase({
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
  
  Warehouse copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? code,
    String? name,
    double? capacity,
    String? capacityUnit,
    bool? isActive,
    int? sortOrder,
    Map<String, dynamic>? config,
    String? description,
    String? createdBy,
    String? updatedBy,
    bool? isDeleted,
    DateTime? deletedAt,
    String? deletedBy,
    String? address,
    String? city,
    String? state,
    String? postalCode,
    String? country,
    String? contactPerson,
    String? contactPhone,
    String? contactEmail,
    String? operatingHours,
    double? latitude,
    double? longitude,
  }) {
    return Warehouse(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      code: code ?? this.code,
      name: name ?? this.name,
      capacity: capacity ?? this.capacity,
      capacityUnit: capacityUnit ?? this.capacityUnit,
      isActive: isActive ?? this.isActive,
      sortOrder: sortOrder ?? this.sortOrder,
      config: config ?? this.config,
      description: description ?? this.description,
      createdBy: createdBy ?? this.createdBy,
      updatedBy: updatedBy ?? this.updatedBy,
      isDeleted: isDeleted ?? this.isDeleted,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
      address: address ?? this.address,
      city: city ?? this.city,
      state: state ?? this.state,
      postalCode: postalCode ?? this.postalCode,
      country: country ?? this.country,
      contactPerson: contactPerson ?? this.contactPerson,
      contactPhone: contactPhone ?? this.contactPhone,
      contactEmail: contactEmail ?? this.contactEmail,
      operatingHours: operatingHours ?? this.operatingHours,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...super.toMap(),
      'warehouseId': id, // Self-reference
      'address': address,
      'city': city,
      'state': state,
      'postalCode': postalCode,
      'country': country,
      'contactPerson': contactPerson,
      'contactPhone': contactPhone,
      'contactEmail': contactEmail,
      'operatingHours': operatingHours,
      'latitude': latitude,
      'longitude': longitude,
    };
  }
  
  factory Warehouse.fromMap(Map<String, dynamic> map) {
    return Warehouse(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      code: map['code'] as String,
      name: map['name'] as String,
      capacity: (map['capacity'] as num?)?.toDouble(),
      capacityUnit: map['capacityUnit'] as String?,
      isActive: (map['isActive'] as int?) != 0,
      sortOrder: (map['sortOrder'] as int?) ?? 0,
      description: map['description'] as String?,
      createdBy: map['createdBy'] as String?,
      updatedBy: map['updatedBy'] as String?,
      isDeleted: (map['isDeleted'] as int?) == 1,
      deletedAt: map['deletedAt'] != null ? DateTime.parse(map['deletedAt'] as String) : null,
      deletedBy: map['deletedBy'] as String?,
      address: map['address'] as String?,
      city: map['city'] as String?,
      state: map['state'] as String?,
      postalCode: map['postalCode'] as String?,
      country: map['country'] as String?,
      contactPerson: map['contactPerson'] as String?,
      contactPhone: map['contactPhone'] as String?,
      contactEmail: map['contactEmail'] as String?,
      operatingHours: map['operatingHours'] as String?,
      latitude: (map['latitude'] as num?)?.toDouble(),
      longitude: (map['longitude'] as num?)?.toDouble(),
    );
  }
  
  @override
  String toString() => 'Warehouse($code: $name)';
}

/// Generic storage location (Zone, Rack, Shelf, Bin)
class StorageLocation extends LocationEntity {
  /// Row position (for visual grid)
  final int? row;
  
  /// Column position (for visual grid)
  final int? column;
  
  /// Level/Height position
  final int? level;
  
  /// Temperature zone (AMBIENT, COLD, FROZEN)
  final String? temperatureZone;
  
  /// Hazmat allowed
  final bool allowsHazmat;
  
  /// Picking priority (lower = preferred)
  final int pickingPriority;
  
  StorageLocation({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required super.code,
    required super.name,
    required super.locationType,
    required super.parentId,
    required super.warehouseId,
    super.capacity,
    super.capacityUnit,
    super.isActive = true,
    super.sortOrder = 0,
    super.config,
    super.description,
    super.createdBy,
    super.updatedBy,
    super.isDeleted = false,
    super.deletedAt,
    super.deletedBy,
    this.row,
    this.column,
    this.level,
    this.temperatureZone,
    this.allowsHazmat = false,
    this.pickingPriority = 100,
  });
  
  @override
  StorageLocation copyWithBase({
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
  
  StorageLocation copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? code,
    String? name,
    LocationType? locationType,
    String? parentId,
    String? warehouseId,
    double? capacity,
    String? capacityUnit,
    bool? isActive,
    int? sortOrder,
    Map<String, dynamic>? config,
    String? description,
    String? createdBy,
    String? updatedBy,
    bool? isDeleted,
    DateTime? deletedAt,
    String? deletedBy,
    int? row,
    int? column,
    int? level,
    String? temperatureZone,
    bool? allowsHazmat,
    int? pickingPriority,
  }) {
    return StorageLocation(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      code: code ?? this.code,
      name: name ?? this.name,
      locationType: locationType ?? this.locationType,
      parentId: parentId ?? this.parentId,
      warehouseId: warehouseId ?? this.warehouseId,
      capacity: capacity ?? this.capacity,
      capacityUnit: capacityUnit ?? this.capacityUnit,
      isActive: isActive ?? this.isActive,
      sortOrder: sortOrder ?? this.sortOrder,
      config: config ?? this.config,
      description: description ?? this.description,
      createdBy: createdBy ?? this.createdBy,
      updatedBy: updatedBy ?? this.updatedBy,
      isDeleted: isDeleted ?? this.isDeleted,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
      row: row ?? this.row,
      column: column ?? this.column,
      level: level ?? this.level,
      temperatureZone: temperatureZone ?? this.temperatureZone,
      allowsHazmat: allowsHazmat ?? this.allowsHazmat,
      pickingPriority: pickingPriority ?? this.pickingPriority,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...super.toMap(),
      'row': row,
      'column': column,
      'level': level,
      'temperatureZone': temperatureZone,
      'allowsHazmat': allowsHazmat ? 1 : 0,
      'pickingPriority': pickingPriority,
    };
  }
  
  factory StorageLocation.fromMap(Map<String, dynamic> map) {
    return StorageLocation(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      code: map['code'] as String,
      name: map['name'] as String,
      locationType: LocationType.values.byName(map['locationType'] as String),
      parentId: map['parentId'] as String?,
      warehouseId: map['warehouseId'] as String,
      capacity: (map['capacity'] as num?)?.toDouble(),
      capacityUnit: map['capacityUnit'] as String?,
      isActive: (map['isActive'] as int?) != 0,
      sortOrder: (map['sortOrder'] as int?) ?? 0,
      description: map['description'] as String?,
      createdBy: map['createdBy'] as String?,
      updatedBy: map['updatedBy'] as String?,
      isDeleted: (map['isDeleted'] as int?) == 1,
      deletedAt: map['deletedAt'] != null ? DateTime.parse(map['deletedAt'] as String) : null,
      deletedBy: map['deletedBy'] as String?,
      row: map['row'] as int?,
      column: map['column'] as int?,
      level: map['level'] as int?,
      temperatureZone: map['temperatureZone'] as String?,
      allowsHazmat: (map['allowsHazmat'] as int?) == 1,
      pickingPriority: (map['pickingPriority'] as int?) ?? 100,
    );
  }
  
  @override
  String toString() => 'StorageLocation(${locationType.displayName} $code: $name)';
}

/// Full location path for display
class LocationPath {
  final Warehouse warehouse;
  final StorageLocation? zone;
  final StorageLocation? rack;
  final StorageLocation? shelf;
  final StorageLocation? bin;
  
  const LocationPath({
    required this.warehouse,
    this.zone,
    this.rack,
    this.shelf,
    this.bin,
  });
  
  /// Get the deepest location in the path
  LocationEntity get deepestLocation {
    return bin ?? shelf ?? rack ?? zone ?? warehouse;
  }
  
  /// Get full path string
  String get fullPath {
    final parts = <String>[warehouse.code];
    if (zone != null) parts.add(zone!.code);
    if (rack != null) parts.add(rack!.code);
    if (shelf != null) parts.add(shelf!.code);
    if (bin != null) parts.add(bin!.code);
    return parts.join(' → ');
  }
  
  /// Get short display name
  String get shortName {
    return deepestLocation.code;
  }
  
  @override
  String toString() => fullPath;
}
