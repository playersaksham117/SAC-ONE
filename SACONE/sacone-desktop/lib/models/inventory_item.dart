import 'stock.dart';

class InventoryItem {
  final String id;
  final String name;
  final String sku;
  final String? barcode;
  final String category;
  final String unit;
  final double reorderLevel;
  final double minStockLevel;
  final double costPrice;
  final double sellingPrice;
  final String? description;
  final String? hsn;
  final String? brand;
  final DateTime createdAt;
  final DateTime updatedAt;
  final double totalQuantity;
  final int locationCount;
  final List<LocationStock> locations;

  InventoryItem({
    required this.id,
    required this.name,
    required this.sku,
    this.barcode,
    required this.category,
    required this.unit,
    required this.reorderLevel,
    required this.minStockLevel,
    required this.costPrice,
    required this.sellingPrice,
    this.description,
    this.hsn,
    this.brand,
    required this.createdAt,
    required this.updatedAt,
    this.totalQuantity = 0,
    this.locationCount = 0,
    this.locations = const [],
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'sku': sku,
      'barcode': barcode,
      'category': category,
      'unit': unit,
      'reorderLevel': reorderLevel,
      'minStockLevel': minStockLevel,
      'costPrice': costPrice,
      'sellingPrice': sellingPrice,
      'description': description,
      'hsn': hsn,
      'brand': brand,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory InventoryItem.fromMap(Map<String, dynamic> map) {
    return InventoryItem(
      id: map['id'],
      name: map['name'],
      sku: map['sku'],
      barcode: map['barcode'],
      category: map['category'],
      unit: map['unit'],
      reorderLevel: map['reorderLevel'],
      minStockLevel: map['minStockLevel'],
      costPrice: map['costPrice'],
      sellingPrice: map['sellingPrice'],
      description: map['description'],
      hsn: map['hsn'],
      brand: map['brand'],
      createdAt: DateTime.parse(map['createdAt']),
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }
}
