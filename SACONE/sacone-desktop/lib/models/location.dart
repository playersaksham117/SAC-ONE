// Location Models
// Structure: Warehouse/Branch/Godown → Zone → Cell

class Cell {
  final String id;
  final String zoneId;  // Cell belongs to a Zone
  final String warehouseId;  // For quick lookup
  final String name;
  final String code;
  final int? capacity;
  final String? description;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  Cell({
    required this.id,
    required this.zoneId,
    required this.warehouseId,
    required this.name,
    required this.code,
    this.capacity,
    this.description,
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'zoneId': zoneId,
      'warehouseId': warehouseId,
      'name': name,
      'code': code,
      'capacity': capacity,
      'description': description,
      'isActive': isActive ? 1 : 0,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Cell.fromMap(Map<String, dynamic> map) {
    return Cell(
      id: map['id'],
      zoneId: map['zoneId'] ?? '',
      warehouseId: map['warehouseId'] ?? '',
      name: map['name'] ?? '',
      code: map['code'] ?? '',
      capacity: map['capacity'] != null ? (map['capacity'] as num).toInt() : null,
      description: map['description'],
      isActive: map['isActive'] == 1,
      createdAt: map['createdAt'] != null ? DateTime.parse(map['createdAt']) : DateTime.now(),
      updatedAt: map['updatedAt'] != null ? DateTime.parse(map['updatedAt']) : DateTime.now(),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Cell && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

// Legacy models - kept for backward compatibility during migration
class Zone {
  final String id;
  final String warehouseId;
  final String name;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  Zone({
    required this.id,
    required this.warehouseId,
    required this.name,
    this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'warehouseId': warehouseId,
      'name': name,
      'description': description,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Zone.fromMap(Map<String, dynamic> map) {
    return Zone(
      id: map['id'],
      warehouseId: map['warehouseId'],
      name: map['name'],
      description: map['description'],
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Zone && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

class Rack {
  final String id;
  final String zoneId;
  final String name;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  Rack({
    required this.id,
    required this.zoneId,
    required this.name,
    this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'zoneId': zoneId,
      'name': name,
      'description': description,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Rack.fromMap(Map<String, dynamic> map) {
    return Rack(
      id: map['id'],
      zoneId: map['zoneId'],
      name: map['name'],
      description: map['description'],
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Rack && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

class Shelf {
  final String id;
  final String rackId;
  final String name;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  Shelf({
    required this.id,
    required this.rackId,
    required this.name,
    this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'rackId': rackId,
      'name': name,
      'description': description,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Shelf.fromMap(Map<String, dynamic> map) {
    return Shelf(
      id: map['id'],
      rackId: map['rackId'],
      name: map['name'],
      description: map['description'],
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Shelf && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

class Bin {
  final String id;
  final String shelfId;
  final String name;
  final String? description;
  final double? maxCapacity;
  final DateTime createdAt;
  final DateTime updatedAt;

  Bin({
    required this.id,
    required this.shelfId,
    required this.name,
    this.description,
    this.maxCapacity,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'shelfId': shelfId,
      'name': name,
      'description': description,
      'maxCapacity': maxCapacity,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Bin.fromMap(Map<String, dynamic> map) {
    return Bin(
      id: map['id'],
      shelfId: map['shelfId'],
      name: map['name'],
      description: map['description'],
      maxCapacity: map['maxCapacity'],
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Bin && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

// Complete location path for display (simplified structure)
class LocationPath {
  final String? warehouseName;
  final String? cellName;
  
  // Legacy fields - kept for backward compatibility
  final String? zoneName;
  final String? rackName;
  final String? shelfName;
  final String? binName;

  LocationPath({
    this.warehouseName,
    this.cellName,
    this.zoneName,
    this.rackName,
    this.shelfName,
    this.binName,
  });

  String get fullPath {
    final parts = <String>[];
    if (warehouseName != null) parts.add(warehouseName!);
    
    // Use new simplified structure if cellName is present
    if (cellName != null) {
      parts.add(cellName!);
    } else {
      // Fallback to legacy structure
      if (zoneName != null) parts.add(zoneName!);
      if (rackName != null) parts.add(rackName!);
      if (shelfName != null) parts.add(shelfName!);
      if (binName != null) parts.add(binName!);
    }
    return parts.join(' → ');
  }

  String get shortPath {
    if (cellName != null) {
      return cellName!;
    }
    
    // Legacy structure
    final parts = <String>[];
    if (zoneName != null) parts.add(zoneName!);
    if (rackName != null) parts.add(rackName!);
    if (shelfName != null) parts.add(shelfName!);
    if (binName != null) parts.add(binName!);
    return parts.join('-');
  }
}
