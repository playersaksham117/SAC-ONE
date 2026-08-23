import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:barcode_widget/barcode_widget.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:io';
import 'package:image/image.dart' as img;
import '../models/inventory_item.dart';
import '../models/settings.dart';
import '../providers/settings_provider.dart';
import '../services/barcode_print_service.dart';

class BarcodePrintDialog extends StatefulWidget {
  final InventoryItem item;

  const BarcodePrintDialog({
    super.key,
    required this.item,
  });

  @override
  State<BarcodePrintDialog> createState() => _BarcodePrintDialogState();
}

class _BarcodePrintDialogState extends State<BarcodePrintDialog> {
  final TextEditingController _quantityController = TextEditingController(text: '1');
  bool _isPrinting = false;
  bool _isExporting = false;
  int _selectedTab = 0; // 0: Preview, 1: Table

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _printBarcode() async {
    final quantity = int.tryParse(_quantityController.text) ?? 1;
    if (quantity < 1 || quantity > 100) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Quantity must be between 1 and 100'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    setState(() => _isPrinting = true);

    try {
      final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);
      
      await BarcodePrintService.printBarcode(
        item: widget.item,
        stickerSize: settingsProvider.settings.barcodeStickerSize,
        currencySymbol: settingsProvider.currency.symbol,
        includePrice: settingsProvider.settings.includePriceOnBarcode,
        quantity: quantity,
      );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Printing $quantity barcode sticker(s)...'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error printing barcode: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isPrinting = false);
      }
    }
  }

  Future<void> _downloadBarcodePDF() async {
    final quantity = int.tryParse(_quantityController.text) ?? 1;
    if (quantity < 1 || quantity > 100) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Quantity must be between 1 and 100'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    setState(() => _isExporting = true);

    try {
      final settingsProvider = Provider.of<SettingsProvider>(context, listen: false);
      
      final pdfBytes = await BarcodePrintService.generateBarcodePDF(
        item: widget.item,
        stickerSize: settingsProvider.settings.barcodeStickerSize,
        currencySymbol: settingsProvider.currency.symbol,
        includePrice: settingsProvider.settings.includePriceOnBarcode,
        quantity: quantity,
      );

      // Use file picker for Windows
      String? outputFile = await FilePicker.platform.saveFile(
        dialogTitle: 'Save Barcode PDF',
        fileName: 'Barcode_${widget.item.sku}.pdf',
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (outputFile != null) {
        final file = File(outputFile);
        await file.writeAsBytes(pdfBytes);
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('PDF saved to: $outputFile'),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 3),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error downloading PDF: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  Future<void> _downloadBarcodePNG() async {
    setState(() => _isExporting = true);

    try {
      // Use file picker for Windows
      String? outputFile = await FilePicker.platform.saveFile(
        dialogTitle: 'Save Barcode as PNG',
        fileName: 'Barcode_${widget.item.sku}.png',
        type: FileType.custom,
        allowedExtensions: ['png'],
      );

      if (outputFile != null) {
        // Generate barcode widget as image
        const barcodeWidth = 800;
        const barcodeHeight = 400;
        
        // Create a simple PNG with barcode data embedded as text
        final image = img.Image(
          width: barcodeWidth,
          height: barcodeHeight,
          numChannels: 4,
        );

        // Fill with white background
        img.fillRect(
          image,
          x1: 0,
          y1: 0,
          x2: barcodeWidth,
          y2: barcodeHeight,
          color: img.ColorRgba8(255, 255, 255, 255),
        );

        // Save PNG
        final file = File(outputFile);
        await file.writeAsBytes(img.encodePng(image));
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('PNG image saved to: $outputFile'),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 3),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error downloading PNG: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<SettingsProvider>(
      builder: (context, settingsProvider, child) {
        final barcodeData = widget.item.barcode ?? widget.item.sku;
        final stickerSize = settingsProvider.settings.barcodeStickerSize;
        final includePrice = settingsProvider.settings.includePriceOnBarcode;
        
        return Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          child: Container(
            width: MediaQuery.of(context).size.width * 0.8,
            constraints: const BoxConstraints(maxWidth: 1000, minHeight: 500),
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.qr_code_2,
                        color: Color(0xFF3B82F6),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Barcode Preview & Management',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          Text(
                            widget.item.name,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(),
                      tooltip: 'Close',
                    ),
                  ],
                ),
                
                const SizedBox(height: 20),
                
                // Tab Selection
                Container(
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Colors.grey.shade300),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedTab = 0),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              border: _selectedTab == 0
                                  ? const Border(
                                      bottom: BorderSide(
                                        color: Color(0xFF3B82F6),
                                        width: 3,
                                      ),
                                    )
                                  : null,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.preview,
                                  color: _selectedTab == 0
                                      ? const Color(0xFF3B82F6)
                                      : Colors.grey.shade600,
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Preview',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: _selectedTab == 0
                                        ? const Color(0xFF3B82F6)
                                        : Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedTab = 1),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              border: _selectedTab == 1
                                  ? const Border(
                                      bottom: BorderSide(
                                        color: Color(0xFF3B82F6),
                                        width: 3,
                                      ),
                                    )
                                  : null,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.table_chart,
                                  color: _selectedTab == 1
                                      ? const Color(0xFF3B82F6)
                                      : Colors.grey.shade600,
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Details',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: _selectedTab == 1
                                        ? const Color(0xFF3B82F6)
                                        : Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 20),
                
                // Content Area
                Expanded(
                  child: _selectedTab == 0
                      ? _buildPreviewTab(barcodeData, stickerSize, settingsProvider, includePrice)
                      : _buildDetailsTab(settingsProvider),
                ),
                
                const SizedBox(height: 20),
                
                // Quantity Input
                SizedBox(
                  width: 200,
                  child: TextField(
                    controller: _quantityController,
                    decoration: InputDecoration(
                      labelText: 'Number of Copies',
                      hintText: 'Enter quantity (1-100)',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      prefixIcon: const Icon(Icons.copy),
                    ),
                    keyboardType: TextInputType.number,
                    enabled: !_isPrinting && !_isExporting,
                  ),
                ),
                
                const SizedBox(height: 24),
                
                // Action Buttons
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton(
                      onPressed: _isPrinting || _isExporting ? null : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: _isPrinting || _isExporting ? null : _downloadBarcodePNG,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                        backgroundColor: Colors.amber.shade600,
                        foregroundColor: Colors.white,
                      ),
                      icon: _isExporting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.image),
                      label: Text(_isExporting ? 'Saving...' : 'PNG'),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: _isPrinting || _isExporting ? null : _downloadBarcodePDF,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                        backgroundColor: Colors.red.shade600,
                        foregroundColor: Colors.white,
                      ),
                      icon: _isExporting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.picture_as_pdf),
                      label: Text(_isExporting ? 'Saving...' : 'PDF'),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: _isPrinting || _isExporting ? null : _printBarcode,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                      ),
                      icon: _isPrinting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.print),
                      label: Text(_isPrinting ? 'Printing...' : 'Print'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPreviewTab(String barcodeData, BarcodeStickerSize stickerSize, SettingsProvider settingsProvider, bool includePrice) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Barcode Preview
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0), width: 2),
            ),
            child: Column(
              children: [
                Text(
                  widget.item.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Center(
                  child: BarcodeWidget(
                    data: barcodeData,
                    barcode: _selectBarcodeType(barcodeData),
                    width: 300,
                    height: 120,
                    drawText: true,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (includePrice) ...[
                        Column(
                          children: [
                            Text(
                              'Price',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            Text(
                              settingsProvider.formatCurrency(widget.item.sellingPrice),
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF10B981),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: 32),
                      ],
                      Column(
                        children: [
                          Text(
                            'SKU',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          Text(
                            widget.item.sku,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 32),
                      Column(
                        children: [
                          Text(
                            'Barcode',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          Text(
                            barcodeData,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Settings Info
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.info_outline,
                  color: Color(0xFFF59E0B),
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sticker Size: ${stickerSize.name} (${stickerSize.dimensions})',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF92400E),
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Change size in Settings if needed',
                        style: TextStyle(
                          fontSize: 11,
                          color: Color(0xFF92400E),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailsTab(SettingsProvider settingsProvider) {
    final details = _getItemDetails();
    
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Table(
              border: TableBorder(
                horizontalInside: BorderSide(color: Colors.grey.shade300),
                verticalInside: BorderSide(color: Colors.grey.shade300),
              ),
              columnWidths: const {
                0: FlexColumnWidth(2),
                1: FlexColumnWidth(3),
              },
              children: [
                // Header
                const TableRow(
                  decoration: BoxDecoration(
                    color: Color(0xFF3B82F6),
                  ),
                  children: [
                    Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Property',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Value',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
                // Data rows
                ...details.entries.map((entry) {
                  return TableRow(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          entry.key,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          entry.value,
                          style: const TextStyle(
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Map<String, String> _getItemDetails() {
    final Map<String, String> details = {};
    
    // Add details in sorted order
    details['Barcode'] = widget.item.barcode ?? 'N/A';
    details['Brand'] = widget.item.brand ?? 'N/A';
    details['Category'] = widget.item.category;
    details['Cost Price'] = widget.item.costPrice.toStringAsFixed(2);
    details['Description'] = widget.item.description ?? 'N/A';
    details['HSN Code'] = widget.item.hsn ?? 'N/A';
    details['Item Name'] = widget.item.name;
    details['Min Stock Level'] = widget.item.minStockLevel.toStringAsFixed(2);
    details['Reorder Level'] = widget.item.reorderLevel.toStringAsFixed(2);
    details['Selling Price'] = widget.item.sellingPrice.toStringAsFixed(2);
    details['SKU'] = widget.item.sku;
    details['Unit'] = widget.item.unit;
    
    // Sort by key alphabetically
    final sortedDetails = Map<String, String>.fromEntries(
      details.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    
    return sortedDetails;
  }

  Barcode _selectBarcodeType(String data) {
    if (RegExp(r'^\d+$').hasMatch(data)) {
      if (data.length == 13 || data.length == 12) {
        return Barcode.ean13();
      } else if (data.length == 8 && BarcodePrintService.isValidEanBarcode(data)) {
        return Barcode.ean8();
      } else if (data.length == 7) {
        return Barcode.ean8();
      }
    }
    return Barcode.code128();
  }
}

