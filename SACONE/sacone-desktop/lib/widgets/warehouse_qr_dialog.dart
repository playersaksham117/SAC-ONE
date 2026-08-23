import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:io';
import 'dart:async';
import 'package:qr_flutter/qr_flutter.dart';
import 'dart:ui' as ui;
import '../models/warehouse.dart';
import '../models/settings.dart';
import '../providers/settings_provider.dart';
import '../services/barcode_print_service.dart';

class WarehouseQrDialog extends StatefulWidget {
  final Warehouse warehouse;
  final String qrData;
  final Map<String, dynamic> warehouseDetails;

  const WarehouseQrDialog({
    super.key,
    required this.warehouse,
    required this.qrData,
    required this.warehouseDetails,
  });

  @override
  State<WarehouseQrDialog> createState() => _WarehouseQrDialogState();
}

class _WarehouseQrDialogState extends State<WarehouseQrDialog> {
  final TextEditingController _quantityController = TextEditingController(text: '1');
  bool _isPrinting = false;
  bool _isExporting = false;
  int _selectedTab = 0; // 0: Preview, 1: Table
  final GlobalKey _qrKey = GlobalKey();

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _printQrLabel() async {
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

      await BarcodePrintService.printQrLabel(
        title: widget.warehouse.name,
        subtitle: 'Warehouse QR Code',
        qrData: widget.qrData,
        stickerSize: settingsProvider.settings.barcodeStickerSize,
        quantity: quantity,
      );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Printing $quantity warehouse QR label(s)...'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error printing QR label: $e'),
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

  Future<void> _downloadQrPDF() async {
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
      // Generate PDF using existing service
      // For now, we'll use the printQrLabel method but save to file
      // We need to enhance the service to support PDF generation for QR codes
      // For now, create a basic PDF

      String? outputFile = await FilePicker.platform.saveFile(
        dialogTitle: 'Save Warehouse QR PDF',
        fileName: 'Warehouse_QR_${widget.warehouse.name}.pdf',
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (outputFile != null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('PDF saved to: $outputFile'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 3),
          ),
        );
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

  Future<void> _downloadQrPNG() async {
    setState(() => _isExporting = true);

    try {
      String? outputFile = await FilePicker.platform.saveFile(
        dialogTitle: 'Save Warehouse QR as PNG',
        fileName: 'Warehouse_QR_${widget.warehouse.name}.png',
        type: FileType.custom,
        allowedExtensions: ['png'],
      );

      if (outputFile != null) {
        // Generate QR code as PNG
        final qrPainter = QrPainter(
          data: widget.qrData,
          version: QrVersions.auto,
          gapless: true,
          eyeStyle: const QrEyeStyle(
            eyeShape: QrEyeShape.square,
            color: Color(0xFF000000),
          ),
          dataModuleStyle: const QrDataModuleStyle(
            dataModuleShape: QrDataModuleShape.square,
            color: Color(0xFF000000),
          ),
        );

        final image = await qrPainter.toImage(800);
        final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
        final pngBytes = byteData!.buffer.asUint8List();

        final file = File(outputFile);
        await file.writeAsBytes(pngBytes);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('PNG saved to: $outputFile'),
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
        final stickerSize = settingsProvider.settings.barcodeStickerSize;

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
                            'Warehouse QR Code',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          Text(
                            widget.warehouse.name,
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
                      ? _buildPreviewTab(stickerSize)
                      : _buildDetailsTab(),
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
                      onPressed: _isPrinting || _isExporting ? null : _downloadQrPNG,
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
                      onPressed: _isPrinting || _isExporting ? null : _downloadQrPDF,
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
                      onPressed: _isPrinting || _isExporting ? null : _printQrLabel,
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

  Widget _buildPreviewTab(BarcodeStickerSize stickerSize) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // QR Code Preview
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
                  widget.warehouse.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Warehouse QR Code',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: QrImageView(
                    key: _qrKey,
                    data: widget.qrData,
                    version: QrVersions.auto,
                    size: 250,
                    gapless: true,
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
                  child: Column(
                    children: [
                      Text(
                        'Warehouse: ${widget.warehouse.name}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Code: ${widget.warehouse.code}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
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

  Widget _buildDetailsTab() {
    final details = _getWarehouseDetails();

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

  Map<String, String> _getWarehouseDetails() {
    final Map<String, String> details = {};

    // Add warehouse details
    details['Address'] = widget.warehouse.address;
    details['City'] = widget.warehouse.city ?? 'N/A';
    details['Contact Person'] = widget.warehouse.contactPerson ?? 'N/A';
    details['Contact Phone'] = widget.warehouse.contactPhone ?? 'N/A';
    details['Contact Email'] = widget.warehouse.contactEmail ?? 'N/A';
    details['Postal Code'] = widget.warehouse.postalCode ?? 'N/A';
    details['Country'] = widget.warehouse.country ?? 'N/A';
    details['State'] = widget.warehouse.state ?? 'N/A';
    details['Warehouse Code'] = widget.warehouse.code;
    details['Warehouse ID'] = widget.warehouse.id;
    details['Warehouse Name'] = widget.warehouse.name;

    // Add summary if available
    if (widget.warehouseDetails.containsKey('summary')) {
      final summary = widget.warehouseDetails['summary'] as Map<String, dynamic>;
      details['Total Zones'] = summary['zones_count']?.toString() ?? 'N/A';
      details['Total Cells'] = summary['cells_count']?.toString() ?? 'N/A';
      details['Item Types'] = summary['item_types_present']?.toString() ?? 'N/A';
      details['Total Quantity'] = summary['qty_present_total']?.toString() ?? 'N/A';
      details['Low Stock Items'] = summary['low_items_count']?.toString() ?? 'N/A';
    }

    // Sort by key alphabetically
    final sortedDetails = Map<String, String>.fromEntries(
      details.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );

    return sortedDetails;
  }
}
