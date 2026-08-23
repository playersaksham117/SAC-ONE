import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

import 'unified_database_manager.dart';

class PosImportResult {
  final int productsImported;
  final int stockRowsImported;
  final int salesImported;
  final int saleItemsImported;
  final List<String> warnings;

  const PosImportResult({
    required this.productsImported,
    required this.stockRowsImported,
    required this.salesImported,
    required this.saleItemsImported,
    required this.warnings,
  });
}

class PosJsonImportService {
  static const Uuid _uuid = Uuid();

  static Future<PosImportResult> importFromFile(String filePath) async {
    final raw = await File(filePath).readAsString();
    return importFromJson(raw);
  }

  static Future<PosImportResult> importFromNetwork(String url) async {
    final uri = Uri.tryParse(url.trim());
    if (uri == null || !uri.hasScheme) {
      throw Exception('Enter a valid URL (e.g. http://server/pos-export.json)');
    }

    final response = await http.get(uri).timeout(const Duration(seconds: 60));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Download failed: HTTP ${response.statusCode}');
    }

    return importFromJson(response.body);
  }

  static Future<PosImportResult> importFromJson(String raw) async {
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      throw Exception('Invalid JSON format. Root must be an object.');
    }

    final products = _toList(decoded['products']);
    final inventory = _toList(decoded['inventory']);
    final sales = _toList(decoded['sales']);
    final saleItems = _toList(decoded['sale_items']);

    final db = await DatabaseManager.instance.database;
    final warnings = <String>[];

    int productsImported = 0;
    int stockRowsImported = 0;
    int salesImported = 0;
    int saleItemsImported = 0;

    await db.transaction((txn) async {
      final warehouseId = await _ensureWarehouse(txn);

      final productIdMap = <String, String>{};
      for (final rawProduct in products) {
        if (rawProduct is! Map<String, dynamic>) continue;
        final importedId = await _importProduct(txn, rawProduct, warnings);
        if (importedId != null) {
          final sourceId = _string(rawProduct['id']);
          if (sourceId != null) {
            productIdMap[sourceId] = importedId;
          }
          productsImported++;
        }
      }

      for (final rawInventory in inventory) {
        if (rawInventory is! Map<String, dynamic>) continue;
        final itemId = _resolveImportedItemId(rawInventory['product_id'], productIdMap);
        if (itemId == null) {
          warnings.add(
            'Skipped inventory row because product_id "${rawInventory['product_id']}" was not found.',
          );
          continue;
        }

        final quantity = _double(rawInventory['quantity']) ?? 0;
        final batchNumber = _string(rawInventory['batch_no']);
        final expiryDate = _parseDate(rawInventory['expiry_date']);
        final locationCode = _string(rawInventory['location_id']);
        final cellId = await _resolveCellId(txn, warehouseId, locationCode);

        await _upsertStock(
          txn: txn,
          itemId: itemId,
          warehouseId: warehouseId,
          cellId: cellId,
          quantity: quantity,
          batchNumber: batchNumber,
          expiryDate: expiryDate,
        );

        stockRowsImported++;
      }

      final saleDateMap = <String, DateTime>{};
      final salePaymentMap = <String, String>{};
      for (final rawSale in sales) {
        if (rawSale is! Map<String, dynamic>) continue;
        final saleId = _string(rawSale['id']);
        if (saleId == null) continue;

        final saleDate = _parseDate(rawSale['date']) ?? DateTime.now();
        final paymentMode = _string(rawSale['payment_mode']) ?? 'unknown';
        saleDateMap[saleId] = saleDate;
        salePaymentMap[saleId] = paymentMode;
        salesImported++;
      }

      for (final rawSaleItem in saleItems) {
        if (rawSaleItem is! Map<String, dynamic>) continue;

        final saleId = _string(rawSaleItem['sale_id']);
        final itemId = _resolveImportedItemId(rawSaleItem['product_id'], productIdMap);
        if (saleId == null || itemId == null) {
          warnings.add('Skipped sale_items row with missing sale_id or unknown product_id.');
          continue;
        }

        final quantity = _double(rawSaleItem['quantity']) ?? 0;
        final unitPrice = _double(rawSaleItem['price']) ?? 0;
        final totalAmount = quantity * unitPrice;
        final saleDate = saleDateMap[saleId] ?? DateTime.now();
        final paymentMode = salePaymentMap[saleId];

        await txn.insert('transactions', {
          'id': _uuid.v4(),
          'type': 'sale',
          'itemId': itemId,
          'warehouseId': warehouseId,
          'locationId': null,
          'quantity': quantity,
          'unitPrice': unitPrice,
          'totalAmount': totalAmount,
          'referenceNumber': saleId,
          'supplier': null,
          'customer': paymentMode,
          'notes': 'Imported from POS JSON',
          'transactionDate': saleDate.toIso8601String(),
          'createdBy': 'pos-import',
          'createdAt': DateTime.now().toIso8601String(),
        });

        saleItemsImported++;
      }
    });

    return PosImportResult(
      productsImported: productsImported,
      stockRowsImported: stockRowsImported,
      salesImported: salesImported,
      saleItemsImported: saleItemsImported,
      warnings: warnings,
    );
  }

  static List<dynamic> _toList(dynamic value) {
    if (value is List<dynamic>) return value;
    return const <dynamic>[];
  }

  static String? _string(dynamic value) {
    if (value == null) return null;
    final text = value.toString().trim();
    return text.isEmpty ? null : text;
  }

  static double? _double(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  static DateTime? _parseDate(dynamic value) {
    final text = _string(value);
    if (text == null) return null;
    return DateTime.tryParse(text);
  }

  static Future<String> _ensureWarehouse(Transaction txn) async {
    final existing = await txn.query('warehouses', limit: 1);
    if (existing.isNotEmpty) {
      return existing.first['id'] as String;
    }

    final id = _uuid.v4();
    await txn.insert('warehouses', {
      'id': id,
      'name': 'Imported Warehouse',
      'type': 'warehouse',
      'address': 'Auto-created by POS import',
      'city': null,
      'state': null,
      'pincode': null,
      'contactPerson': null,
      'contactPhone': null,
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
    });
    return id;
  }

  static Future<String?> _importProduct(
    Transaction txn,
    Map<String, dynamic> product,
    List<String> warnings,
  ) async {
    final id = _string(product['id']) ?? _uuid.v4();
    final name = _string(product['name']);
    final sku = _string(product['sku']);
    final category = _string(product['category']);
    final unit = _string(product['unit']) ?? 'pcs';

    if (name == null || sku == null || category == null) {
      warnings.add(
        'Skipped product because required fields are missing (name/sku/category).',
      );
      return null;
    }

    final existingBySku = await txn.query(
      'inventory_items',
      where: 'sku = ?',
      whereArgs: [sku],
      limit: 1,
    );

    final map = {
      'id': existingBySku.isNotEmpty ? existingBySku.first['id'] as String : id,
      'name': name,
      'sku': sku,
      'barcode': _string(product['barcode']),
      'description': 'Imported from POS JSON',
      'category': category,
      'unit': unit,
      'costPrice': _double(product['cost_price']) ?? 0.0,
      'sellingPrice': _double(product['selling_price']) ?? 0.0,
      'reorderLevel': 0.0,
      'minStockLevel': 0.0,
      'reorderQuantity': 0.0,
      'taxRate': 0.0,
      'hsn': null,
      'supplier': null,
      'brand': null,
      'imageUrl': null,
      'isActive': 1,
      'createdBy': 'pos-import',
      'createdAt': existingBySku.isNotEmpty
          ? existingBySku.first['createdAt']
          : DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
    };

    if (existingBySku.isNotEmpty) {
      await txn.update(
        'inventory_items',
        map,
        where: 'id = ?',
        whereArgs: [existingBySku.first['id']],
      );
      return existingBySku.first['id'] as String;
    }

    await txn.insert('inventory_items', map);
    return id;
  }

  static String? _resolveImportedItemId(
    dynamic sourceProductId,
    Map<String, String> productIdMap,
  ) {
    final source = _string(sourceProductId);
    if (source == null) return null;
    return productIdMap[source] ?? source;
  }

  static Future<String?> _resolveCellId(
    Transaction txn,
    String warehouseId,
    String? locationCode,
  ) async {
    if (locationCode == null) return null;

    final existing = await txn.query(
      'cells',
      where: 'warehouseId = ? AND code = ?',
      whereArgs: [warehouseId, locationCode],
      limit: 1,
    );
    if (existing.isNotEmpty) {
      return existing.first['id'] as String;
    }

    final id = _uuid.v4();
    await txn.insert('cells', {
      'id': id,
      'warehouseId': warehouseId,
      'name': 'Cell $locationCode',
      'code': locationCode,
      'capacity': null,
      'description': 'Auto-created from POS inventory.location_id',
      'isActive': 1,
      'createdAt': DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
    });
    return id;
  }

  static Future<void> _upsertStock({
    required Transaction txn,
    required String itemId,
    required String warehouseId,
    required String? cellId,
    required double quantity,
    required String? batchNumber,
    required DateTime? expiryDate,
  }) async {
    final existing = await txn.query(
      'stocks',
      where:
          'itemId = ? AND warehouseId = ? AND '
          '(cellId = ? OR (cellId IS NULL AND ? IS NULL)) AND '
          '(batchNumber = ? OR (batchNumber IS NULL AND ? IS NULL)) AND '
          '(expiryDate = ? OR (expiryDate IS NULL AND ? IS NULL))',
      whereArgs: [
        itemId,
        warehouseId,
        cellId,
        cellId,
        batchNumber,
        batchNumber,
        expiryDate?.toIso8601String(),
        expiryDate?.toIso8601String(),
      ],
      limit: 1,
    );

    if (existing.isNotEmpty) {
      await txn.update(
        'stocks',
        {
          'quantity': quantity,
          'lastUpdated': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [existing.first['id']],
      );
      return;
    }

    await txn.insert('stocks', {
      'id': _uuid.v4(),
      'itemId': itemId,
      'warehouseId': warehouseId,
      'cellId': cellId,
      'quantity': quantity,
      'batchNumber': batchNumber,
      'serialNumber': null,
      'expiryDate': expiryDate?.toIso8601String(),
      'lastUpdated': DateTime.now().toIso8601String(),
      'updatedBy': 'pos-import',
    });
  }
}
