/// Enum for adjustment types
enum AdjustmentType {
  increase('Increase', 'INC'),
  decrease('Decrease', 'DEC'),
  correction('Correction', 'COR'),
  damageWaste('Damage/Waste', 'DMG'),
  expiry('Expiry', 'EXP'),
  inventory('Physical Inventory', 'PHY');

  final String label;
  final String code;

  const AdjustmentType(this.label, this.code);

  static AdjustmentType fromCode(String code) {
    return AdjustmentType.values.firstWhere(
      (type) => type.code == code,
      orElse: () => AdjustmentType.increase,
    );
  }
}

/// Enum for adjustment status
enum AdjustmentStatus {
  pending('Pending', 'PND'),
  approved('Approved', 'APR'),
  rejected('Rejected', 'REJ');

  final String label;
  final String code;

  const AdjustmentStatus(this.label, this.code);

  static AdjustmentStatus fromCode(String code) {
    return AdjustmentStatus.values.firstWhere(
      (status) => status.code == code,
      orElse: () => AdjustmentStatus.pending,
    );
  }
}

/// Model for stock adjustment
class StockAdjustment {
  final String id;
  final String itemId;
  final String itemName; // Denormalized
  final String itemSku; // Denormalized
  final String warehouseId;
  final String warehouseName; // Denormalized
  final String? cellId;
  final String? cellName; // Denormalized
  final String? batchNumber;
  final DateTime? expiryDate;
  final double quantityBefore;
  final double quantityAdjusted;
  final double quantityAfter;
  final AdjustmentType adjustmentType;
  final AdjustmentStatus status;
  final String reason;
  final String? referenceDocument;
  final String? notes;
  final String createdBy;
  final String? approvedBy;
  final DateTime createdAt;
  final DateTime? approvedAt;
  final DateTime updatedAt;

  StockAdjustment({
    required this.id,
    required this.itemId,
    required this.itemName,
    required this.itemSku,
    required this.warehouseId,
    required this.warehouseName,
    this.cellId,
    this.cellName,
    this.batchNumber,
    this.expiryDate,
    required this.quantityBefore,
    required this.quantityAdjusted,
    required this.quantityAfter,
    required this.adjustmentType,
    required this.status,
    required this.reason,
    this.referenceDocument,
    this.notes,
    required this.createdBy,
    this.approvedBy,
    required this.createdAt,
    this.approvedAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'itemId': itemId,
      'itemName': itemName,
      'itemSku': itemSku,
      'warehouseId': warehouseId,
      'warehouseName': warehouseName,
      'cellId': cellId,
      'cellName': cellName,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'quantityBefore': quantityBefore,
      'quantityAdjusted': quantityAdjusted,
      'quantityAfter': quantityAfter,
      'adjustmentType': adjustmentType.code,
      'status': status.code,
      'reason': reason,
      'referenceDocument': referenceDocument,
      'notes': notes,
      'createdBy': createdBy,
      'approvedBy': approvedBy,
      'createdAt': createdAt.toIso8601String(),
      'approvedAt': approvedAt?.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory StockAdjustment.fromMap(Map<String, dynamic> map) {
    return StockAdjustment(
      id: map['id'] as String? ?? '',
      itemId: map['itemId'] as String? ?? '',
      itemName: map['itemName'] as String? ?? '',
      itemSku: map['itemSku'] as String? ?? '',
      warehouseId: map['warehouseId'] as String? ?? '',
      warehouseName: map['warehouseName'] as String? ?? '',
      cellId: map['cellId'] as String?,
      cellName: map['cellName'] as String?,
      batchNumber: map['batchNumber'] as String?,
      expiryDate: map['expiryDate'] != null
          ? DateTime.tryParse(map['expiryDate'].toString())
          : null,
      quantityBefore: (map['quantityBefore'] as num?)?.toDouble() ?? 0,
      quantityAdjusted: (map['quantityAdjusted'] as num?)?.toDouble() ?? 0,
      quantityAfter: (map['quantityAfter'] as num?)?.toDouble() ?? 0,
      adjustmentType: AdjustmentType.fromCode(map['adjustmentType'] as String? ?? 'INC'),
      status: AdjustmentStatus.fromCode(map['status'] as String? ?? 'PND'),
      reason: map['reason'] as String? ?? '',
      referenceDocument: map['referenceDocument'] as String?,
      notes: map['notes'] as String?,
      createdBy: map['createdBy'] as String? ?? 'system',
      approvedBy: map['approvedBy'] as String?,
      createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
      approvedAt: map['approvedAt'] != null
          ? DateTime.tryParse(map['approvedAt'].toString())
          : null,
      updatedAt: DateTime.tryParse(map['updatedAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  StockAdjustment copyWith({
    String? id,
    String? itemId,
    String? itemName,
    String? itemSku,
    String? warehouseId,
    String? warehouseName,
    String? cellId,
    String? cellName,
    String? batchNumber,
    DateTime? expiryDate,
    double? quantityBefore,
    double? quantityAdjusted,
    double? quantityAfter,
    AdjustmentType? adjustmentType,
    AdjustmentStatus? status,
    String? reason,
    String? referenceDocument,
    String? notes,
    String? createdBy,
    String? approvedBy,
    DateTime? createdAt,
    DateTime? approvedAt,
    DateTime? updatedAt,
  }) {
    return StockAdjustment(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      itemName: itemName ?? this.itemName,
      itemSku: itemSku ?? this.itemSku,
      warehouseId: warehouseId ?? this.warehouseId,
      warehouseName: warehouseName ?? this.warehouseName,
      cellId: cellId ?? this.cellId,
      cellName: cellName ?? this.cellName,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
      quantityBefore: quantityBefore ?? this.quantityBefore,
      quantityAdjusted: quantityAdjusted ?? this.quantityAdjusted,
      quantityAfter: quantityAfter ?? this.quantityAfter,
      adjustmentType: adjustmentType ?? this.adjustmentType,
      status: status ?? this.status,
      reason: reason ?? this.reason,
      referenceDocument: referenceDocument ?? this.referenceDocument,
      notes: notes ?? this.notes,
      createdBy: createdBy ?? this.createdBy,
      approvedBy: approvedBy ?? this.approvedBy,
      createdAt: createdAt ?? this.createdAt,
      approvedAt: approvedAt ?? this.approvedAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
