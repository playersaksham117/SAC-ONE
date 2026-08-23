import 'package:flutter/foundation.dart';

import '../models/retail_models.dart';
import '../data/repositories/party_repository.dart';
import '../services/sequence_service.dart';
import '../services/purchase_service.dart';
import '../services/sale_service.dart';
import '../services/ledger_service.dart';
import '../services/unified_database_manager.dart';
import '../services/pricing_engine.dart';
import '../services/offer_engine.dart';

class SupplierProvider extends ChangeNotifier {
  final SupplierRepository _repo = SupplierRepository();

  List<Supplier> _suppliers = [];
  bool _loading = false;
  String? _error;

  List<Supplier> get suppliers => _suppliers;
  bool get isLoading => _loading;
  String? get error => _error;

  Future<void> load({String? search}) async {
    _loading = true;
    notifyListeners();
    try {
      _suppliers = await _repo.getAll(search: search);
      _error = null;
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> save({
    String? id,
    required String name,
    String? contactPerson,
    String? phone,
    String? email,
    String? address,
    String? gstin,
    double creditLimit = 0,
  }) async {
    final now = DateTime.now();
    try {
      if (id == null) {
        final code = await SequenceService.nextNumber('SUPPLIER');
        await _repo.create(Supplier(
          id: _repo.newId(),
          code: code,
          name: name,
          contactPerson: contactPerson,
          phone: phone,
          email: email,
          address: address,
          gstin: gstin,
          creditLimit: creditLimit,
          createdAt: now,
          updatedAt: now,
        ));
      } else {
        final existing = await _repo.getById(id);
        if (existing == null) return false;
        await _repo.update(Supplier(
          id: existing.id,
          code: existing.code,
          name: name,
          contactPerson: contactPerson,
          phone: phone,
          email: email,
          address: address,
          gstin: gstin,
          creditLimit: creditLimit,
          creditBalance: existing.creditBalance,
          createdAt: existing.createdAt,
          updatedAt: now,
        ));
      }
      await load();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> delete(String id) async {
    await _repo.delete(id);
    await load();
  }
}

class CustomerProvider extends ChangeNotifier {
  final CustomerRepository _repo = CustomerRepository();

  List<Customer> _customers = [];
  bool _loading = false;

  List<Customer> get customers => _customers;
  bool get isLoading => _loading;

  Future<void> load({String? search}) async {
    _loading = true;
    notifyListeners();
    _customers = await _repo.getAll(search: search);
    _loading = false;
    notifyListeners();
  }

  Future<bool> save({
    String? id,
    required String name,
    String? phone,
    String? email,
    String? address,
    String? gstin,
    String customerType = 'retail',
    double creditLimit = 0,
  }) async {
    final now = DateTime.now();
    if (id == null) {
      final code = await SequenceService.nextNumber('CUSTOMER');
      await _repo.create(Customer(
        id: _repo.newId(),
        code: code,
        name: name,
        phone: phone,
        email: email,
        address: address,
        gstin: gstin,
        customerType: customerType,
        creditLimit: creditLimit,
        createdAt: now,
        updatedAt: now,
      ));
    } else {
      final existing = await _repo.getById(id);
      if (existing == null) return false;
      await _repo.update(Customer(
        id: existing.id,
        code: existing.code,
        name: name,
        phone: phone,
        email: email,
        address: address,
        gstin: gstin,
        customerType: customerType,
        creditLimit: creditLimit,
        outstandingBalance: existing.outstandingBalance,
        totalPurchases: existing.totalPurchases,
        createdAt: existing.createdAt,
        updatedAt: now,
      ));
    }
    await load();
    return true;
  }
}

class PurchaseProvider extends ChangeNotifier {
  final PurchaseService _service = PurchaseService();

  List<PurchaseOrder> _orders = [];
  bool _loading = false;

  List<PurchaseOrder> get orders => _orders;
  bool get isLoading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    _orders = await _service.listOrders();
    _loading = false;
    notifyListeners();
  }

  Future<PurchaseOrder?> createOrder({
    required String supplierId,
    required String supplierName,
    required String warehouseId,
    required List<PurchaseOrderLine> lines,
  }) async {
    final order = await _service.createOrder(
      supplierId: supplierId,
      supplierName: supplierName,
      warehouseId: warehouseId,
      lines: lines,
    );
    await load();
    return order;
  }

  Future<PurchaseOrder?> receiveOrder(String id, Map<String, double> qtyByLine) async {
    final order = await _service.receiveOrder(
      purchaseOrderId: id,
      receiveQtyByLineId: qtyByLine,
    );
    await load();
    return order;
  }
}

class PosProvider extends ChangeNotifier {
  final SaleService _saleService = SaleService();
  final List<PosCartItem> _cart = [];
  String _barcodeBuffer = '';
  String _paymentMode = 'cash';
  Customer? _selectedCustomer;
  String? _warehouseId;
  String _couponCode = '';
  double _offerDiscount = 0;
  List<String> _appliedOffers = [];

  List<PosCartItem> get cart => List.unmodifiable(_cart);
  String get paymentMode => _paymentMode;
  Customer? get selectedCustomer => _selectedCustomer;
  String? get warehouseId => _warehouseId;
  String get couponCode => _couponCode;
  double get offerDiscount => _offerDiscount;
  List<String> get appliedOffers => _appliedOffers;

  double get subtotal => _cart.fold(0, (s, i) => s + i.lineSubtotal);
  double get taxTotal => _cart.fold(0, (s, i) => s + i.lineTax);
  double get grandTotal => subtotal + taxTotal - _offerDiscount;

  void setCouponCode(String code) {
    _couponCode = code;
    notifyListeners();
  }

  Future<void> recalculateOffers() async {
    final result = await OfferEngine().applyOffers(cart: _cart, couponCode: _couponCode);
    _offerDiscount = (result['discountAmount'] as num).toDouble();
    _appliedOffers = List<String>.from(result['appliedOffers'] as List);
    notifyListeners();
  }

  void setWarehouse(String? id) {
    _warehouseId = id;
    notifyListeners();
  }

  void setPaymentMode(String mode) {
    _paymentMode = mode;
    notifyListeners();
  }

  void setCustomer(Customer? customer) {
    _selectedCustomer = customer;
    notifyListeners();
  }

  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  Future<void> addByBarcode(String barcode) async {
    final db = await DatabaseManager.instance.database;
    final rows = await db.query(
      'inventory_items',
      where: 'barcode = ? OR sku = ?',
      whereArgs: [barcode, barcode],
      limit: 1,
    );
    if (rows.isEmpty) throw Exception('Item not found: $barcode');

    final row = rows.first;
    final itemId = row['id'] as String;
    final unitPrice = await PricingEngine.resolveUnitPrice(
      itemId: itemId,
      quantity: 1,
      customerId: _selectedCustomer?.id,
    );
    addItem(
      itemId: itemId,
      name: row['name'] as String,
      sku: row['sku'] as String,
      barcode: row['barcode'] as String?,
      unitPrice: unitPrice,
      taxRate: (row['taxRate'] as num?)?.toDouble() ?? 0,
    );
    await recalculateOffers();
  }

  void addItem({
    required String itemId,
    required String name,
    required String sku,
    String? barcode,
    required double unitPrice,
    double taxRate = 0,
  }) {
    final existing = _cart.where((c) => c.itemId == itemId).toList();
    if (existing.isNotEmpty) {
      existing.first.quantity += 1;
    } else {
      _cart.add(PosCartItem(
        itemId: itemId,
        name: name,
        sku: sku,
        barcode: barcode,
        unitPrice: unitPrice,
        taxRate: taxRate,
      ));
    }
    notifyListeners();
    recalculateOffers();
  }

  void updateQty(String itemId, double qty) async {
    final item = _cart.firstWhere((c) => c.itemId == itemId);
    item.quantity = qty;
    if (item.quantity <= 0) _cart.remove(item);
    notifyListeners();
    await recalculateOffers();
  }

  void removeItem(String itemId) async {
    _cart.removeWhere((c) => c.itemId == itemId);
    notifyListeners();
    recalculateOffers();
  }

  void handleBarcodeKey(String key) {
    if (key == '\n' || key == '\r') {
      if (_barcodeBuffer.isNotEmpty) {
        addByBarcode(_barcodeBuffer.trim());
        _barcodeBuffer = '';
      }
      return;
    }
    _barcodeBuffer += key;
  }

  Future<SalesInvoice> checkout({required double paidAmount}) async {
    if (_warehouseId == null) throw Exception('Select warehouse');
    await recalculateOffers();
    final invoice = await _saleService.completeSale(
      warehouseId: _warehouseId!,
      cart: List.from(_cart),
      customerId: _selectedCustomer?.id,
      customerName: _selectedCustomer?.name,
      customerPhone: _selectedCustomer?.phone,
      customerGstin: _selectedCustomer?.gstin,
      paymentMode: _paymentMode,
      paidAmount: paidAmount,
      discountAmount: _offerDiscount,
    );
    _offerDiscount = 0;
    _appliedOffers = [];
    _couponCode = '';
    clearCart();
    return invoice;
  }
}

class LedgerProvider extends ChangeNotifier {
  final LedgerService _service = LedgerService();
  final SaleService _saleService = SaleService();

  List<LedgerEntry> _entries = [];
  List<Map<String, dynamic>> _customerDues = [];
  List<Map<String, dynamic>> _supplierDues = [];

  List<LedgerEntry> get entries => _entries;
  List<Map<String, dynamic>> get customerDues => _customerDues;
  List<Map<String, dynamic>> get supplierDues => _supplierDues;

  Future<void> loadDues() async {
    _customerDues = await _service.getCustomerDues();
    _supplierDues = await _service.getSupplierDues();
    notifyListeners();
  }

  Future<void> loadCustomerLedger(String customerId) async {
    _entries = await _service.getPartyLedger(partyType: 'customer', partyId: customerId);
    notifyListeners();
  }

  Future<void> recordPayment(String customerId, double amount, String mode) async {
    await _saleService.recordCustomerPayment(
      customerId: customerId,
      amount: amount,
      paymentMode: mode,
    );
    await loadDues();
  }
}

class RetailReportsProvider extends ChangeNotifier {
  bool _loading = false;
  Map<String, dynamic> _salesSummary = {};
  Map<String, dynamic> _purchaseSummary = {};

  bool get isLoading => _loading;
  Map<String, dynamic> get salesSummary => _salesSummary;
  Map<String, dynamic> get purchaseSummary => _purchaseSummary;

  Future<void> load({DateTime? from, DateTime? to}) async {
    _loading = true;
    notifyListeners();
    final db = await DatabaseManager.instance.database;
    final fromDate = (from ?? DateTime.now().subtract(const Duration(days: 30))).toIso8601String();
    final toDate = (to ?? DateTime.now()).toIso8601String();

    final sales = await db.rawQuery('''
      SELECT COUNT(*) as count,
             COALESCE(SUM(totalAmount),0) as total,
             COALESCE(SUM(paidAmount),0) as paid,
             COALESCE(SUM(dueAmount),0) as due
      FROM sales_invoices
      WHERE invoiceDate >= ? AND invoiceDate <= ?
    ''', [fromDate, toDate]);

    final purchases = await db.rawQuery('''
      SELECT COUNT(*) as count,
             COALESCE(SUM(totalAmount),0) as total,
             COALESCE(SUM(paidAmount),0) as paid,
             COALESCE(SUM(dueAmount),0) as due
      FROM purchase_orders
      WHERE orderDate >= ? AND orderDate <= ?
    ''', [fromDate, toDate]);

    _salesSummary = Map<String, dynamic>.from(sales.first);
    _purchaseSummary = Map<String, dynamic>.from(purchases.first);
    _loading = false;
    notifyListeners();
  }
}
