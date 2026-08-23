/// ============================================================
/// STOCK ENTITY - Current inventory at locations
/// ============================================================
/// 
/// Represents current stock level of an item at a specific location.
/// Supports batch and expiry tracking for pharmacy/food items.
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'base_entity.dart';

/// Stock status based on quantity vs thresholds
enum StockStatus {
  /// Quantity > reorder level
  healthy,
  
  /// Quantity <= reorder level but > minimum level
  low,
  
  /// Quantity <= minimum level
  critical,
  
  /// Quantity is zero
  outOfStock,
}

extension StockStatusExtension on StockStatus {
  String get displayName => switch (this) {
    StockStatus.healthy => 'In Stock',
    StockStatus.low => 'Low Stock',
    StockStatus.critical => 'Critical',
    StockStatus.outOfStock => 'Out of Stock',
  };
  
  String get colorCode => switch (this) {
    StockStatus.healthy => '#10B981', // Green
    StockStatus.low => '#F59E0B', // Amber
    StockStatus.critical => '#EF4444', // Red
    StockStatus.outOfStock => '#6B7280', // Gray
  };
  
  int get priority => switch (this) {
    StockStatus.outOfStock => 4,
    StockStatus.critical => 3,
    StockStatus.low => 2,
    StockStatus.healthy => 1,
  };
}

/// Current stock at a specific location
class Stock extends BaseEntity {
  /// Reference to item
  final String itemId;
  
  /// Reference to location (bin, shelf, rack, zone, or warehouse)
  final String locationId;
  
  /// Location type for quick filtering
  final String locationType;
  
  /// Reference to warehouse (denormalized for performance)
  final String warehouseId;
  
  /// Current quantity
  final double quantity;
  
  /// Reserved quantity (for pending operations)
  final double reservedQuantity;
  
  /// Batch number (for batch-tracked items)
  final String? batchNumber;
  
  /// Expiry date (for expiry-tracked items)
  final DateTime? expiryDate;
  
  /// Manufacturing date
  final DateTime? manufacturingDate;
  
  /// Serial number (for serial-tracked items)
  final String? serialNumber;
  
  /// Cost price for this specific batch/lot
  final double? lotCostPrice;
  
  /// Last stock count date
  final DateTime? lastCountedAt;
  
  /// Last counted by user
  final String? lastCountedBy;
  
  /// Additional attributes
  final Map<String, dynamic>? attributes;
  
  Stock({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required this.itemId,
    required this.locationId,
    required this.locationType,
    required this.warehouseId,
    this.quantity = 0,
    this.reservedQuantity = 0,
    this.batchNumber,
    this.expiryDate,
    this.manufacturingDate,
    this.serialNumber,
    this.lotCostPrice,
    this.lastCountedAt,
    this.lastCountedBy,
    this.attributes,
  });
  
  /// Available quantity (total - reserved)
  double get availableQuantity => quantity - reservedQuantity;
  
  /// Check if batch is expired
  bool get isExpired {
    if (expiryDate == null) return false;
    return expiryDate!.isBefore(DateTime.now());
  }
  
  /// Days until expiry (negative if expired)
  int? get daysUntilExpiry {
    if (expiryDate == null) return null;
    return expiryDate!.difference(DateTime.now()).inDays;
  }
  
  /// Check if expiring soon (within given days)
  bool isExpiringSoon(int withinDays) {
    final days = daysUntilExpiry;
    if (days == null) return false;
    return days >= 0 && days <= withinDays;
  }
  
  @override
  Stock copyWithBase({
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
  
  Stock copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? itemId,
    String? locationId,
    String? locationType,
    String? warehouseId,
    double? quantity,
    double? reservedQuantity,
    String? batchNumber,
    DateTime? expiryDate,
    DateTime? manufacturingDate,
    String? serialNumber,
    double? lotCostPrice,
    DateTime? lastCountedAt,
    String? lastCountedBy,
    Map<String, dynamic>? attributes,
  }) {
    return Stock(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      itemId: itemId ?? this.itemId,
      locationId: locationId ?? this.locationId,
      locationType: locationType ?? this.locationType,
      warehouseId: warehouseId ?? this.warehouseId,
      quantity: quantity ?? this.quantity,
      reservedQuantity: reservedQuantity ?? this.reservedQuantity,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
      manufacturingDate: manufacturingDate ?? this.manufacturingDate,
      serialNumber: serialNumber ?? this.serialNumber,
      lotCostPrice: lotCostPrice ?? this.lotCostPrice,
      lastCountedAt: lastCountedAt ?? this.lastCountedAt,
      lastCountedBy: lastCountedBy ?? this.lastCountedBy,
      attributes: attributes ?? this.attributes,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...baseToMap(),
      'itemId': itemId,
      'locationId': locationId,
      'locationType': locationType,
      'warehouseId': warehouseId,
      'quantity': quantity,
      'reservedQuantity': reservedQuantity,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'manufacturingDate': manufacturingDate?.toIso8601String(),
      'serialNumber': serialNumber,
      'lotCostPrice': lotCostPrice,
      'lastCountedAt': lastCountedAt?.toIso8601String(),
      'lastCountedBy': lastCountedBy,
      'attributes': attributes?.toString(),
    };
  }
  
