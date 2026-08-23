/// ============================================================
/// RESULT TYPE - Functional error handling
/// ============================================================
/// 
/// A Result type for handling success/failure states without exceptions.
/// Enables clean error handling throughout the application layers.
/// 
/// Architecture: Core Layer
/// ============================================================
library;

/// Represents the result of an operation that can succeed or fail
sealed class Result<T> {
  const Result();
  
  /// Creates a successful result with data
  factory Result.success(T data) = Success<T>;
  
  /// Creates a failed result with an error
  factory Result.failure(Failure failure) = Failed<T>;
  
  /// Returns true if this result is a success
  bool get isSuccess => this is Success<T>;
  
  /// Returns true if this result is a failure
  bool get isFailure => this is Failed<T>;
  
  /// Gets the data if success, null otherwise
  T? get dataOrNull => switch (this) {
    Success<T>(:final data) => data,
    Failed<T>() => null,
  };
  
  /// Gets the failure if failed, null otherwise
  Failure? get failureOrNull => switch (this) {
    Success<T>() => null,
    Failed<T>(:final failure) => failure,
  };
  
  /// Maps the success value using the provided function
  Result<R> map<R>(R Function(T data) mapper) => switch (this) {
    Success<T>(:final data) => Result.success(mapper(data)),
    Failed<T>(:final failure) => Result.failure(failure),
  };
  
  /// Maps the success value using an async function
  Future<Result<R>> mapAsync<R>(Future<R> Function(T data) mapper) async {
    return switch (this) {
      Success<T>(:final data) => Result.success(await mapper(data)),
      Failed<T>(:final failure) => Result.failure(failure),
    };
  }
  
  /// Executes the appropriate callback based on result type
  R fold<R>({
    required R Function(T data) onSuccess,
    required R Function(Failure failure) onFailure,
  }) => switch (this) {
    Success<T>(:final data) => onSuccess(data),
    Failed<T>(:final failure) => onFailure(failure),
  };
  
  /// Executes callback if success
  void ifSuccess(void Function(T data) action) {
    if (this case Success<T>(:final data)) {
      action(data);
    }
  }
  
  /// Executes callback if failure
  void ifFailure(void Function(Failure failure) action) {
    if (this case Failed<T>(:final failure)) {
      action(failure);
    }
  }
}

/// Represents a successful result
final class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);
  
  @override
  String toString() => 'Success($data)';
}

/// Represents a failed result
final class Failed<T> extends Result<T> {
  final Failure failure;
  const Failed(this.failure);
  
  @override
  String toString() => 'Failed($failure)';
}

/// Represents a failure with categorized types
class Failure {
  final String message;
  final String? code;
  final FailureType type;
  final dynamic originalError;
  final StackTrace? stackTrace;
  
  const Failure({
    required this.message,
    this.code,
    this.type = FailureType.unknown,
    this.originalError,
    this.stackTrace,
  });
  
  /// Create database failure
  factory Failure.database(String message, {String? code, dynamic error}) {
    return Failure(
      message: message,
      code: code ?? 'DB_ERROR',
      type: FailureType.database,
      originalError: error,
    );
  }
  
  /// Create validation failure
  factory Failure.validation(String message, {String? code}) {
    return Failure(
      message: message,
      code: code ?? 'VALIDATION_ERROR',
      type: FailureType.validation,
    );
  }
  
  /// Create not found failure
  factory Failure.notFound(String entity, String identifier) {
    return Failure(
      message: '$entity not found: $identifier',
      code: 'NOT_FOUND',
      type: FailureType.notFound,
    );
  }
  
  /// Create insufficient stock failure
  factory Failure.insufficientStock({
    required String itemName,
    required double requested,
    required double available,
  }) {
    return Failure(
      message: 'Insufficient stock for "$itemName". '
               'Requested: $requested, Available: $available',
      code: 'INSUFFICIENT_STOCK',
      type: FailureType.business,
    );
  }
  
  /// Create authorization failure
  factory Failure.unauthorized(String action) {
    return Failure(
      message: 'Not authorized to $action',
      code: 'UNAUTHORIZED',
      type: FailureType.authorization,
    );
  }
  
  /// Create network failure
  factory Failure.network(String message, {dynamic error}) {
    return Failure(
      message: message,
      code: 'NETWORK_ERROR',
      type: FailureType.network,
      originalError: error,
    );
  }
  
  /// Create cache failure
  factory Failure.cache(String message) {
    return Failure(
      message: message,
      code: 'CACHE_ERROR',
      type: FailureType.cache,
    );
  }
  
  /// Create authentication failure
  factory Failure.authentication(String message) {
    return Failure(
      message: message,
      code: 'AUTHENTICATION_ERROR',
      type: FailureType.authorization,
    );
  }
  
  /// Create business logic failure
  factory Failure.business(String message, {String? code}) {
    return Failure(
      message: message,
      code: code ?? 'BUSINESS_ERROR',
      type: FailureType.business,
    );
  }
  
  /// Create authorization failure (alias for unauthorized)
  factory Failure.authorization(String message) {
    return Failure(
      message: message,
      code: 'AUTHORIZATION_ERROR',
      type: FailureType.authorization,
    );
  }
  
  @override
  String toString() => 'Failure[$code]: $message';
}

/// Categories of failures
enum FailureType {
  database,
  validation,
  notFound,
  business,
  authorization,
  network,
  cache,
  unknown,
}

/// Extension to convert exceptions to Result
extension ExceptionToResult on Exception {
  Failure toFailure() {
    return Failure(
      message: toString(),
      type: FailureType.unknown,
      originalError: this,
    );
  }
}

/// Helper to run operations and return Result
Future<Result<T>> runCatching<T>(Future<T> Function() operation) async {
  try {
    final result = await operation();
    return Result.success(result);
  } catch (e, stackTrace) {
    return Result.failure(Failure(
      message: e.toString(),
      type: FailureType.unknown,
      originalError: e,
      stackTrace: stackTrace,
    ));
  }
}
