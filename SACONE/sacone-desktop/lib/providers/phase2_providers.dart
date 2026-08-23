import 'package:flutter/foundation.dart';

import '../services/serial_tracking_service.dart';
import '../services/warranty_service.dart';
import '../services/pricing_engine.dart';
import '../services/offer_engine.dart';
import '../services/loyalty_service.dart';
import '../services/expiry_analytics_service.dart';
import '../services/dead_stock_analytics_service.dart';
import '../services/warehouse_optimization_service.dart';

class Phase2Provider extends ChangeNotifier {
  final SerialTrackingService _serials = SerialTrackingService();
  final WarrantyService _warranty = WarrantyService();
  final OfferEngine _offers = OfferEngine();
  final LoyaltyService _loyalty = LoyaltyService();
  final ExpiryAnalyticsService _expiry = ExpiryAnalyticsService();
  final DeadStockAnalyticsService _deadStockService = DeadStockAnalyticsService();
  final WarehouseOptimizationService _warehouse = WarehouseOptimizationService();

  bool _loading = false;
  List<Map<String, dynamic>> _serialResults = [];
  List<Map<String, dynamic>> _warrantyResults = [];
  List<Map<String, dynamic>> _nearExpiry = [];
  Map<String, dynamic> _expirySummary = {};
  List<Map<String, dynamic>> _deadStock = [];
  List<Map<String, dynamic>> _agingBuckets = [];
  List<Map<String, dynamic>> _pickPath = [];
  List<Map<String, dynamic>> _activeOffers = [];

  bool get isLoading => _loading;
  List<Map<String, dynamic>> get serialResults => _serialResults;
  List<Map<String, dynamic>> get warrantyResults => _warrantyResults;
  List<Map<String, dynamic>> get nearExpiry => _nearExpiry;
  Map<String, dynamic> get expirySummary => _expirySummary;
  List<Map<String, dynamic>> get deadStock => _deadStock;
  List<Map<String, dynamic>> get agingBuckets => _agingBuckets;
  List<Map<String, dynamic>> get pickPath => _pickPath;
  List<Map<String, dynamic>> get activeOffers => _activeOffers;

  Future<void> searchSerial(String query) async {
    _loading = true;
    notifyListeners();
    _serialResults = await _serials.search(query);
    _loading = false;
    notifyListeners();
  }

  Future<Map<String, dynamic>> processReturn(String serial, String reason) async {
    final result = await _serials.validateAndProcessReturn(serialNumber: serial, reason: reason);
    notifyListeners();
    return result;
  }

  Future<void> lookupWarranty(String query) async {
    _warrantyResults = await _warranty.lookupCustomerWarranties(query);
    notifyListeners();
  }

  Future<void> loadExpiryDashboard() async {
    _loading = true;
    notifyListeners();
    _nearExpiry = await _expiry.getNearExpiryAlerts(withinDays: 30);
    _expirySummary = await _expiry.getExpiryDashboardSummary();
    _loading = false;
    notifyListeners();
  }

  Future<void> loadAnalytics() async {
    _loading = true;
    notifyListeners();
    _deadStock = await _deadStockService.getUnsoldProducts(inactiveDays: 90);
    _agingBuckets = await _deadStockService.classifyAgingBuckets();
    _loading = false;
    notifyListeners();
  }

  Future<void> loadOffers() async {
    _activeOffers = await _offers.getActiveOffers();
    notifyListeners();
  }

  Future<void> optimizeWarehouse(String warehouseId) async {
    await _warehouse.recalculateVelocityScores(warehouseId: warehouseId);
    _pickPath = await _warehouse.getOptimizationSummary(warehouseId);
    notifyListeners();
  }

  Future<Map<String, dynamic>> getLoyaltyAccount(String customerId) async {
    return _loyalty.getAccount(customerId);
  }

  Future<void> setTierPrice(String itemId, String tier, double price) async {
    await PricingEngine.upsertTierPrice(itemId: itemId, tier: tier, unitPrice: price);
    notifyListeners();
  }
}
