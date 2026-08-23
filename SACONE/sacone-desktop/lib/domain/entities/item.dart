/// ============================================================
/// ITEM ENTITY - Master data for inventory items
/// ============================================================
/// 
/// Represents a product/item in the inventory system.
/// Contains all master data but NOT stock quantities (those are in Stock entity).
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'base_entity.dart';

/// Inventory item master data
class Item extends BaseEntity with CodedEntity, Auditable, SoftDeletable {
  /// SKU - Stock Keeping Unit (unique identifier)
  @override
  final String code; // Using code as SKU
  
  /// Item name/description
  final String name;
  
  /// Barcode (can be EAN-13, UPC, etc.)
  final String? barcode;
  
  /// Category for classification
  final String category;
  
  /// Sub-category for finer classification
  final String? subCategory;
  
  /// Unit of measurement (PCS, KG, LTR, etc.)
  final String unit;
  
  /// Brand name
  final String? brand;
  
  /// Manufacturer/Supplier name
  final String? manufacturer;
  
  /// HSN/SAC code for tax purpose
  final String? hsnCode;
  
  /// Cost price (purchase price)
  final double costPrice;
  
  /// Selling price / MRP
  final double sellingPrice;
  
  /// Tax percentage
  final double taxPercent;
  
  /// Reorder level - trigger low stock alert
  final double reorderLevel;
  
  /// Minimum stock level - trigger critical alert
  final double minimumLevel;
  
  /// Maximum stock level (for overstocking alerts)
  final double? maximumLevel;
  
  /// Whether batch tracking is required
  final bool isBatchRequired;
  
  /// Whether expiry tracking is required
  final bool isExpiryRequired;
  
  /// Whether serial number tracking is required
  final bool isSerialRequired;
  
  /// Weight in standard unit (kg)
  final double? weight;
  
  /// Volume in standard unit (cubic meters)
  final double? volume;
  
  /// Dimensions (LxWxH in cm)
  final ItemDimensions? dimensions;
  
  /// Custom attributes (JSON)
  final Map<String, dynamic>? attributes;
  
  /// Image URL or path
  final String? imageUrl;
  
  /// Additional notes
  final String? notes;
  
  /// Is item active
  final bool isActive;
  
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
  
  Item({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required this.code,
    required this.name,
    this.barcode,
    required this.category,
    this.subCategory,
    required this.unit,
    this.brand,
    this.manufacturer,
    this.hsnCode,
    this.costPrice = 0,
    this.sellingPrice = 0,
    this.taxPercent = 0,
    this.reorderLevel = 10,
    this.minimumLevel = 5,
    this.maximumLevel,
    this.isBatchRequired = false,
    this.isExpiryRequired = false,
    this.isSerialRequired = false,
    this.weight,
    this.volume,
    this.dimensions,
    this.attributes,
    this.imageUrl,
    this.notes,
    this.isActive = true,
    this.createdBy,
    this.updatedBy,
    this.isDeleted = false,
    this.deletedAt,
    this.deletedBy,
  });
  
  /// SKU alias for code
  String get sku => code;
  
  /// Calculate profit margin
  double get profitMargin {
    if (costPrice == 0) return 0;
    return ((sellingPrice - costPrice) / costPrice) * 100;
  }
  
  /// Calculate profit amount
  double get profitAmount => sellingPrice - costPrice;
  
