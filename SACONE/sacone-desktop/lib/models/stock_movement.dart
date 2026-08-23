enum MovementType {
  stockIn('Stock In', 'IN'),
  stockOut('Stock Out', 'OUT'),
  transfer('Transfer', 'TRF'),
  adjustment('Adjustment', 'ADJ'),
  return_('Return', 'RET');

  final String label;
  final String code;

  const MovementType(this.label, this.code);

  static MovementType fromCode(String code) {
    return MovementType.values.firstWhere(
      (type) => type.code == code,
      orElse: () => MovementType.stockIn,
    );
  }
}

/// Core model for stock movement audit trail
/// Every stock change must create a movement record
class StockMovement {
  final String id;
  final String itemId;
  final String itemName; // Denormalized for quick display
  final String itemSku;
  final String warehouseId;
  final String warehouseName; // Denormalized
  final String zoneId;
  final String zoneName; // Denormalized
  final String rackId;
  final String rackName; // Denormalized
  final String shelfId;
  final String shelfName; // Denormalized
  final String binId;
  final String binName; // Denormalized
  final String locationCode; // Human-readable: WH-01/A/R03/S02/B05
  final MovementType movementType;
  final double quantityBefore;
  final double quantityChanged;
  final double quantityAfter;
  final String? referenceNumber;
  final String? batchNumber;
  final DateTime? expiryDate;
  final String? fromWarehouseId;
  final String? fromLocationCode; // For transfers
  final String? reason;
  final String? notes;
  final String performedBy; // User who performed action
  final DateTime movementDate;
  final DateTime createdAt;

