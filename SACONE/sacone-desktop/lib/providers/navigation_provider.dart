import 'package:flutter/foundation.dart';

/// Navigation indices for HomeScreen
class NavigationIndex {
  static const int dashboard = 0;
  static const int inventory = 1;
  // Merged into inventory screen (inventory already supports search).
  static const int stockSearch = inventory;
  static const int stockLocations = 3;
  static const int cellStockView = 4;
  static const int dailyLog = 5;
  static const int adjustments = 6;
  static const int warehouses = 7;
  static const int stockInOut = 8;
  static const int reports = 9;
  static const int settings = 10;
  static const int pos = 12;
  static const int suppliers = 13;
  static const int customers = 14;
  static const int purchaseOrders = 15;
  static const int ledger = 16;
  static const int advancedRetail = 17;
  static const int mobileInventory = 18;
  static const int mobilePos = 19;
}

class NavigationProvider with ChangeNotifier {
  int _selectedIndex = 0;

  int get selectedIndex => _selectedIndex;

  void navigateTo(int index) {
    if (_selectedIndex != index) {
      _selectedIndex = index;
      notifyListeners();
    }
  }

  void goToDashboard() => navigateTo(NavigationIndex.dashboard);
  void goToInventory() => navigateTo(NavigationIndex.inventory);
  void goToStockSearch() => goToInventory();
  void goToStockLocations() => navigateTo(NavigationIndex.stockLocations);
  void goToCellStockView() => navigateTo(NavigationIndex.cellStockView);
  void goToDailyLog() => navigateTo(NavigationIndex.dailyLog);
  void goToAdjustments() => navigateTo(NavigationIndex.adjustments);
  void goToWarehouses() => navigateTo(NavigationIndex.warehouses);
  void goToStockInOut() => navigateTo(NavigationIndex.stockInOut);
  void goToReports() => navigateTo(NavigationIndex.reports);
  void goToSettings() => navigateTo(NavigationIndex.settings);
  void goToPos() => goToSettings();
  void goToSuppliers() => goToInventory();
  void goToCustomers() => goToInventory();
  void goToPurchaseOrders() => goToInventory();
  void goToLedger() => goToTransactions();
  void goToAdvancedRetail() => goToReports();
  void goToMobileInventory() => goToInventory();
  void goToMobilePos() => goToSettings();
  void goToTransactions() => navigateTo(NavigationIndex.stockInOut);
}
