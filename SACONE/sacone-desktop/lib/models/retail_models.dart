class Supplier {
  final String id;
  final String code;
  final String name;
  final String? contactPerson;
  final String? phone;
  final String? email;
  final String? address;
  final String? city;
  final String? state;
  final String? gstin;
  final double creditLimit;
  final double creditBalance;
  final int paymentTermsDays;
  final bool isActive;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  Supplier({
    required this.id,
    required this.code,
    required this.name,
    this.contactPerson,
    this.phone,
    this.email,
    this.address,
    this.city,
    this.state,
    this.gstin,
    this.creditLimit = 0,
    this.creditBalance = 0,
    this.paymentTermsDays = 30,
    this.isActive = true,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Supplier.fromMap(Map<String, dynamic> map) {
    return Supplier(
      id: map['id'] as String,
      code: map['code'] as String,
      name: map['name'] as String,
      contactPerson: map['contactPerson'] as String?,
      phone: map['phone'] as String?,
      email: map['email'] as String?,
      address: map['address'] as String?,
      city: map['city'] as String?,
      state: map['state'] as String?,
      gstin: map['gstin'] as String?,
      creditLimit: (map['creditLimit'] as num?)?.toDouble() ?? 0,
      creditBalance: (map['creditBalance'] as num?)?.toDouble() ?? 0,
      paymentTermsDays: (map['paymentTermsDays'] as int?) ?? 30,
      isActive: (map['isActive'] as int? ?? 1) == 1,
      notes: map['notes'] as String?,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'code': code,
        'name': name,
        'contactPerson': contactPerson,
        'phone': phone,
        'email': email,
        'address': address,
        'city': city,
        'state': state,
        'gstin': gstin,
        'creditLimit': creditLimit,
        'creditBalance': creditBalance,
        'paymentTermsDays': paymentTermsDays,
        'isActive': isActive ? 1 : 0,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'syncStatus': 'local',
      };
}

class Customer {
  final String id;
  final String code;
  final String name;
  final String? phone;
  final String? email;
  final String? address;
  final String? city;
  final String? state;
  final String? gstin;
  final String customerType;
  final double creditLimit;
  final double outstandingBalance;
  final double totalPurchases;
  final bool isActive;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  Customer({
    required this.id,
    required this.code,
    required this.name,
    this.phone,
    this.email,
    this.address,
    this.city,
    this.state,
    this.gstin,
    this.customerType = 'retail',
    this.creditLimit = 0,
    this.outstandingBalance = 0,
    this.totalPurchases = 0,
    this.isActive = true,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Customer.fromMap(Map<String, dynamic> map) {
    return Customer(
      id: map['id'] as String,
      code: map['code'] as String,
      name: map['name'] as String,
      phone: map['phone'] as String?,
      email: map['email'] as String?,
      address: map['address'] as String?,
      city: map['city'] as String?,
      state: map['state'] as String?,
      gstin: map['gstin'] as String?,
      customerType: map['customerType'] as String? ?? 'retail',
      creditLimit: (map['creditLimit'] as num?)?.toDouble() ?? 0,
      outstandingBalance: (map['outstandingBalance'] as num?)?.toDouble() ?? 0,
      totalPurchases: (map['totalPurchases'] as num?)?.toDouble() ?? 0,
      isActive: (map['isActive'] as int? ?? 1) == 1,
      notes: map['notes'] as String?,
      createdAt: DateTime.parse(map['createdAt'] as String),
      updatedAt: DateTime.parse(map['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'code': code,
        'name': name,
        'phone': phone,
        'email': email,
        'address': address,
        'city': city,
        'state': state,
        'gstin': gstin,
        'customerType': customerType,
        'creditLimit': creditLimit,
        'outstandingBalance': outstandingBalance,
        'totalPurchases': totalPurchases,
        'isActive': isActive ? 1 : 0,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'syncStatus': 'local',
      };
}

class PurchaseOrderLine {
  final String id;
  final String purchaseOrderId;
  final String itemId;
  final String itemName;
  final String sku;
  final double orderedQty;
  final double receivedQty;
  final double unitCost;
  final double taxRate;
  final double taxAmount;
  final double lineTotal;

  PurchaseOrderLine({
    required this.id,
    required this.purchaseOrderId,
    required this.itemId,
    required this.itemName,
    required this.sku,
    required this.orderedQty,
    this.receivedQty = 0,
    required this.unitCost,
    this.taxRate = 0,
    this.taxAmount = 0,
    required this.lineTotal,
  });

  factory PurchaseOrderLine.fromMap(Map<String, dynamic> map) {
    return PurchaseOrderLine(
      id: map['id'] as String,
      purchaseOrderId: map['purchaseOrderId'] as String,
      itemId: map['itemId'] as String,
      itemName: map['itemName'] as String,
      sku: map['sku'] as String,
      orderedQty: (map['orderedQty'] as num).toDouble(),
      receivedQty: (map['receivedQty'] as num?)?.toDouble() ?? 0,
      unitCost: (map['unitCost'] as num).toDouble(),
      taxRate: (map['taxRate'] as num?)?.toDouble() ?? 0,
      taxAmount: (map['taxAmount'] as num?)?.toDouble() ?? 0,
      lineTotal: (map['lineTotal'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'purchaseOrderId': purchaseOrderId,
        'itemId': itemId,
        'itemName': itemName,
        'sku': sku,
        'orderedQty': orderedQty,
        'receivedQty': receivedQty,
        'unitCost': unitCost,
        'taxRate': taxRate,
        'taxAmount': taxAmount,
        'lineTotal': lineTotal,
        'createdAt': DateTime.now().toIso8601String(),
      };

  double get pendingQty => orderedQty - receivedQty;
}

class PurchaseOrder {
  final String id;
  final String poNumber;
  final String supplierId;
  final String supplierName;
  final String warehouseId;
  final String status;
  final DateTime orderDate;
  final DateTime? expectedDate;
  final DateTime? receivedDate;
  final double subtotal;
  final double taxAmount;
  final double discountAmount;
  final double totalAmount;
  final double paidAmount;
  final double dueAmount;
  final String? invoiceNumber;
  final String? notes;
  final List<PurchaseOrderLine> lines;

  PurchaseOrder({
    required this.id,
    required this.poNumber,
    required this.supplierId,
    required this.supplierName,
    required this.warehouseId,
    required this.status,
    required this.orderDate,
    this.expectedDate,
    this.receivedDate,
    this.subtotal = 0,
    this.taxAmount = 0,
    this.discountAmount = 0,
    this.totalAmount = 0,
    this.paidAmount = 0,
    this.dueAmount = 0,
    this.invoiceNumber,
    this.notes,
    this.lines = const [],
  });

  factory PurchaseOrder.fromMap(Map<String, dynamic> map, {List<PurchaseOrderLine> lines = const []}) {
    return PurchaseOrder(
      id: map['id'] as String,
      poNumber: map['poNumber'] as String,
      supplierId: map['supplierId'] as String,
      supplierName: map['supplierName'] as String,
      warehouseId: map['warehouseId'] as String,
      status: map['status'] as String,
      orderDate: DateTime.parse(map['orderDate'] as String),
      expectedDate: map['expectedDate'] != null ? DateTime.parse(map['expectedDate'] as String) : null,
      receivedDate: map['receivedDate'] != null ? DateTime.parse(map['receivedDate'] as String) : null,
      subtotal: (map['subtotal'] as num?)?.toDouble() ?? 0,
      taxAmount: (map['taxAmount'] as num?)?.toDouble() ?? 0,
      discountAmount: (map['discountAmount'] as num?)?.toDouble() ?? 0,
      totalAmount: (map['totalAmount'] as num?)?.toDouble() ?? 0,
      paidAmount: (map['paidAmount'] as num?)?.toDouble() ?? 0,
      dueAmount: (map['dueAmount'] as num?)?.toDouble() ?? 0,
      invoiceNumber: map['invoiceNumber'] as String?,
      notes: map['notes'] as String?,
      lines: lines,
    );
  }
}

class SaleLine {
  final String id;
  final String invoiceId;
  final String itemId;
  final String itemName;
  final String sku;
  final String? barcode;
  final double quantity;
  final double unitPrice;
  final double taxRate;
  final double taxAmount;
  final double discountAmount;
  final double lineTotal;

  SaleLine({
    required this.id,
    required this.invoiceId,
    required this.itemId,
    required this.itemName,
    required this.sku,
    this.barcode,
    required this.quantity,
    required this.unitPrice,
    this.taxRate = 0,
    this.taxAmount = 0,
    this.discountAmount = 0,
    required this.lineTotal,
  });

  factory SaleLine.fromMap(Map<String, dynamic> map) {
    return SaleLine(
      id: map['id'] as String,
      invoiceId: map['invoiceId'] as String,
      itemId: map['itemId'] as String,
      itemName: map['itemName'] as String,
      sku: map['sku'] as String,
      barcode: map['barcode'] as String?,
      quantity: (map['quantity'] as num).toDouble(),
      unitPrice: (map['unitPrice'] as num).toDouble(),
      taxRate: (map['taxRate'] as num?)?.toDouble() ?? 0,
      taxAmount: (map['taxAmount'] as num?)?.toDouble() ?? 0,
      discountAmount: (map['discountAmount'] as num?)?.toDouble() ?? 0,
      lineTotal: (map['lineTotal'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'invoiceId': invoiceId,
        'itemId': itemId,
        'itemName': itemName,
        'sku': sku,
        'barcode': barcode,
        'quantity': quantity,
        'unitPrice': unitPrice,
        'taxRate': taxRate,
        'taxAmount': taxAmount,
        'discountAmount': discountAmount,
        'lineTotal': lineTotal,
        'createdAt': DateTime.now().toIso8601String(),
      };
}

class SalesInvoice {
  final String id;
  final String invoiceNumber;
  final String? customerId;
  final String? customerName;
  final String? customerPhone;
  final String? customerGstin;
  final String warehouseId;
  final DateTime invoiceDate;
  final double subtotal;
  final double taxAmount;
  final double discountAmount;
  final double totalAmount;
  final double paidAmount;
  final double dueAmount;
  final String paymentMode;
  final String paymentStatus;
  final String status;
  final List<SaleLine> lines;

  SalesInvoice({
    required this.id,
    required this.invoiceNumber,
    this.customerId,
    this.customerName,
    this.customerPhone,
    this.customerGstin,
    required this.warehouseId,
    required this.invoiceDate,
    this.subtotal = 0,
    this.taxAmount = 0,
    this.discountAmount = 0,
    this.totalAmount = 0,
    this.paidAmount = 0,
    this.dueAmount = 0,
    this.paymentMode = 'cash',
    this.paymentStatus = 'paid',
    this.status = 'completed',
    this.lines = const [],
  });

  factory SalesInvoice.fromMap(Map<String, dynamic> map, {List<SaleLine> lines = const []}) {
    return SalesInvoice(
      id: map['id'] as String,
      invoiceNumber: map['invoiceNumber'] as String,
      customerId: map['customerId'] as String?,
      customerName: map['customerName'] as String?,
      customerPhone: map['customerPhone'] as String?,
      customerGstin: map['customerGstin'] as String?,
      warehouseId: map['warehouseId'] as String,
      invoiceDate: DateTime.parse(map['invoiceDate'] as String),
      subtotal: (map['subtotal'] as num?)?.toDouble() ?? 0,
      taxAmount: (map['taxAmount'] as num?)?.toDouble() ?? 0,
      discountAmount: (map['discountAmount'] as num?)?.toDouble() ?? 0,
      totalAmount: (map['totalAmount'] as num?)?.toDouble() ?? 0,
      paidAmount: (map['paidAmount'] as num?)?.toDouble() ?? 0,
      dueAmount: (map['dueAmount'] as num?)?.toDouble() ?? 0,
      paymentMode: map['paymentMode'] as String? ?? 'cash',
      paymentStatus: map['paymentStatus'] as String? ?? 'paid',
      status: map['status'] as String? ?? 'completed',
      lines: lines,
    );
  }
}

class LedgerEntry {
  final String id;
  final String partyType;
  final String partyId;
  final String partyName;
  final String entryType;
  final String referenceType;
  final String referenceId;
  final String? referenceNumber;
  final double debitAmount;
  final double creditAmount;
  final double balanceAfter;
  final String? paymentMode;
  final String? notes;
  final DateTime entryDate;
  final DateTime createdAt;

  LedgerEntry({
    required this.id,
    required this.partyType,
    required this.partyId,
    required this.partyName,
    required this.entryType,
    required this.referenceType,
    required this.referenceId,
    this.referenceNumber,
    this.debitAmount = 0,
    this.creditAmount = 0,
    this.balanceAfter = 0,
    this.paymentMode,
    this.notes,
    required this.entryDate,
    required this.createdAt,
  });

  factory LedgerEntry.fromMap(Map<String, dynamic> map) {
    return LedgerEntry(
      id: map['id'] as String,
      partyType: map['partyType'] as String,
      partyId: map['partyId'] as String,
      partyName: map['partyName'] as String,
      entryType: map['entryType'] as String,
      referenceType: map['referenceType'] as String,
      referenceId: map['referenceId'] as String,
      referenceNumber: map['referenceNumber'] as String?,
      debitAmount: (map['debitAmount'] as num?)?.toDouble() ?? 0,
      creditAmount: (map['creditAmount'] as num?)?.toDouble() ?? 0,
      balanceAfter: (map['balanceAfter'] as num?)?.toDouble() ?? 0,
      paymentMode: map['paymentMode'] as String?,
      notes: map['notes'] as String?,
      entryDate: DateTime.parse(map['entryDate'] as String),
      createdAt: DateTime.parse(map['createdAt'] as String),
    );
  }
}

class PosCartItem {
  final String itemId;
  final String name;
  final String sku;
  final String? barcode;
  final double unitPrice;
  final double taxRate;
  double quantity;
  List<String> serialNumbers;

  PosCartItem({
    required this.itemId,
    required this.name,
    required this.sku,
    this.barcode,
    required this.unitPrice,
    this.taxRate = 0,
    this.quantity = 1,
    List<String>? serialNumbers,
  }) : serialNumbers = serialNumbers ?? [];

  double get lineSubtotal => unitPrice * quantity;
  double get lineTax => lineSubtotal * taxRate / 100;
  double get lineTotal => lineSubtotal + lineTax;
}
