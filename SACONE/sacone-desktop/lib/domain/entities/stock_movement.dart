/// ============================================================
/// STOCK MOVEMENT ENTITY - Complete audit trail
/// ============================================================
/// 
/// Records every stock operation for complete traceability.
/// Supports all movement types: IN, OUT, TRANSFER, ADJUSTMENT.
/// 
/// Architecture: Domain Layer
/// ============================================================

import 'base_entity.dart';

/// Type of stock movement
enum MovementType {
  /// Stock received (purchase, return from customer)
  stockIn,
  
  /// Stock dispatched (sale, return to supplier)
  stockOut,
  
  /// Return from customer (inbound return)
  returnIn,
  
  /// Return to supplier (outbound return)
  returnOut,
  
  /// Transfer between locations
  transfer,
  
  /// Quantity adjustment (audit, damage, correction)
  adjustment,
  
  /// Disposal of stock
  disposal,
  
  /// Opening balance
  opening,
  
  /// Cycle count reconciliation
  cycleCount,
  
  /// Reserved for order
  reserve,
  
  /// Released from reservation
  release,
}

extension MovementTypeExtension on MovementType {
  String get displayName => switch (this) {
    MovementType.stockIn => 'Stock In',
    MovementType.stockOut => 'Stock Out',
    MovementType.returnIn => 'Return In',
    MovementType.returnOut => 'Return Out',
    MovementType.transfer => 'Transfer',
    MovementType.adjustment => 'Adjustment',
    MovementType.disposal => 'Disposal',
    MovementType.opening => 'Opening Balance',
    MovementType.cycleCount => 'Cycle Count',
    MovementType.reserve => 'Reserve',
    MovementType.release => 'Release',
  };
  
  String get code => switch (this) {
    MovementType.stockIn => 'IN',
    MovementType.stockOut => 'OUT',
    MovementType.returnIn => 'RIN',
    MovementType.returnOut => 'ROUT',
    MovementType.transfer => 'TRF',
    MovementType.adjustment => 'ADJ',
    MovementType.disposal => 'DSP',
    MovementType.opening => 'OPN',
    MovementType.cycleCount => 'CNT',
    MovementType.reserve => 'RSV',
    MovementType.release => 'RLS',
  };
  
  bool get increasesStock => switch (this) {
    MovementType.stockIn => true,
    MovementType.returnIn => true,
    MovementType.opening => true,
    MovementType.release => true,
    MovementType.stockOut => false,
    MovementType.returnOut => false,
    MovementType.disposal => false,
    MovementType.reserve => false,
    MovementType.transfer => false, // Neutral (in + out)
    MovementType.adjustment => false, // Can be either
    MovementType.cycleCount => false, // Can be either
  };
}

/// Reason for stock movement
enum MovementReason {
  purchase,
  sale,
  returnIn,
  returnOut,
  damage,
  expired,
  theft,
  audit,
  correction,
  relocation,
  replenishment,
  other,
}

extension MovementReasonExtension on MovementReason {
  String get displayName => switch (this) {
    MovementReason.purchase => 'Purchase',
    MovementReason.sale => 'Sale',
    MovementReason.returnIn => 'Return Received',
    MovementReason.returnOut => 'Return to Supplier',
    MovementReason.damage => 'Damaged',
    MovementReason.expired => 'Expired',
    MovementReason.theft => 'Theft/Loss',
    MovementReason.audit => 'Stock Audit',
    MovementReason.correction => 'Correction',
    MovementReason.relocation => 'Relocation',
    MovementReason.replenishment => 'Replenishment',
    MovementReason.other => 'Other',
  };
}

/// Stock movement record
class StockMovement extends BaseEntity with Auditable {
  /// Movement reference number (auto-generated)
  final String referenceNo;
  
  /// Type of movement
  final MovementType movementType;
  
  /// Reason for movement
  final MovementReason reason;
  
  /// Item reference
  final String itemId;
  
  /// Source location (null for stock-in)
  final String? sourceLocationId;
  
  /// Source warehouse
  final String? sourceWarehouseId;
  
  /// Destination location (null for stock-out)
  final String? destinationLocationId;
  
  /// Destination warehouse
  final String? destinationWarehouseId;
  
  /// Quantity moved (always positive)
  final double quantity;
  
  /// Previous quantity at source (for audit)
  final double? previousQuantity;
  
  /// New quantity after movement
  final double? newQuantity;
  
  /// Batch number
  final String? batchNumber;
  
  /// Expiry date
  final DateTime? expiryDate;
  
  /// Serial number
  final String? serialNumber;
  
  /// Unit cost at time of movement
  final double? unitCost;
  
