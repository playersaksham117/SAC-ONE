import 'dart:io';
import 'package:excel/excel.dart';
import 'package:path_provider/path_provider.dart';
import '../models/inventory_item.dart';
import '../models/stock.dart';

class ExcelService {
  static Future<String> generateStockReport({
    required List<InventoryItem> items,
    required List<Stock> stocks,
    String? itemId,
    required String currencySymbol,
  }) async {
    var excel = Excel.createExcel();
    Sheet sheet = excel['Stock Report'];

    // Set column widths
    sheet.setColumnWidth(0, 25);
    sheet.setColumnWidth(1, 15);
    sheet.setColumnWidth(2, 15);
    sheet.setColumnWidth(3, 10);
    sheet.setColumnWidth(4, 15);
    sheet.setColumnWidth(5, 15);
    sheet.setColumnWidth(6, 15);

    // Title Row
    var titleCell = sheet.cell(CellIndex.indexByString('A1'));
    titleCell.value = TextCellValue('TracInvent - Stock Report');
    titleCell.cellStyle = CellStyle(
      bold: true,
      fontSize: 16,
      fontColorHex: ExcelColor.blue800,
    );

    // Date Row
    var dateCell = sheet.cell(CellIndex.indexByString('A2'));
    dateCell.value = TextCellValue('Generated: ${DateTime.now().toString().substring(0, 16)}');
    dateCell.cellStyle = CellStyle(fontSize: 10);

    // Header Row (Row 4)
    final headers = ['Item Name', 'SKU', 'Category', 'Unit', 'Stock Qty', 'Cost Price', 'Total Value'];
    for (var i = 0; i < headers.length; i++) {
      var cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 3));
      cell.value = TextCellValue(headers[i]);
      cell.cellStyle = CellStyle(
        bold: true,
        backgroundColorHex: ExcelColor.blue50,
        fontSize: 11,
      );
    }

    // Data Rows
    int rowIndex = 4;
    double grandTotal = 0;

    for (var item in items) {
      if (itemId != null && item.id != itemId) continue;

      final itemStocks = stocks.where((s) => s.itemId == item.id).toList();
      final totalQty = itemStocks.fold<double>(0, (sum, s) => sum + s.quantity);
      final totalValue = totalQty * item.costPrice;
      grandTotal += totalValue;

      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: rowIndex)).value = TextCellValue(item.name);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: rowIndex)).value = TextCellValue(item.sku);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 2, rowIndex: rowIndex)).value = TextCellValue(item.category);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 3, rowIndex: rowIndex)).value = TextCellValue(item.unit);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 4, rowIndex: rowIndex)).value = DoubleCellValue(totalQty);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: rowIndex)).value = TextCellValue('$currencySymbol${item.costPrice.toStringAsFixed(2)}');
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 6, rowIndex: rowIndex)).value = TextCellValue('$currencySymbol${totalValue.toStringAsFixed(2)}');
      
      rowIndex++;
    }

    // Total Row
    rowIndex++;
    var totalLabelCell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: rowIndex));
    totalLabelCell.value = TextCellValue('Grand Total:');
    totalLabelCell.cellStyle = CellStyle(bold: true);

    var totalValueCell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: 6, rowIndex: rowIndex));
    totalValueCell.value = TextCellValue('$currencySymbol${grandTotal.toStringAsFixed(2)}');
    totalValueCell.cellStyle = CellStyle(bold: true, backgroundColorHex: ExcelColor.yellow);

    // Save file
    final directory = await getApplicationDocumentsDirectory();
    final fileName = 'Stock_Report_${DateTime.now().millisecondsSinceEpoch}.xlsx';
    final filePath = '${directory.path}/$fileName';
    
    final fileBytes = excel.save();
    if (fileBytes != null) {
      File(filePath)
        ..createSync(recursive: true)
        ..writeAsBytesSync(fileBytes);
    }

    return filePath;
  }

  static Future<String> generateTransactionReport({
    required List<dynamic> transactions,
    required String currencySymbol,
  }) async {
    var excel = Excel.createExcel();
    Sheet sheet = excel['Transactions'];

    // Set column widths
    sheet.setColumnWidth(0, 20);
    sheet.setColumnWidth(1, 15);
    sheet.setColumnWidth(2, 12);
    sheet.setColumnWidth(3, 10);
    sheet.setColumnWidth(4, 15);
    sheet.setColumnWidth(5, 25);

    // Title Row
    var titleCell = sheet.cell(CellIndex.indexByString('A1'));
    titleCell.value = TextCellValue('TracInvent - Transaction Report');
    titleCell.cellStyle = CellStyle(bold: true, fontSize: 16);

    // Header Row
    final headers = ['Date', 'Item ID', 'Type', 'Quantity', 'Amount', 'Notes'];
    for (var i = 0; i < headers.length; i++) {
      var cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 3));
      cell.value = TextCellValue(headers[i]);
      cell.cellStyle = CellStyle(bold: true, backgroundColorHex: ExcelColor.blue50);
    }

    // Data rows
    int rowIndex = 4;
    for (var transaction in transactions) {
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: rowIndex)).value = TextCellValue(transaction.transactionDate.toString().substring(0, 10));
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: rowIndex)).value = TextCellValue(transaction.itemId);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 2, rowIndex: rowIndex)).value = TextCellValue(transaction.type);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 3, rowIndex: rowIndex)).value = DoubleCellValue(transaction.quantity);
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 4, rowIndex: rowIndex)).value = TextCellValue('$currencySymbol${transaction.totalPrice.toStringAsFixed(2)}');
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: rowIndex)).value = TextCellValue(transaction.notes ?? '');
      
      rowIndex++;
    }

    // Save file
    final directory = await getApplicationDocumentsDirectory();
    final fileName = 'Transaction_Report_${DateTime.now().millisecondsSinceEpoch}.xlsx';
    final filePath = '${directory.path}/$fileName';
    
    final fileBytes = excel.save();
    if (fileBytes != null) {
      File(filePath)
        ..createSync(recursive: true)
        ..writeAsBytesSync(fileBytes);
    }

    return filePath;
  }
}
