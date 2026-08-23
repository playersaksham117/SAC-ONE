/// Model for tracking batch information
class BatchInfo {
  final String id;
  final String itemId;
  final String batchNumber;
  final DateTime? manufacturingDate;
  final DateTime? expiryDate;
  final double quantity;
  final double costPrice;
  final String warehouseId;
  final String? cellId;
  final DateTime createdAt;
  final DateTime updatedAt;

  BatchInfo({
    required this.id,
    required this.itemId,
    required this.batchNumber,
    this.manufacturingDate,
    this.expiryDate,
    required this.quantity,
    required this.costPrice,
    required this.warehouseId,
    this.cellId,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Check if batch has expired
  bool get isExpired {
    if (expiryDate == null) return false;
    return DateTime.now().isAfter(expiryDate!);
  }

  /// Check if batch is nearing expiry (within 30 days)
  bool get isNearingExpiry {
    if (expiryDate == null) return false;
    final daysUntilExpiry = expiryDate!.difference(DateTime.now()).inDays;
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  }

  /// Days until expiry
  int? get daysUntilExpiry {
    if (expiryDate == null) return null;
    return expiryDate!.difference(DateTime.now()).inDays;
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'itemId': itemId,
      'batchNumber': batchNumber,
      'manufacturingDate': manufacturingDate?.toIso8601String(),
      'expiryDate': expiryDate?.toIso8601String(),
      'quantity': quantity,
      'costPrice': costPrice,
      'warehouseId': warehouseId,
      'cellId': cellId,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory BatchInfo.fromMap(Map<String, dynamic> map) {
    return BatchInfo(
      id: map['id'] as String? ?? '',
      itemId: map['itemId'] as String? ?? '',
      batchNumber: map['batchNumber'] as String? ?? '',
      manufacturingDate: map['manufacturingDate'] != null
          ? DateTime.tryParse(map['manufacturingDate'].toString())
          : null,
      expiryDate: map['expiryDate'] != null
          ? DateTime.tryParse(map['expiryDate'].toString())
          : null,
      quantity: (map['quantity'] as num?)?.toDouble() ?? 0,
      costPrice: (map['costPrice'] as num?)?.toDouble() ?? 0,
      warehouseId: map['warehouseId'] as String? ?? '',
      cellId: map['cellId'] as String?,
      createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(map['updatedAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  BatchInfo copyWith({
    String? id,
    String? itemId,
    String? batchNumber,
    DateTime? manufacturingDate,
    DateTime? expiryDate,
    double? quantity,
    double? costPrice,
    String? warehouseId,
    String? cellId,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return BatchInfo(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      batchNumber: batchNumber ?? this.batchNumber,
      manufacturingDate: manufacturingDate ?? this.manufacturingDate,
      expiryDate: expiryDate ?? this.expiryDate,
      quantity: quantity ?? this.quantity,
      costPrice: costPrice ?? this.costPrice,
      warehouseId: warehouseId ?? this.warehouseId,
      cellId: cellId ?? this.cellId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