  /// Total value of movement
  final double? totalValue;
  
  /// External reference (PO number, Invoice, etc.)
  final String? externalReference;
  
  /// Party involved (supplier/customer name)
  final String? partyName;
  
  /// Party ID reference
  final String? partyId;
  
  /// Movement date (can differ from createdAt)
  final DateTime movementDate;
  
  /// Additional notes
  final String? notes;
  
  /// Status (PENDING, COMPLETED, CANCELLED)
  final MovementStatus status;
  
  /// Related movement ID (for transfers, links IN to OUT)
  final String? relatedMovementId;
  
  /// Approval required
  final bool requiresApproval;
  
  /// Approved by user
  final String? approvedBy;
  
  /// Approval date
  final DateTime? approvedAt;
  
  // Auditable mixin
  @override
  final String? createdBy;
  @override
  final String? updatedBy;
  
  StockMovement({
    super.id,
    super.createdAt,
    super.updatedAt,
    super.syncStatus,
    super.serverId,
    required this.referenceNo,
    required this.movementType,
    this.reason = MovementReason.other,
    required this.itemId,
    this.sourceLocationId,
    this.sourceWarehouseId,
    this.destinationLocationId,
    this.destinationWarehouseId,
    required this.quantity,
    this.previousQuantity,
    this.newQuantity,
    this.batchNumber,
    this.expiryDate,
    this.serialNumber,
    this.unitCost,
    this.totalValue,
    this.externalReference,
    this.partyName,
    this.partyId,
    DateTime? movementDate,
    this.notes,
    this.status = MovementStatus.completed,
    this.relatedMovementId,
    this.requiresApproval = false,
    this.approvedBy,
    this.approvedAt,
    this.createdBy,
    this.updatedBy,
  }) : movementDate = movementDate ?? DateTime.now();
  
  /// Check if movement is a transfer
  bool get isTransfer => movementType == MovementType.transfer;
  
  /// Get effective location ID based on movement type
  String? get effectiveLocationId {
    if (movementType.increasesStock) {
      return destinationLocationId;
    }
    return sourceLocationId;
  }
  
