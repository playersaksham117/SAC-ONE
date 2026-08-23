class Stock {
  final String id;
  final String itemId;
  final String warehouseId;
  final String? cellId;        // Simplified location tracking (Warehouse → Cell)
  // Legacy fields - kept for backward compatibility (in-memory only, not stored in DB)
  final String? zoneId;
  final String? rackId;
  final String? shelfId;
  final String? binId;
  final double quantity;
  final String? batchNumber;   // Batch tracking for traceability
  final DateTime? expiryDate;  // Expiry tracking for perishables
  final DateTime lastUpdated;

  Stock({
    required this.id,
    required this.itemId,
    required this.warehouseId,
    this.cellId,
    this.zoneId,
    this.rackId,
    this.shelfId,
    this.binId,
    required this.quantity,
    this.batchNumber,
    this.expiryDate,
    required this.lastUpdated,
  });

  Map<String, dynamic> toMap() {
    // Only include fields that exist in the database table
    return {
      'id': id,
      'itemId': itemId,
      'warehouseId': warehouseId,
      'cellId': cellId,
      'quantity': quantity,
      'batchNumber': batchNumber,
      'expiryDate': expiryDate?.toIso8601String(),
      'lastUpdated': lastUpdated.toIso8601String(),
    };
  }

  factory Stock.fromMap(Map<String, dynamic> map) {
    return Stock(
      id: map['id'],
      itemId: map['itemId'],
      warehouseId: map['warehouseId'],
      cellId: map['cellId'],
      zoneId: map['zoneId'],
      rackId: map['rackId'],
      shelfId: map['shelfId'],
      binId: map['binId'],
      quantity: map['quantity'],
      batchNumber: map['batchNumber'],
      expiryDate: map['expiryDate'] != null ? DateTime.parse(map['expiryDate']) : null,
      lastUpdated: DateTime.parse(map['lastUpdated']),
    );
  }

  // Helper to check if stock has precise location
  bool get hasPreciseLocation => cellId != null || binId != null;

  // Helper to check if stock is expiring soon (within 30 days)
  bool get isExpiringSoon {
    if (expiryDate == null) return false;
    final daysUntilExpiry = expiryDate!.difference(DateTime.now()).inDays;
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  }

  // Helper to check if stock is expired
  bool get isExpired {
    if (expiryDate == null) return false;
    return expiryDate!.isBefore(DateTime.now());
  }
}

class Transaction {
  final String id;
  final String type; // purchase, sale, transfer, adjustment
  final String itemId;
  final String warehouseId;
  final String? locationId;
  final double quantity;
  final double unitPrice;
  final double totalAmount;
  final String? referenceNumber;
  final String? supplier;
  final String? customer;
  final String? notes;
  final DateTime transactionDate;
  final DateTime createdAt;

  Transaction({
    required this.id,
    required this.type,
    required this.itemId,
    required this.warehouseId,
    this.locationId,
    required this.quantity,
    required this.unitPrice,
    required this.totalAmount,
    this.referenceNumber,
    this.supplier,
    this.customer,
    this.notes,
    required this.transactionDate,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'type': type,
      'itemId': itemId,
      'warehouseId': warehouseId,
      'locationId': locationId,
      'quantity': quantity,
      'unitPrice': unitPrice,
      'totalAmount': totalAmount,
      'referenceNumber': referenceNumber,
      'supplier': supplier,
      'customer': customer,
      'notes': notes,
      'transactionDate': transactionDate.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory Transaction.fromMap(Map<String, dynamic> map) {
    return Transaction(
      id: map['id'],
      type: map['type'],
      itemId: map['itemId'],
      warehouseId: map['warehouseId'],
      locationId: map['locationId'],
      quantity: map['quantity'],
      unitPrice: map['unitPrice'],
      totalAmount: map['totalAmount'],
      referenceNumber: map['referenceNumber'],
      supplier: map['supplier'],
      customer: map['customer'],
      notes: map['notes'],
      transactionDate: DateTime.parse(map['transactionDate']),
      createdAt: DateTime.parse(map['createdAt']),
    );
  }
}

/// Location-specific stock information used in UI display
class LocationStock {
  final String id;
  final String itemId;
  final String warehouseId;
  final String? zoneId;
  final String? rackId;
  final String? shelfId;
  final String? binId;
  final double quantity;
  final String? batchNumber;
  final DateTime? expiryDate;
  final DateTime lastUpdated;

  LocationStock({
    required this.id,
    required this.itemId,
    required this.warehouseId,
    this.zoneId,
    this.rackId,
    this.shelfId,
    this.binId,
    required this.quantity,
    this.batchNumber,
    this.expiryDate,
    required this.lastUpdated,
  });

  /// Build location path from hierarchy
  String get locationPath {
    final parts = <String>[];
    if (zoneId != null) parts.add(zoneId!);
    if (rackId != null) parts.add(rackId!);
    if (shelfId != null) parts.add(shelfId!);
    if (binId != null) parts.add(binId!);
    return parts.isEmpty ? 'Unknown' : parts.join(' > ');
  }

  /// Get hierarchy level depth (0=warehouse, 1=zone, 2=rack, 3=shelf, 4=bin)
  int get hierarchyLevel {
    int level = 0;
    if (zoneId != null) level++;
    if (rackId != null) level++;
    if (shelfId != null) level++;
    if (binId != null) level++;
    return level;
  }

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
      'lastUpdated': lastUpdated.toIso8601String(),
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
      expiryDate: map['expiryDate'] != null ? DateTime.parse(map['expiryDate']) : null,
      lastUpdated: DateTime.parse(map['lastUpdated']),
    );
  }

  factory LocationStock.fromStock(Stock stock) {
    return LocationStock(
      id: stock.id,
      itemId: stock.itemId,
      warehouseId: stock.warehouseId,
      zoneId: stock.zoneId,
      rackId: stock.rackId,
      shelfId: stock.shelfId,
      binId: stock.binId,
      quantity: stock.quantity,
      batchNumber: stock.batchNumber,
      expiryDate: stock.expiryDate,
      lastUpdated: stock.lastUpdated,
    );
  }
}
