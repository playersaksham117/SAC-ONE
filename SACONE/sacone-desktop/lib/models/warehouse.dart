class Warehouse {
  final String id;
  final String code; // Auto-generated from name
  final String name;
  final String address;
  final String? city;
  final String? state;
  final String? postalCode; // Changed from pincode
  final String? country;
  final String? contactPerson;
  final String? contactPhone;
  final String? contactEmail;
  final bool isActive;
  final DateTime createdAt;
  final DateTime? updatedAt;

  Warehouse({
    required this.id,
    required this.name,
    required this.address,
    String? code,
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.contactPerson,
    this.contactPhone,
    this.contactEmail,
    this.isActive = true,
    required this.createdAt,
    this.updatedAt,
  }) : code = code ?? _generateCode(name);

  // Generate code from warehouse name (e.g., "Main Warehouse" -> "WH-MAIN")
  static String _generateCode(String name) {
    final sanitized = name
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]'), '');
    // Clamp the length to max 4 characters, but don't exceed the sanitized string length
    final codeLength = (4).clamp(0, sanitized.length);
    final code = sanitized.substring(0, codeLength);
    return code.isEmpty ? 'WH' : 'WH-$code';
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'code': code,
      'name': name,
      'address': address,
      'city': city,
      'state': state,
      'postalCode': postalCode,
      'country': country,
      'contactPerson': contactPerson,
      'contactPhone': contactPhone,
      'contactEmail': contactEmail,
      'operatingHours': null,
      'latitude': null,
      'longitude': null,
      'capacity': null,
      'capacityUnit': null,
      'description': null,
      'config': null,
      'isActive': isActive ? 1 : 0,
      'sortOrder': 0,
      'createdBy': null,
      'updatedBy': null,
      'isDeleted': 0,
      'deletedAt': null,
      'deletedBy': null,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': (updatedAt ?? DateTime.now()).toIso8601String(),
      'syncStatus': 'local',
      'serverId': null,
    };
  }

  factory Warehouse.fromMap(Map<String, dynamic> map) {
    return Warehouse(
      id: map['id'],
      code: map['code'] ?? '',
      name: map['name'],
      address: map['address'],
      city: map['city'],
      state: map['state'],
      postalCode: map['postalCode'] ?? map['pincode'], // Support both old and new
      country: map['country'],
      contactPerson: map['contactPerson'],
      contactPhone: map['contactPhone'],
      contactEmail: map['contactEmail'],
      isActive: map['isActive'] == 1,
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: map['updatedAt'] != null ? DateTime.parse(map['updatedAt']) : null,
    );
  }
}

class StorageLocation {
  final String id;
  final String warehouseId;
  final String type; // cell, rack, zone
  final String code;
  final String? description;
  final int? row;
  final int? column;
  final int? level;
  final String zoneId;
  final String zoneName;

  StorageLocation({
    required this.id,
    required this.warehouseId,
    required this.type,
    required this.code,
    this.description,
    this.row,
    this.column,
    this.level,
    this.zoneId = '',
    this.zoneName = '',
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'warehouseId': warehouseId,
      'type': type,
      'code': code,
      'description': description,
      'row': row,
      'column': column,
      'level': level,
      'zoneId': zoneId,
      'zoneName': zoneName,
    };
  }

  factory StorageLocation.fromMap(Map<String, dynamic> map) {
    return StorageLocation(
      id: map['id'],
      warehouseId: map['warehouseId'],
      type: map['type'],
      code: map['code'],
      description: map['description'],
      row: map['row'],
      column: map['column'],
      level: map['level'],
      zoneId: map['zoneId'] ?? '',
      zoneName: map['zoneName'] ?? '',
    );
  }
}