  @override
  StockMovement copyWithBase({
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
  
  StockMovement copyWith({
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
    SyncStatus? syncStatus,
    String? serverId,
    String? referenceNo,
    MovementType? movementType,
    MovementReason? reason,
    String? itemId,
    String? sourceLocationId,
    String? sourceWarehouseId,
    String? destinationLocationId,
    String? destinationWarehouseId,
    double? quantity,
    double? previousQuantity,
    double? newQuantity,
    String? batchNumber,
    DateTime? expiryDate,
    String? serialNumber,
    double? unitCost,
    double? totalValue,
    String? externalReference,
    String? partyName,
    String? partyId,
    DateTime? movementDate,
    String? notes,
    MovementStatus? status,
    String? relatedMovementId,
    bool? requiresApproval,
    String? approvedBy,
    DateTime? approvedAt,
    String? createdBy,
    String? updatedBy,
  }) {
    return StockMovement(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      syncStatus: syncStatus ?? this.syncStatus,
      serverId: serverId ?? this.serverId,
      referenceNo: referenceNo ?? this.referenceNo,
      movementType: movementType ?? this.movementType,
      reason: reason ?? this.reason,
      itemId: itemId ?? this.itemId,
      sourceLocationId: sourceLocationId ?? this.sourceLocationId,
      sourceWarehouseId: sourceWarehouseId ?? this.sourceWarehouseId,
      destinationLocationId: destinationLocationId ?? this.destinationLocationId,
      destinationWarehouseId: destinationWarehouseId ?? this.destinationWarehouseId,
      quantity: quantity ?? this.quantity,
      previousQuantity: previousQuantity ?? this.previousQuantity,
      newQuantity: newQuantity ?? this.newQuantity,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
      serialNumber: serialNumber ?? this.serialNumber,
      unitCost: unitCost ?? this.unitCost,
      totalValue: totalValue ?? this.totalValue,
      externalReference: externalReference ?? this.externalReference,
      partyName: partyName ?? this.partyName,
      partyId: partyId ?? this.partyId,
      movementDate: movementDate ?? this.movementDate,
      notes: notes ?? this.notes,
      status: status ?? this.status,
      relatedMovementId: relatedMovementId ?? this.relatedMovementId,
      requiresApproval: requiresApproval ?? this.requiresApproval,
      approvedBy: approvedBy ?? this.approvedBy,
      approvedAt: approvedAt ?? this.approvedAt,
      createdBy: createdBy ?? this.createdBy,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }
  
  @override
  Map<String, dynamic> toMap() {
    return {
      ...baseToMap(),
      'referenceNo': referenceNo,
      'movementType': movementType.name,
      'reason': reason.name,
      'itemId': itemId,
      'sourceLocationId': sourceLocationId,
      'sourceWarehouseId': sourceWarehouseId,
      'destinationLocationId': destinationLocationId,
      'destinationWarehouseId': destinationWarehouseId,
      'quantity': quantity,
      'previousQuantity': previousQuantity,
      'newQuantity': newQuantity,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'serialNumber': serialNumber,
      'unitCost': unitCost,
      'totalValue': totalValue,
      'externalReference': externalReference,
      'partyName': partyName,
      'partyId': partyId,
      'movementDate': movementDate.toIso8601String(),
      'notes': notes,
      'status': status.name,
      'relatedMovementId': relatedMovementId,
      'requiresApproval': requiresApproval ? 1 : 0,
      'approvedBy': approvedBy,
      'approvedAt': approvedAt?.toIso8601String(),
      'createdBy': createdBy,
      'updatedBy': updatedBy,
    };
  }
  
  factory StockMovement.fromMap(Map<String, dynamic> map) {
    return StockMovement(
      id: map['id'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
      syncStatus: SyncStatus.values.byName(map['syncStatus'] as String? ?? 'local'),
      serverId: map['serverId'] as String?,
      referenceNo: map['referenceNo'] as String,
      movementType: MovementType.values.byName(map['movementType'] as String),
      reason: MovementReason.values.byName(map['reason'] as String? ?? 'other'),
      itemId: map['itemId'] as String,
      sourceLocationId: map['sourceLocationId'] as String?,
      sourceWarehouseId: map['sourceWarehouseId'] as String?,
      destinationLocationId: map['destinationLocationId'] as String?,
      destinationWarehouseId: map['destinationWarehouseId'] as String?,
      quantity: (map['quantity'] as num).toDouble(),
      previousQuantity: (map['previousQuantity'] as num?)?.toDouble(),
      newQuantity: (map['newQuantity'] as num?)?.toDouble(),
      batchNumber: map['batchNumber'] as String?,
      expiryDate: map['expiryDate'] != null 
          ? DateTime.parse(map['expiryDate'] as String) 
          : null,
      serialNumber: map['serialNumber'] as String?,
      unitCost: (map['unitCost'] as num?)?.toDouble(),
      totalValue: (map['totalValue'] as num?)?.toDouble(),
      externalReference: map['externalReference'] as String?,
      partyName: map['partyName'] as String?,
      partyId: map['partyId'] as String?,
      movementDate: DateTime.parse(map['movementDate'] as String),
      notes: map['notes'] as String?,
      status: MovementStatus.values.byName(map['status'] as String? ?? 'completed'),
      relatedMovementId: map['relatedMovementId'] as String?,
      requiresApproval: (map['requiresApproval'] as int?) == 1,
      approvedBy: map['approvedBy'] as String?,
      approvedAt: map['approvedAt'] != null 
          ? DateTime.parse(map['approvedAt'] as String) 
          : null,
      createdBy: map['createdBy'] as String?,
      updatedBy: map['updatedBy'] as String?,
    );
  }
  
  @override
  String toString() => 'StockMovement($referenceNo: ${movementType.displayName} $quantity)';
}

/// Movement status
enum MovementStatus {
  pending,
  completed,
  cancelled,
  partiallyCompleted,
}

extension MovementStatusExtension on MovementStatus {
  String get displayName => switch (this) {
    MovementStatus.pending => 'Pending',
    MovementStatus.completed => 'Completed',
    MovementStatus.cancelled => 'Cancelled',
    MovementStatus.partiallyCompleted => 'Partial',
  };
  
  bool get isFinal => this == MovementStatus.completed || 
                      this == MovementStatus.cancelled;
}

/// Movement with related item and location details
class MovementDetails {
  final StockMovement movement;
  final String itemName;
  final String itemSku;
  final String? sourcePath;
  final String? destinationPath;
  final String? performedByName;
  
  const MovementDetails({
    required this.movement,
    required this.itemName,
    required this.itemSku,
    this.sourcePath,
    this.destinationPath,
    this.performedByName,
  });
  
  factory MovementDetails.fromMap(Map<String, dynamic> map) {
    return MovementDetails(
      movement: StockMovement.fromMap(map),
      itemName: map['itemName'] as String? ?? '',
      itemSku: map['itemSku'] as String? ?? '',
      sourcePath: map['sourcePath'] as String?,
      destinationPath: map['destinationPath'] as String?,
      performedByName: map['performedByName'] as String?,
    );
  }
}