  @override
  Item copyWithBase({
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
  
  Item copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? code,
    String? name,
    String? barcode,
    String? category,
    String? subCategory,
    String? unit,
    String? brand,
    String? manufacturer,
    String? hsnCode,
    double? costPrice,
    double? sellingPrice,
    double? taxPercent,
    double? reorderLevel,
    double? minimumLevel,
    double? maximumLevel,
    bool? isBatchRequired,
    bool? isExpiryRequired,
    bool? isSerialRequired,
    double? weight,
    double? volume,
    ItemDimensions? dimensions,
    Map<String, dynamic>? attributes,
    String? imageUrl,
    String? notes,
    bool? isActive,
    String? createdBy,
    String? updatedBy,
    bool? isDeleted,
    DateTime? deletedAt,
    String? deletedBy,
  }) {
    return Item(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      code: code ?? this.code,
      name: name ?? this.name,
      barcode: barcode ?? this.barcode,
      category: category ?? this.category,
      subCategory: subCategory ?? this.subCategory,
      unit: unit ?? this.unit,
      brand: brand ?? this.brand,
      manufacturer: manufacturer ?? this.manufacturer,
      hsnCode: hsnCode ?? this.hsnCode,
      costPrice: costPrice ?? this.costPrice,
      sellingPrice: sellingPrice ?? this.sellingPrice,
      taxPercent: taxPercent ?? this.taxPercent,
      reorderLevel: reorderLevel ?? this.reorderLevel,
      minimumLevel: minimumLevel ?? this.minimumLevel,
      maximumLevel: maximumLevel ?? this.maximumLevel,
      isBatchRequired: isBatchRequired ?? this.isBatchRequired,
      isExpiryRequired: isExpiryRequired ?? this.isExpiryRequired,
      isSerialRequired: isSerialRequired ?? this.isSerialRequired,
      weight: weight ?? this.weight,
      volume: volume ?? this.volume,
      dimensions: dimensions ?? this.dimensions,
      attributes: attributes ?? this.attributes,
      imageUrl: imageUrl ?? this.imageUrl,
      notes: notes ?? this.notes,
      isActive: isActive ?? this.isActive,
      createdBy: createdBy ?? this.createdBy,
      updatedBy: updatedBy ?? this.updatedBy,
      isDeleted: isDeleted ?? this.isDeleted,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...baseToMap(),
      'code': code,
      'name': name,
      'barcode': barcode,
      'category': category,
      'subCategory': subCategory,
      'unit': unit,
      'brand': brand,
      'manufacturer': manufacturer,
      'hsnCode': hsnCode,
      'costPrice': costPrice,
      'sellingPrice': sellingPrice,
      'taxPercent': taxPercent,
      'reorderLevel': reorderLevel,
      'minimumLevel': minimumLevel,
      'maximumLevel': maximumLevel,
      'isBatchRequired': isBatchRequired ? 1 : 0,
      'isExpiryRequired': isExpiryRequired ? 1 : 0,
      'isSerialRequired': isSerialRequired ? 1 : 0,
      'weight': weight,
      'volume': volume,
      'dimensionLength': dimensions?.length,
      'dimensionWidth': dimensions?.width,
      'dimensionHeight': dimensions?.height,
      'attributes': attributes?.toString(),
      'imageUrl': imageUrl,
      'notes': notes,
      'isActive': isActive ? 1 : 0,
      'createdBy': createdBy,
      'updatedBy': updatedBy,
      'isDeleted': isDeleted ? 1 : 0,
      'deletedAt': deletedAt?.toIso8601String(),
      'deletedBy': deletedBy,
    };
  }
  
  factory Item.fromMap(Map<String, dynamic> map) {
    return Item(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      code: map['code'] as String,
      name: map['name'] as String,
      barcode: map['barcode'] as String?,
      category: map['category'] as String,
      subCategory: map['subCategory'] as String?,
      unit: map['unit'] as String,
      brand: map['brand'] as String?,
      manufacturer: map['manufacturer'] as String?,
      hsnCode: map['hsnCode'] as String?,
      costPrice: (map['costPrice'] as num?)?.toDouble() ?? 0,
      sellingPrice: (map['sellingPrice'] as num?)?.toDouble() ?? 0,
      taxPercent: (map['taxPercent'] as num?)?.toDouble() ?? 0,
      reorderLevel: (map['reorderLevel'] as num?)?.toDouble() ?? 10,
      minimumLevel: (map['minimumLevel'] as num?)?.toDouble() ?? 5,
      maximumLevel: (map['maximumLevel'] as num?)?.toDouble(),
      isBatchRequired: (map['isBatchRequired'] as int?) == 1,
      isExpiryRequired: (map['isExpiryRequired'] as int?) == 1,
      isSerialRequired: (map['isSerialRequired'] as int?) == 1,
      weight: (map['weight'] as num?)?.toDouble(),
      volume: (map['volume'] as num?)?.toDouble(),
      dimensions: map['dimensionLength'] != null
          ? ItemDimensions(
              length: (map['dimensionLength'] as num).toDouble(),
              width: (map['dimensionWidth'] as num?)?.toDouble() ?? 0,
              height: (map['dimensionHeight'] as num?)?.toDouble() ?? 0,
            )
          : null,
      imageUrl: map['imageUrl'] as String?,
      notes: map['notes'] as String?,
      isActive: (map['isActive'] as int?) != 0,
      createdBy: map['createdBy'] as String?,
      updatedBy: map['updatedBy'] as String?,
      isDeleted: (map['isDeleted'] as int?) == 1,
      deletedAt: map['deletedAt'] != null 
          ? DateTime.parse(map['deletedAt'] as String) 
          : null,
      deletedBy: map['deletedBy'] as String?,
    );
  }
  
  @override
  String toString() => 'Item($code: $name)';
}

/// Item dimensions (Length x Width x Height)
class ItemDimensions {
  final double length;
  final double width;
  final double height;
  
  const ItemDimensions({
    required this.length,
    required this.width,
    required this.height,
  });
  
  /// Calculate volume in cubic centimeters
  double get volumeCm3 => length * width * height;
  
  /// Calculate volume in cubic meters
  double get volumeM3 => volumeCm3 / 1000000;
  
  @override
  String toString() => '${length}x${width}x${height} cm';
}
