import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/inventory_item.dart';
import '../models/settings.dart';

class BarcodePrintService {
  static const double _mmToPt = 2.834645669;

  static bool isValidEanBarcode(String data) {
    if (!RegExp(r'^\d+$').hasMatch(data)) return false;
    if (data.length != 8 && data.length != 13) return false;

    var sum = 0;
    for (var i = data.length - 2; i >= 0; i--) {
      final digit = int.parse(data[i]);
      final positionFromRight = data.length - 2 - i;
      sum += digit * (positionFromRight.isEven ? 3 : 1);
    }
    final check = (10 - (sum % 10)) % 10;
    return check == int.parse(data[data.length - 1]);
  }

  /// Generate and print barcode sticker for a product
  static Future<void> printBarcode({
    required InventoryItem item,
    required BarcodeStickerSize stickerSize,
    required String currencySymbol,
    required bool includePrice,
    int quantity = 1,
  }) async {
    final pdf = pw.Document();

    // Convert mm to points (1mm = 2.834645669 points)
    final width = stickerSize.widthMM * _mmToPt;
    final height = stickerSize.heightMM * _mmToPt;

    // Add pages for each copy
    for (int i = 0; i < quantity; i++) {
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat(width, height),
          margin: const pw.EdgeInsets.all(8),
          build: (context) {
            return _buildBarcodeSticker(
              item: item,
              stickerSize: stickerSize,
              currencySymbol: currencySymbol,
              includePrice: includePrice,
            );
          },
        ),
      );
    }

    // Print the PDF
    await Printing.layoutPdf(
      onLayout: (format) async => pdf.save(),
      name: 'Barcode_${item.sku}.pdf',
    );
  }

  /// Generate PDF bytes for preview
  static Future<Uint8List> generateBarcodePDF({
    required InventoryItem item,
    required BarcodeStickerSize stickerSize,
    required String currencySymbol,
    required bool includePrice,
    int quantity = 1,
  }) async {
    final pdf = pw.Document();

    final width = stickerSize.widthMM * _mmToPt;
    final height = stickerSize.heightMM * _mmToPt;

    for (int i = 0; i < quantity; i++) {
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat(width, height),
          margin: const pw.EdgeInsets.all(8),
          build: (context) {
            return _buildBarcodeSticker(
              item: item,
              stickerSize: stickerSize,
              currencySymbol: currencySymbol,
              includePrice: includePrice,
            );
          },
        ),
      );
    }

    return pdf.save();
  }

  static pw.Widget _buildBarcodeSticker({
    required InventoryItem item,
    required BarcodeStickerSize stickerSize,
    required String currencySymbol,
    required bool includePrice,
  }) {
    // Determine font sizes based on sticker size
    final double nameFontSize = _getNameFontSize(stickerSize);
    final double priceFontSize = _getPriceFontSize(stickerSize);
    final double skuFontSize = _getSkuFontSize(stickerSize);
    final double barcodeHeight = _getBarcodeHeight(stickerSize);

    // Use barcode or SKU if barcode is not available
    final String barcodeData = item.barcode ?? item.sku;
    
    return pw.Container(
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
      ),
      padding: const pw.EdgeInsets.all(4),
      child: pw.Column(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          // Product Name
          pw.Text(
            item.name,
            style: pw.TextStyle(
              fontSize: nameFontSize,
              fontWeight: pw.FontWeight.bold,
            ),
            textAlign: pw.TextAlign.center,
            maxLines: 2,
            overflow: pw.TextOverflow.clip,
          ),
          
          pw.SizedBox(height: 2),
          
          // Barcode
          pw.Center(
            child: pw.Container(
              height: barcodeHeight,
              alignment: pw.Alignment.center,
              child: pw.BarcodeWidget(
                data: barcodeData,
                barcode: _selectBarcodeType(barcodeData),
                drawText: true,
                textStyle: pw.TextStyle(fontSize: skuFontSize),
              ),
            ),
          ),
          
          // Price and SKU
          pw.Row(
            mainAxisAlignment: includePrice ? pw.MainAxisAlignment.spaceBetween : pw.MainAxisAlignment.center,
            children: [
              if (includePrice)
                pw.Text(
                  '$currencySymbol${item.sellingPrice.toStringAsFixed(2)}',
                  style: pw.TextStyle(
                    fontSize: priceFontSize,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              pw.Text(
                'SKU: ${item.sku}',
                style: pw.TextStyle(
                  fontSize: skuFontSize,
                  color: PdfColors.grey700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static pw.Barcode _selectBarcodeType(String data) {
    if (RegExp(r'^\d+$').hasMatch(data)) {
      if (data.length == 13 || data.length == 12) {
        return pw.Barcode.ean13();
      } else if (data.length == 8 && isValidEanBarcode(data)) {
        return pw.Barcode.ean8();
      } else if (data.length == 7) {
        return pw.Barcode.ean8();
      }
    }

    return pw.Barcode.code128();
  }

  static double _getNameFontSize(BarcodeStickerSize size) {
    switch (size) {
      case BarcodeStickerSize.small:
        return 7;
      case BarcodeStickerSize.medium:
        return 9;
      case BarcodeStickerSize.large:
        return 11;
      case BarcodeStickerSize.extraLarge:
        return 13;
    }
  }

  static double _getPriceFontSize(BarcodeStickerSize size) {
    switch (size) {
      case BarcodeStickerSize.small:
        return 8;
      case BarcodeStickerSize.medium:
        return 10;
      case BarcodeStickerSize.large:
        return 12;
      case BarcodeStickerSize.extraLarge:
        return 14;
    }
  }

  static double _getSkuFontSize(BarcodeStickerSize size) {
    switch (size) {
      case BarcodeStickerSize.small:
        return 6;
      case BarcodeStickerSize.medium:
        return 7;
      case BarcodeStickerSize.large:
        return 8;
      case BarcodeStickerSize.extraLarge:
        return 9;
    }
  }

  static double _getBarcodeHeight(BarcodeStickerSize size) {
    switch (size) {
      case BarcodeStickerSize.small:
        return 25;
      case BarcodeStickerSize.medium:
        return 35;
      case BarcodeStickerSize.large:
        return 45;
      case BarcodeStickerSize.extraLarge:
        return 55;
    }
  }

  /// Print a QR label with custom title/subtitle and payload.
  static Future<void> printQrLabel({
    required String title,
    required String subtitle,
    required String qrData,
    required BarcodeStickerSize stickerSize,
    int quantity = 1,
  }) async {
    final pdf = pw.Document();
    final width = stickerSize.widthMM * _mmToPt;
    final height = stickerSize.heightMM * _mmToPt;

    for (int i = 0; i < quantity; i++) {
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat(width, height),
          margin: const pw.EdgeInsets.all(8),
          build: (_) {
            return pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: PdfColors.grey300, width: 0.6),
                borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
              ),
              padding: const pw.EdgeInsets.all(6),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                children: [
                  pw.Text(
                    title,
                    textAlign: pw.TextAlign.center,
                    style: pw.TextStyle(
                      fontSize: _getNameFontSize(stickerSize),
                      fontWeight: pw.FontWeight.bold,
                    ),
                    maxLines: 2,
                  ),
                  if (subtitle.isNotEmpty) ...[
                    pw.SizedBox(height: 2),
                    pw.Text(
                      subtitle,
                      textAlign: pw.TextAlign.center,
                      style: pw.TextStyle(
                        fontSize: _getSkuFontSize(stickerSize),
                        color: PdfColors.grey700,
                      ),
                    ),
                  ],
                  pw.SizedBox(height: 6),
                  pw.Expanded(
                    child: pw.Center(
                      child: pw.BarcodeWidget(
                        data: qrData,
                        barcode: pw.Barcode.qrCode(),
                        drawText: false,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      );
    }

    await Printing.layoutPdf(
      onLayout: (_) async => pdf.save(),
      name: 'Warehouse_QR_Label.pdf',
    );
  }
}
