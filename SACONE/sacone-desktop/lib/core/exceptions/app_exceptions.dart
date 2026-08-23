/// ============================================================
/// APPLICATION EXCEPTIONS - Custom exception hierarchy
/// ============================================================
/// 
/// Defines all custom exceptions used throughout the application.
/// These provide meaningful error messages and enable proper error
/// handling at each architecture layer.
/// 
/// Architecture: Core Layer
/// ============================================================
library;

/// Base exception for all application-specific exceptions
abstract class AppException implements Exception {
  final String message;
  final String? code;
  final dynamic originalError;
  final StackTrace? stackTrace;
  
  const AppException({
    required this.message,
    this.code,
    this.originalError,
    this.stackTrace,
  });
  
  @override
  String toString() => 'AppException[$code]: $message';
}

/// Database-related exceptions
class DatabaseException extends AppException {
  const DatabaseException({
    required super.message,
    super.code = 'DB_ERROR',
    super.originalError,
    super.stackTrace,
  });
  
  factory DatabaseException.connectionFailed([dynamic error]) {
    return DatabaseException(
      message: 'Failed to connect to database',
      code: 'DB_CONNECTION_FAILED',
      originalError: error,
    );
  }
  
  factory DatabaseException.queryFailed(String query, [dynamic error]) {
    return DatabaseException(
      message: 'Database query failed: $query',
      code: 'DB_QUERY_FAILED',
      originalError: error,
    );
  }
  
  factory DatabaseException.transactionFailed([dynamic error]) {
    return DatabaseException(
      message: 'Database transaction failed',
      code: 'DB_TRANSACTION_FAILED',
      originalError: error,
    );
  }
  
  factory DatabaseException.migrationFailed(int version, [dynamic error]) {
    return DatabaseException(
      message: 'Database migration to version $version failed',
      code: 'DB_MIGRATION_FAILED',
      originalError: error,
    );
  }
}

/// Validation-related exceptions
class ValidationException extends AppException {
  final Map<String, String>? fieldErrors;
  
  const ValidationException({
    required super.message,
    super.code = 'VALIDATION_ERROR',
    this.fieldErrors,
  });
  
  factory ValidationException.required(String field) {
    return ValidationException(
      message: '$field is required',
      code: 'REQUIRED_FIELD',
      fieldErrors: {field: '$field is required'},
    );
  }
  
  factory ValidationException.invalid(String field, String reason) {
    return ValidationException(
      message: '$field is invalid: $reason',
      code: 'INVALID_FIELD',
      fieldErrors: {field: reason},
    );
  }
  
  factory ValidationException.duplicate(String field, String value) {
    return ValidationException(
      message: '$field "$value" already exists',
      code: 'DUPLICATE_VALUE',
      fieldErrors: {field: 'Already exists'},
    );
  }
}

/// Inventory-related exceptions
class InventoryException extends AppException {
  const InventoryException({
    required super.message,
    super.code = 'INVENTORY_ERROR',
    super.originalError,
  });
  
  factory InventoryException.itemNotFound(String id) {
    return InventoryException(
      message: 'Item not found with ID: $id',
      code: 'ITEM_NOT_FOUND',
    );
  }
  
  factory InventoryException.skuExists(String sku) {
    return InventoryException(
      message: 'SKU already exists: $sku',
      code: 'SKU_EXISTS',
    );
  }
  
  factory InventoryException.barcodeExists(String barcode) {
    return InventoryException(
      message: 'Barcode already exists: $barcode',
      code: 'BARCODE_EXISTS',
    );
  }
}

/// Stock-related exceptions
class StockException extends AppException {
  const StockException({
    required super.message,
    super.code = 'STOCK_ERROR',
    super.originalError,
  });
  
  factory StockException.insufficientStock({
    required String itemName,
    required double requested,
    required double available,
  }) {
    return StockException(
      message: 'Insufficient stock for "$itemName". '
               'Requested: $requested, Available: $available',
      code: 'INSUFFICIENT_STOCK',
    );
  }
  
  factory StockException.batchNotFound(String batchNumber) {
    return StockException(
      message: 'Batch not found: $batchNumber',
      code: 'BATCH_NOT_FOUND',
    );
  }
  
