/// ============================================================
/// APP CONSTANTS - Central configuration for the entire application
/// ============================================================
/// 
/// This file contains all application-wide constants, configuration
/// values, and magic numbers used throughout the app.
/// 
/// Architecture: Core Layer (accessible by all layers)
/// ============================================================

library app_constants;

/// Application metadata
class AppInfo {
  static const String name = 'TracInvent';
  static const String version = '2.0.0';
  static const String buildNumber = '1';
  static const String description = 'Inventory & Billing System for Retail & Pharmacy';
}

/// Database configuration
class DatabaseConfig {
  static const String name = 'tracinvent_v2.db';
  static const int version = 1;
  static const int maxBatchSize = 500; // For bulk operations
  static const int queryTimeout = 30000; // milliseconds
}

/// Pagination defaults
class PaginationConfig {
  static const int defaultPageSize = 50;
  static const int maxPageSize = 200;
  static const int dashboardItemLimit = 10;
  static const int searchResultLimit = 100;
}

/// Stock alert thresholds (can be overridden per item)
class StockAlerts {
  static const double defaultReorderLevel = 10.0;
  static const double defaultMinimumLevel = 5.0;
  static const int expiryWarningDays = 90; // 3 months
  static const int expiryCriticalDays = 30; // 1 month
}

/// Tax configuration (GST India)
class TaxConfig {
  static const List<double> gstSlabs = [0, 5, 12, 18, 28];
  static const double defaultGstRate = 18.0;
  static const bool inclusiveTax = false; // MRP includes tax
}

/// Currency configuration
class CurrencyConfig {
  static const String defaultCurrency = 'INR';
  static const String currencySymbol = '₹';
  static const int decimalPlaces = 2;
}

/// Date formats
class DateFormats {
  static const String display = 'dd/MM/yyyy';
  static const String displayWithTime = 'dd/MM/yyyy HH:mm';
  static const String database = 'yyyy-MM-dd HH:mm:ss';
  static const String invoiceDate = 'dd-MMM-yyyy';
  static const String monthYear = 'MMM yyyy';
}

/// Invoice configuration
class InvoiceConfig {
  static const String prefix = 'INV';
  static const int numberPadding = 6; // INV-000001
  static const String purchasePrefix = 'PUR';
  static const String returnPrefix = 'RET';
  static const String adjustmentPrefix = 'ADJ';
}

/// User roles
class UserRoles {
  static const String admin = 'admin';
  static const String manager = 'manager';
  static const String cashier = 'cashier';
  static const String viewer = 'viewer';
}

/// Payment modes
class PaymentModes {
  static const String cash = 'CASH';
  static const String card = 'CARD';
  static const String upi = 'UPI';
  static const String credit = 'CREDIT';
  static const String cheque = 'CHEQUE';
  static const String multiple = 'MULTIPLE';
  
  static const List<String> all = [cash, card, upi, credit, cheque];
}

/// Transaction types
class TransactionTypes {
  static const String sale = 'SALE';
  static const String purchase = 'PURCHASE';
  static const String saleReturn = 'SALE_RETURN';
  static const String purchaseReturn = 'PURCHASE_RETURN';
  static const String adjustment = 'ADJUSTMENT';
  static const String transfer = 'TRANSFER';
  static const String opening = 'OPENING';
}

/// Stock operation types
class StockOperations {
  static const String stockIn = 'STOCK_IN';
  static const String stockOut = 'STOCK_OUT';
  static const String increase = 'INCREASE';
  static const String decrease = 'DECREASE';
  static const String setQuantity = 'SET_QTY';
}

/// Adjustment reasons (predefined)
class AdjustmentReasons {
  static const String damage = 'DAMAGE';
  static const String expired = 'EXPIRED';
  static const String theft = 'THEFT';
  static const String audit = 'AUDIT';
  static const String correction = 'CORRECTION';
  static const String other = 'OTHER';
  
  static const List<String> all = [damage, expired, theft, audit, correction, other];
}

/// Unit types
class UnitTypes {
  static const String pieces = 'PCS';
  static const String kg = 'KG';
  static const String gram = 'GM';
  static const String liter = 'LTR';
  static const String ml = 'ML';
  static const String box = 'BOX';
  static const String strip = 'STRIP';
  static const String bottle = 'BTL';
  static const String pack = 'PACK';
  static const String dozen = 'DZN';
  
  static const List<String> all = [
    pieces, kg, gram, liter, ml, box, strip, bottle, pack, dozen
  ];
}

/// Item categories (can be extended via database)
class DefaultCategories {
  static const List<String> grocery = [
    'Grocery', 'Beverages', 'Dairy', 'Snacks', 'Frozen', 
    'Bakery', 'Personal Care', 'Household', 'Baby Care'
  ];
  
  static const List<String> medical = [
    'Tablets', 'Capsules', 'Syrup', 'Injection', 'Ointment',
    'Drops', 'Powder', 'Surgical', 'OTC', 'Ayurvedic'
  ];
}

/// Keyboard shortcuts
class KeyboardShortcuts {
  static const String newItem = 'Ctrl+N';
  static const String search = 'Ctrl+F';
  static const String save = 'Ctrl+S';
  static const String print = 'Ctrl+P';
  static const String newBill = 'F1';
  static const String holdBill = 'F2';
  static const String recallBill = 'F3';
  static const String payment = 'F4';
  static const String discount = 'F5';
  static const String customer = 'F6';
  static const String void_ = 'F8';
  static const String settings = 'F12';
}

/// Cache durations
class CacheDurations {
  static const Duration dashboard = Duration(minutes: 5);
  static const Duration inventory = Duration(minutes: 15);
  static const Duration reports = Duration(minutes: 30);
}

/// API configuration (for future SaaS)
class ApiConfig {
  static const String baseUrl = 'https://api.tracinvent.com/v1';
  static const Duration timeout = Duration(seconds: 30);
  static const int maxRetries = 3;
}

/// Feature flags (for gradual rollout)
class FeatureFlags {
  static const bool enableMultiWarehouse = true;
  static const bool enableBatchTracking = true;
  static const bool enableExpiryTracking = true;
  static const bool enableBarcodeScan = true;
  static const bool enableCloudSync = false; // Future feature
  static const bool enableLoyaltyProgram = false; // Future feature
  static const bool enableAiPrediction = false; // Future feature
}
