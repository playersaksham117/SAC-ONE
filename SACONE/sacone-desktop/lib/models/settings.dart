enum BarcodeStickerSize {
  small('Small', '2 x 1 inch', 50.8, 25.4),
  medium('Medium', '3 x 2 inch', 76.2, 50.8),
  large('Large', '4 x 2 inch', 101.6, 50.8),
  extraLarge('Extra Large', '4 x 3 inch', 101.6, 76.2);

  final String name;
  final String dimensions;
  final double widthMM;
  final double heightMM;

  const BarcodeStickerSize(this.name, this.dimensions, this.widthMM, this.heightMM);

  static BarcodeStickerSize fromName(String name) {
    return BarcodeStickerSize.values.firstWhere(
      (s) => s.name == name,
      orElse: () => BarcodeStickerSize.medium,
    );
  }
}

enum Currency {
  inr('INR', '₹', 'Indian Rupee'),
  usd('USD', '\$', 'US Dollar'),
  eur('EUR', '€', 'Euro'),
  gbp('GBP', '£', 'British Pound');

  final String code;
  final String symbol;
  final String name;

  const Currency(this.code, this.symbol, this.name);

  static Currency fromCode(String code) {
    return Currency.values.firstWhere(
      (c) => c.code == code,
      orElse: () => Currency.inr,
    );
  }
}

class AppSettings {
  final Currency currency;
  final String dateFormat;
  final bool showStockAlerts;
  final BarcodeStickerSize barcodeStickerSize;
  final bool includePriceOnBarcode;

  AppSettings({
    this.currency = Currency.inr,
    this.dateFormat = 'MMM dd, yyyy',
    this.showStockAlerts = true,
    this.barcodeStickerSize = BarcodeStickerSize.medium,
    this.includePriceOnBarcode = true,
  });

  AppSettings copyWith({
    Currency? currency,
    String? dateFormat,
    bool? showStockAlerts,
    BarcodeStickerSize? barcodeStickerSize,
    bool? includePriceOnBarcode,
  }) {
    return AppSettings(
      currency: currency ?? this.currency,
      dateFormat: dateFormat ?? this.dateFormat,
      showStockAlerts: showStockAlerts ?? this.showStockAlerts,
      barcodeStickerSize: barcodeStickerSize ?? this.barcodeStickerSize,
      includePriceOnBarcode: includePriceOnBarcode ?? this.includePriceOnBarcode,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'currency': currency.code,
      'dateFormat': dateFormat,
      'showStockAlerts': showStockAlerts,
      'barcodeStickerSize': barcodeStickerSize.name,
      'includePriceOnBarcode': includePriceOnBarcode,
    };
  }

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      currency: Currency.fromCode(json['currency'] ?? 'USD'),
      dateFormat: json['dateFormat'] ?? 'MMM dd, yyyy',
      showStockAlerts: json['showStockAlerts'] ?? true,
      barcodeStickerSize: BarcodeStickerSize.fromName(json['barcodeStickerSize'] ?? 'Medium'),
      includePriceOnBarcode: json['includePriceOnBarcode'] ?? true,
    );
  }
}