  factory StockException.batchExpired(String batchNumber, DateTime expiry) {
    return StockException(
      message: 'Batch $batchNumber expired on $expiry',
      code: 'BATCH_EXPIRED',
    );
  }
  
  factory StockException.negativeStock(String itemName) {
    return StockException(
      message: 'Cannot reduce stock below zero for "$itemName"',
      code: 'NEGATIVE_STOCK',
    );
  }
}

/// Billing/POS-related exceptions
class BillingException extends AppException {
  const BillingException({
    required super.message,
    super.code = 'BILLING_ERROR',
    super.originalError,
  });
  
  factory BillingException.invoiceNotFound(String invoiceNo) {
    return BillingException(
      message: 'Invoice not found: $invoiceNo',
      code: 'INVOICE_NOT_FOUND',
    );
  }
  
  factory BillingException.emptyCart() {
    return const BillingException(
      message: 'Cannot process empty cart',
      code: 'EMPTY_CART',
    );
  }
  
  factory BillingException.paymentFailed(String reason) {
    return BillingException(
      message: 'Payment failed: $reason',
      code: 'PAYMENT_FAILED',
    );
  }
  
  factory BillingException.invoiceAlreadyPaid(String invoiceNo) {
    return BillingException(
      message: 'Invoice $invoiceNo has already been paid',
      code: 'INVOICE_ALREADY_PAID',
    );
  }
  
  factory BillingException.returnNotAllowed(String reason) {
    return BillingException(
      message: 'Return not allowed: $reason',
      code: 'RETURN_NOT_ALLOWED',
    );
  }
}

/// Authentication-related exceptions
class AuthException extends AppException {
  const AuthException({
    required super.message,
    super.code = 'AUTH_ERROR',
  });
  
  factory AuthException.invalidCredentials() {
    return const AuthException(
      message: 'Invalid username or password',
      code: 'INVALID_CREDENTIALS',
    );
  }
  
  factory AuthException.invalidPin() {
    return const AuthException(
      message: 'Invalid PIN',
      code: 'INVALID_PIN',
    );
  }
  
  factory AuthException.sessionExpired() {
    return const AuthException(
      message: 'Session has expired. Please login again.',
      code: 'SESSION_EXPIRED',
    );
  }
  
  factory AuthException.unauthorized(String action) {
    return AuthException(
      message: 'You are not authorized to $action',
      code: 'UNAUTHORIZED',
    );
  }
  
  factory AuthException.userNotFound(String username) {
    return AuthException(
      message: 'User not found: $username',
      code: 'USER_NOT_FOUND',
    );
  }
  
  factory AuthException.userDisabled(String username) {
    return AuthException(
      message: 'User account is disabled: $username',
      code: 'USER_DISABLED',
    );
  }
}

/// Report-related exceptions
class ReportException extends AppException {
  const ReportException({
    required super.message,
    super.code = 'REPORT_ERROR',
    super.originalError,
  });
  
  factory ReportException.generationFailed(String reportType, [dynamic error]) {
    return ReportException(
      message: 'Failed to generate $reportType report',
      code: 'REPORT_GENERATION_FAILED',
      originalError: error,
    );
  }
  
  factory ReportException.exportFailed(String format, [dynamic error]) {
    return ReportException(
      message: 'Failed to export report to $format',
      code: 'REPORT_EXPORT_FAILED',
      originalError: error,
    );
  }
}

/// Network-related exceptions (for future sync/SaaS features)
class NetworkException extends AppException {
  const NetworkException({
    required super.message,
    super.code = 'NETWORK_ERROR',
    super.originalError,
  });
  
  factory NetworkException.noConnection() {
    return const NetworkException(
      message: 'No internet connection',
      code: 'NO_CONNECTION',
    );
  }
  
  factory NetworkException.timeout() {
    return const NetworkException(
      message: 'Request timed out',
      code: 'TIMEOUT',
    );
  }
  
  factory NetworkException.serverError(int statusCode) {
    return NetworkException(
      message: 'Server error: $statusCode',
      code: 'SERVER_ERROR_$statusCode',
    );
  }
  
  factory NetworkException.syncFailed([dynamic error]) {
    return NetworkException(
      message: 'Data synchronization failed',
      code: 'SYNC_FAILED',
      originalError: error,
    );
  }
}
