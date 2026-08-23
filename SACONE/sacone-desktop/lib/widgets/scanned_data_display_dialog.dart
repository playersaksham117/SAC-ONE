import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';

class ScannedDataDisplayDialog extends StatefulWidget {
  final String scannedData;
  final String title;

  const ScannedDataDisplayDialog({
    super.key,
    required this.scannedData,
    this.title = 'Scanned Data',
  });

  @override
  State<ScannedDataDisplayDialog> createState() => _ScannedDataDisplayDialogState();
}

class _ScannedDataDisplayDialogState extends State<ScannedDataDisplayDialog> {
  late Map<String, dynamic> parsedData;
  bool isValid = true;
  String? errorMessage;
  Map<String, bool> expandedSections = {};

  @override
  void initState() {
    super.initState();
    _parseScannedData();
  }

  void _parseScannedData() {
    try {
      parsedData = jsonDecode(widget.scannedData);
      isValid = true;
      errorMessage = null;
      // Initialize sections as expanded
      expandedSections = {
        'item': true,
        'product': true,
        'other': true,
      };
    } catch (e) {
      isValid = false;
      parsedData = {};
      errorMessage = e.toString();
    }
  }

  Color _getHeaderColor() {
    if (widget.scannedData.contains('item') ||
        widget.scannedData.contains('sku')) {
      return const Color(0xFF3B82F6); // Blue for items
    }
    return const Color(0xFF6366F1); // Indigo default
  }



  Widget _buildDataTable(List<MapEntry<String, String>> data) {
    return Container(
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
          0: FlexColumnWidth(1.5),
          1: FlexColumnWidth(2),
        },
        children: [
          // Header Row
          TableRow(
            decoration: BoxDecoration(color: _getHeaderColor()),
            children: const [
              Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Property',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    fontSize: 13,
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
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          // Data Rows
          ...data.asMap().entries.map((entry) {
            final isEven = entry.key % 2 == 0;
            return TableRow(
              decoration: BoxDecoration(
                color: isEven ? const Color(0xFFF8FAFC) : Colors.white,
              ),
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    entry.value.key,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: _getHeaderColor(),
                      fontSize: 12,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    _formatValue(entry.value.value),
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF0F172A),
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            );
          }),
        ],
      ),
    );
  }



  @override
  Widget build(BuildContext context) {
    if (!isValid) {
      return Dialog(
        child: Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              const Text('Invalid Data Format'),
              const SizedBox(height: 8),
              Text(errorMessage ?? 'Unable to parse scanned data'),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Close'),
              ),
            ],
          ),
        ),
      );
    }

    final headerColor = _getHeaderColor();

    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: const BoxConstraints(maxWidth: 1200, minHeight: 400),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: headerColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.barcode_reader,
                    color: headerColor,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        'Scanned Item Data',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade600,
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

            const SizedBox(height: 24),

            // Content
            Expanded(
              child: _buildGenericDataView(),
            ),

            const SizedBox(height: 24),

            // Action Buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(
                      ClipboardData(text: widget.scannedData),
                    ).then((_) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Data copied to clipboard'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    });
                  },
                  icon: const Icon(Icons.content_copy),
                  label: const Text('Copy'),
                  style: OutlinedButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  ),
                ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  label: const Text('Close'),
                  style: OutlinedButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop(true);
                  },
                  icon: const Icon(Icons.check),
                  label: const Text('Process'),
                  style: ElevatedButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGenericDataView() {
    final data = _flattenJson(parsedData);

    return data.isEmpty
        ? Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.inbox_outlined,
                  size: 64,
                  color: Colors.grey.shade400,
                ),
                const SizedBox(height: 16),
                Text(
                  'No data to display',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          )
        : SingleChildScrollView(
            child: _buildDataTable(data),
          );
  }

  List<MapEntry<String, String>> _flattenJson(Map<String, dynamic> json) {
    final List<MapEntry<String, String>> result = [];

    json.forEach((key, value) {
      if (value is! Map && value is! List) {
        result.add(MapEntry(
          _formatLabel(key),
          _formatValue(value),
        ));
      }
    });

    result.sort((a, b) => a.key.compareTo(b.key));
    return result;
  }

  String _formatLabel(String key) {
    return key
        .replaceAll('_', ' ')
        .split(' ')
        .map((word) => word[0].toUpperCase() + word.substring(1).toLowerCase())
        .join(' ');
  }

  String _formatValue(dynamic value) {
    if (value == null) return 'N/A';
    if (value is bool) return value ? 'Yes' : 'No';
    if (value is double) return value.toStringAsFixed(2);
    if (value is int) return value.toString();
    return value.toString();
  }

}