  StockMovement({
    required this.id,
    required this.itemId,
    required this.itemName,
    required this.itemSku,
    required this.warehouseId,
    required this.warehouseName,
    required this.zoneId,
    required this.zoneName,
    required this.rackId,
    required this.rackName,
    required this.shelfId,
    required this.shelfName,
    required this.binId,
    required this.binName,
    required this.locationCode,
    required this.movementType,
    required this.quantityBefore,
    required this.quantityChanged,
    required this.quantityAfter,
    this.referenceNumber,
    this.batchNumber,
    this.expiryDate,
    this.fromWarehouseId,
    this.fromLocationCode,
    this.reason,
    this.notes,
    required this.performedBy,
    required this.movementDate,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'itemId': itemId,
      'itemName': itemName,
      'itemSku': itemSku,
      'warehouseId': warehouseId,
      'warehouseName': warehouseName,
      'zoneId': zoneId,
      'zoneName': zoneName,
      'rackId': rackId,
      'rackName': rackName,
      'shelfId': shelfId,
      'shelfName': shelfName,
      'binId': binId,
      'binName': binName,
      'locationCode': locationCode,
      'movementType': movementType.code,
      'quantityBefore': quantityBefore,
      'quantityChanged': quantityChanged,
      'quantityAfter': quantityAfter,
      'referenceNumber': referenceNumber,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'fromWarehouseId': fromWarehouseId,
      'fromLocationCode': fromLocationCode,
      'reason': reason,
      'notes': notes,
      'performedBy': performedBy,
      'movementDate': movementDate.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory StockMovement.fromMap(Map<String, dynamic> map) {
    return StockMovement(
      id: map['id'],
      itemId: map['itemId'],
      itemName: map['itemName'],
      itemSku: map['itemSku'],
      warehouseId: map['warehouseId'],
      warehouseName: map['warehouseName'],
      zoneId: map['zoneId'],
      zoneName: map['zoneName'],
      rackId: map['rackId'],
      rackName: map['rackName'],
      shelfId: map['shelfId'],
      shelfName: map['shelfName'],
      binId: map['binId'],
      binName: map['binName'],
      locationCode: map['locationCode'],
      movementType: MovementType.fromCode(map['movementType']),
      quantityBefore: map['quantityBefore'],
      quantityChanged: map['quantityChanged'],
      quantityAfter: map['quantityAfter'],
      referenceNumber: map['referenceNumber'],
      batchNumber: map['batchNumber'],
      expiryDate: map['expiryDate'] != null 
          ? DateTime.parse(map['expiryDate']) 
          : null,
      fromWarehouseId: map['fromWarehouseId'],
      fromLocationCode: map['fromLocationCode'],
      reason: map['reason'],
      notes: map['notes'],
      performedBy: map['performedBy'],
      movementDate: DateTime.parse(map['movementDate']),
      createdAt: DateTime.parse(map['createdAt']),
    );
  }
}

/// Real-time stock quantity per location
/// This is the source of truth for current stock levels
class LocationStock {
  final String id;
  final String itemId;
  final String warehouseId;
  final String zoneId;
  final String rackId;
  final String shelfId;
  final String binId;
  final double quantity;
  final String? batchNumber;
  final DateTime? expiryDate;
  final DateTime lastMovementDate;
  final DateTime updatedAt;

  LocationStock({
    required this.id,
    required this.itemId,
    required this.warehouseId,
    required this.zoneId,
    required this.rackId,
    required this.shelfId,
    required this.binId,
    required this.quantity,
    this.batchNumber,
    this.expiryDate,
    required this.lastMovementDate,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'itemId': itemId,
      'warehouseId': warehouseId,
      'zoneId': zoneId,
      'rackId': rackId,
      'shelfId': shelfId,
      'binId': binId,
      'quantity': quantity,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'lastMovementDate': lastMovementDate.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory LocationStock.fromMap(Map<String, dynamic> map) {
    return LocationStock(
      id: map['id'],
      itemId: map['itemId'],
      warehouseId: map['warehouseId'],
      zoneId: map['zoneId'],
      rackId: map['rackId'],
      shelfId: map['shelfId'],
      binId: map['binId'],
      quantity: map['quantity'],
      batchNumber: map['batchNumber'],
      expiryDate: map['expiryDate'] != null 
          ? DateTime.parse(map['expiryDate']) 
          : null,
      lastMovementDate: DateTime.parse(map['lastMovementDate']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  LocationStock copyWith({
    String? id,
    String? itemId,
    String? warehouseId,
    String? zoneId,
    String? rackId,
    String? shelfId,
    String? binId,
    double? quantity,
    String? batchNumber,
    DateTime? expiryDate,
    DateTime? lastMovementDate,
    DateTime? updatedAt,
  }) {
    return LocationStock(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      warehouseId: warehouseId ?? this.warehouseId,
      zoneId: zoneId ?? this.zoneId,
      rackId: rackId ?? this.rackId,
      shelfId: shelfId ?? this.shelfId,
      binId: binId ?? this.binId,
      quantity: quantity ?? this.quantity,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
      lastMovementDate: lastMovementDate ?? this.lastMovementDate,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

/// Stock transfer between locations
class StockTransfer {
  final String id;
  final String itemId;
  final String fromWarehouseId;
  final String fromZoneId;
  final String fromRackId;
  final String fromShelfId;
  final String fromBinId;
  final String toWarehouseId;
  final String toZoneId;
  final String toRackId;
  final String toShelfId;
  final String toBinId;
  final double quantity;
  final String? batchNumber;
  final String? referenceNumber;
  final String? reason;
  final String? notes;
  final String initiatedBy;
  final String? approvedBy;
  final TransferStatus status;
  final DateTime transferDate;
  final DateTime createdAt;
  final DateTime? completedAt;

  StockTransfer({
    required this.id,
    required this.itemId,
    required this.fromWarehouseId,
    required this.fromZoneId,
    required this.fromRackId,
    required this.fromShelfId,
    required this.fromBinId,
    required this.toWarehouseId,
    required this.toZoneId,
    required this.toRackId,
    required this.toShelfId,
    required this.toBinId,
    required this.quantity,
    this.batchNumber,
    this.referenceNumber,
    this.reason,
    this.notes,
    required this.initiatedBy,
    this.approvedBy,
    required this.status,
    required this.transferDate,
    required this.createdAt,
    this.completedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'itemId': itemId,
      'fromWarehouseId': fromWarehouseId,
      'fromZoneId': fromZoneId,
      'fromRackId': fromRackId,
      'fromShelfId': fromShelfId,
      'fromBinId': fromBinId,
      'toWarehouseId': toWarehouseId,
      'toZoneId': toZoneId,
      'toRackId': toRackId,
      'toShelfId': toShelfId,
      'toBinId': toBinId,
      'quantity': quantity,
      'batchNumber': batchNumber,
      'referenceNumber': referenceNumber,
      'reason': reason,
      'notes': notes,
      'initiatedBy': initiatedBy,
      'approvedBy': approvedBy,
      'status': status.name,
      'transferDate': transferDate.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
      'completedAt': completedAt?.toIso8601String(),
    };
  }

  factory StockTransfer.fromMap(Map<String, dynamic> map) {
    return StockTransfer(
      id: map['id'],
      itemId: map['itemId'],
      fromWarehouseId: map['fromWarehouseId'],
      fromZoneId: map['fromZoneId'],
      fromRackId: map['fromRackId'],
      fromShelfId: map['fromShelfId'],
      fromBinId: map['fromBinId'],
      toWarehouseId: map['toWarehouseId'],
      toZoneId: map['toZoneId'],
      toRackId: map['toRackId'],
      toShelfId: map['toShelfId'],
      toBinId: map['toBinId'],
      quantity: map['quantity'],
      batchNumber: map['batchNumber'],
      referenceNumber: map['referenceNumber'],
      reason: map['reason'],
      notes: map['notes'],
      initiatedBy: map['initiatedBy'],
      approvedBy: map['approvedBy'],
      status: TransferStatus.values.byName(map['status']),
      transferDate: DateTime.parse(map['transferDate']),
      createdAt: DateTime.parse(map['createdAt']),
      completedAt: map['completedAt'] != null 
          ? DateTime.parse(map['completedAt']) 
          : null,
    );
  }
}

enum TransferStatus {
  pending,
  approved,
  completed,
  cancelled
}
