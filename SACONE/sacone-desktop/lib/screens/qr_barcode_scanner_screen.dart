import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/scanned_data_display_dialog.dart';

class QrBarcodeScanner extends StatefulWidget {
  const QrBarcodeScanner({super.key});

  @override
  State<QrBarcodeScanner> createState() => _QrBarcodeScannerState();
}

class _QrBarcodeScannerState extends State<QrBarcodeScanner> {
  final TextEditingController _barcodeController = TextEditingController();
  bool isProcessing = false;

  @override
  void dispose() {
    _barcodeController.dispose();
    super.dispose();
  }

  String _determineScanType(String data) {
    if (data.contains('item') || data.contains('sku')) {
      return 'Item Barcode';
    } else if (data.startsWith('http')) {
      return 'URL';
    } else if (data.length > 50) {
      return 'QR Code';
    }
    return 'Barcode';
  }

  void _processScannedData(String data) {
    if (data.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter barcode/QR data'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    String type = _determineScanType(data);
    _showScannedData(data, type);
  }

  void _showScannedData(String data, String type) {
    showDialog(
      context: context,
      builder: (context) => ScannedDataDisplayDialog(
        scannedData: data,
        title: 'Scanned $type',
      ),
    ).then((result) {
      if (mounted) {
        _barcodeController.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QR/Barcode Scanner'),
        backgroundColor: const Color(0xFF3B82F6),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        child: Container(
          padding: const EdgeInsets.all(32),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Scanner Icon
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.qr_code_2,
                      size: 80,
                      color: Color(0xFF3B82F6),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Title & Description
                  const Text(
                    'Barcode/QR Scanner',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Manually enter barcode or QR code data for desktop scanning',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 40),

                  // Input Field
                  TextField(
                    controller: _barcodeController,
                    enabled: !isProcessing,
                    autofocus: true,
                    onSubmitted: (value) {
                      if (!isProcessing) _processScannedData(value);
                    },
                    decoration: InputDecoration(
                      labelText: 'Barcode / QR Code Data',
                      hintText: 'Enter or paste barcode/QR code content here',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: Color(0xFFE2E8F0),
                          width: 2,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: Color(0xFF3B82F6),
                          width: 2,
                        ),
                      ),
                      prefixIcon: const Icon(Icons.barcode_reader),
                      suffixIcon: _barcodeController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: _barcodeController.clear,
                            )
                          : null,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                    ),
                    maxLines: 3,
                    minLines: 2,
                    onChanged: (value) => setState(() {}),
                  ),
                  const SizedBox(height: 24),

                  // Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: isProcessing
                              ? null
                              : () =>
                                  _processScannedData(_barcodeController.text),
                          icon: isProcessing
                              ? SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white.withValues(alpha: 0.7),
                                    ),
                                  ),
                                )
                              : const Icon(Icons.check_circle),
                          label: Text(
                            isProcessing ? 'Processing...' : 'Process Barcode',
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 14,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      OutlinedButton.icon(
                        onPressed:
                            isProcessing ? null : _barcodeController.clear,
                        icon: const Icon(Icons.clear),
                        label: const Text('Clear'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 14,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Paste from Clipboard
                  OutlinedButton.icon(
                    onPressed: isProcessing ? null : _pasteFromClipboard,
                    icon: const Icon(Icons.paste),
                    label: const Text('Paste from Clipboard'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Info Box
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.blue.withValues(alpha: 0.05),
                      border: Border.all(
                        color: Colors.blue.withValues(alpha: 0.2),
                        width: 1,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.info_outline,
                              color: Colors.blue.shade600,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'How to use',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '• Enter barcode/QR code data manually\n'
                          '• Paste data from clipboard using the Paste button\n'
                          '• Press Enter or click Process to scan\n'
                          '• Data will be parsed and displayed in a table format',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                            height: 1.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pasteFromClipboard() async {
    try {
      final ClipboardData? data =
          await Clipboard.getData('text/plain');
      if (data != null && data.text != null) {
        _barcodeController.text = data.text!;
        if (mounted) {
          setState(() {});
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error pasting from clipboard: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