  factory Stock.fromMap(Map<String, dynamic> map) {
    return Stock(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      itemId: map['itemId'] as String,
      locationId: map['locationId'] as String,
      locationType: map['locationType'] as String,
      warehouseId: map['warehouseId'] as String,
      quantity: (map['quantity'] as num?)?.toDouble() ?? 0,
      reservedQuantity: (map['reservedQuantity'] as num?)?.toDouble() ?? 0,
      batchNumber: map['batchNumber'] as String?,
      expiryDate: map['expiryDate'] != null 
          ? DateTime.parse(map['expiryDate'] as String) 
          : null,
      manufacturingDate: map['manufacturingDate'] != null 
          ? DateTime.parse(map['manufacturingDate'] as String) 
          : null,
      serialNumber: map['serialNumber'] as String?,
      lotCostPrice: (map['lotCostPrice'] as num?)?.toDouble(),
      lastCountedAt: map['lastCountedAt'] != null 
          ? DateTime.parse(map['lastCountedAt'] as String) 
          : null,
      lastCountedBy: map['lastCountedBy'] as String?,
    );
  }
  
  @override
  String toString() => 'Stock(item: $itemId, loc: $locationId, qty: $quantity)';
}

/// Aggregated stock summary for an item
class ItemStockSummary {
  final String itemId;
  final String itemName;
  final String itemSku;
  final double totalQuantity;
  final double totalReserved;
  final double reorderLevel;
  final double minimumLevel;
  final int locationCount;
  final int warehouseCount;
  final DateTime? nearestExpiry;
  final StockStatus status;
  
  const ItemStockSummary({
    required this.itemId,
    required this.itemName,
    required this.itemSku,
    required this.totalQuantity,
    required this.totalReserved,
    required this.reorderLevel,
    required this.minimumLevel,
    required this.locationCount,
    required this.warehouseCount,
    this.nearestExpiry,
    required this.status,
  });
  
  double get availableQuantity => totalQuantity - totalReserved;
  
  factory ItemStockSummary.fromMap(Map<String, dynamic> map) {
    final totalQty = (map['totalQuantity'] as num?)?.toDouble() ?? 0;
    final reorder = (map['reorderLevel'] as num?)?.toDouble() ?? 10;
    final minimum = (map['minimumLevel'] as num?)?.toDouble() ?? 5;
    
    StockStatus status;
    if (totalQty == 0) {
      status = StockStatus.outOfStock;
    } else if (totalQty <= minimum) {
      status = StockStatus.critical;
    } else if (totalQty <= reorder) {
      status = StockStatus.low;
    } else {
      status = StockStatus.healthy;
    }
    
    return ItemStockSummary(
      itemId: map['itemId'] as String,
      itemName: map['itemName'] as String? ?? '',
      itemSku: map['itemSku'] as String? ?? '',
      totalQuantity: totalQty,
      totalReserved: (map['totalReserved'] as num?)?.toDouble() ?? 0,
      reorderLevel: reorder,
      minimumLevel: minimum,
      locationCount: (map['locationCount'] as int?) ?? 0,
      warehouseCount: (map['warehouseCount'] as int?) ?? 0,
      nearestExpiry: map['nearestExpiry'] != null 
          ? DateTime.parse(map['nearestExpiry'] as String) 
          : null,
      status: status,
    );
  }
}

/// Stock at a specific location with item details
class LocationStock {
  final Stock stock;
  final String itemName;
  final String itemSku;
  final String? itemBarcode;
  final String locationCode;
  final String locationName;
  final String fullPath;
  
  const LocationStock({
    required this.stock,
    required this.itemName,
    required this.itemSku,
    this.itemBarcode,
    required this.locationCode,
    required this.locationName,
    required this.fullPath,
  });
  
  factory LocationStock.fromMap(Map<String, dynamic> map) {
    return LocationStock(
      stock: Stock.fromMap(map),
      itemName: map['itemName'] as String? ?? '',
      itemSku: map['itemSku'] as String? ?? '',
      itemBarcode: map['itemBarcode'] as String?,
      locationCode: map['locationCode'] as String? ?? '',
      locationName: map['locationName'] as String? ?? '',
      fullPath: map['fullPath'] as String? ?? '',
    );
  }
}
