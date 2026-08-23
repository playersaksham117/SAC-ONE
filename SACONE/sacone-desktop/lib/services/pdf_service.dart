import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/inventory_item.dart';
import '../models/stock.dart';

class PDFService {
  static Future<void> generateStockReport({
    required List<InventoryItem> items,
    required List<Stock> stocks,
    String? itemId,
    required String currencySymbol,
  }) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (context) => [
          // Header
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'TracInvent',
                    style: pw.TextStyle(
                      fontSize: 24,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.blue800,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text(
                    'Stock Report',
                    style: const pw.TextStyle(fontSize: 16, color: PdfColors.grey700),
                  ),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'Generated: ${DateTime.now().toString().substring(0, 16)}',
                    style: const pw.TextStyle(fontSize: 10),
                  ),
                  if (itemId != null)
                    pw.Text(
                      'Item ID: $itemId',
                      style: const pw.TextStyle(fontSize: 10),
                    ),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 20),
          pw.Divider(),
          pw.SizedBox(height: 20),

          // Summary
          pw.Text(
            'Summary',
            style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 12),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              _buildSummaryCard('Total Items', items.length.toString()),
              _buildSummaryCard('Total Stock', stocks.fold<double>(0, (sum, s) => sum + s.quantity).toStringAsFixed(0)),
              _buildSummaryCard('Total Value', '$currencySymbol${_calculateTotalValue(items, stocks).toStringAsFixed(2)}'),
            ],
          ),
          pw.SizedBox(height: 30),

          // Stock Table
          pw.Text(
            'Stock Details',
            style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 12),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey300),
            columnWidths: {
              0: const pw.FlexColumnWidth(2),
              1: const pw.FlexColumnWidth(1.5),
              2: const pw.FlexColumnWidth(1),
              3: const pw.FlexColumnWidth(1),
              4: const pw.FlexColumnWidth(1.5),
            },
            children: [
              // Header
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: PdfColors.blue50),
                children: [
                  _buildTableCell('Item Name', isHeader: true),
                  _buildTableCell('SKU', isHeader: true),
                  _buildTableCell('Category', isHeader: true),
                  _buildTableCell('Stock', isHeader: true),
                  _buildTableCell('Value', isHeader: true),
                ],
              ),
              // Data Rows
              ...items.map((item) {
                final itemStocks = stocks.where((s) => s.itemId == item.id).toList();
                final totalQty = itemStocks.fold<double>(0, (sum, s) => sum + s.quantity);
                final value = totalQty * item.costPrice;
                
                return pw.TableRow(
                  children: [
                    _buildTableCell(item.name),
                    _buildTableCell(item.sku),
                    _buildTableCell(item.category),
                    _buildTableCell(totalQty.toStringAsFixed(0)),
                    _buildTableCell('$currencySymbol${value.toStringAsFixed(2)}'),
                  ],
                );
              }),
            ],
          ),
        ],
      ),
    );

    // Save and open PDF
    await Printing.layoutPdf(
      onLayout: (format) async => pdf.save(),
    );
  }

  static pw.Widget _buildSummaryCard(String title, String value) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(12),
      decoration: pw.BoxDecoration(
        color: PdfColors.grey100,
        borderRadius: pw.BorderRadius.circular(8),
      ),
      child: pw.Column(
        children: [
          pw.Text(
            title,
            style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600),
          ),
          pw.SizedBox(height: 4),
          pw.Text(
            value,
            style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold),
          ),
        ],
      ),
    );
  }

  static pw.Widget _buildTableCell(String text, {bool isHeader = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.all(8),
      child: pw.Text(
        text,
        style: pw.TextStyle(
          fontSize: isHeader ? 10 : 9,
          fontWeight: isHeader ? pw.FontWeight.bold : pw.FontWeight.normal,
          color: isHeader ? PdfColors.blue800 : PdfColors.black,
        ),
      ),
    );
  }

  static double _calculateTotalValue(List<InventoryItem> items, List<Stock> stocks) {
    double total = 0;
    for (var item in items) {
      final itemStocks = stocks.where((s) => s.itemId == item.id);
      final totalQty = itemStocks.fold<double>(0, (sum, s) => sum + s.quantity);
      total += totalQty * item.costPrice;
    }
    return total;
  }
}
