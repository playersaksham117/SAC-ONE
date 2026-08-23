import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../providers/inventory_provider.dart';
import '../providers/warehouse_provider.dart';
import '../services/pos_json_import_service.dart';

/// POS data import — network URL or manual JSON file upload.
class PosDataExtractionPanel extends StatefulWidget {
  const PosDataExtractionPanel({super.key});

  @override
  State<PosDataExtractionPanel> createState() => _PosDataExtractionPanelState();
}

class _PosDataExtractionPanelState extends State<PosDataExtractionPanel> {
  final _posDataUrl = TextEditingController();
  bool _importBusy = false;

  @override
  void initState() {
    super.initState();
    _loadSavedUrl();
  }

  Future<void> _loadSavedUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final posUrl = prefs.getString('pos_extraction_url');
    if (posUrl != null && mounted) _posDataUrl.text = posUrl;
  }

  @override
  void dispose() {
    _posDataUrl.dispose();
    super.dispose();
  }

  Future<void> _savePosUrl() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pos_extraction_url', _posDataUrl.text.trim());
  }

  Future<void> _runPosImport(Future<PosImportResult> Function() importFn) async {
    if (_importBusy) return;

    setState(() => _importBusy = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Expanded(child: Text('Importing POS data...')),
          ],
        ),
      ),
    );

    try {
      final result = await importFn();
      await _savePosUrl();
      await context.read<InventoryProvider>().loadInventoryItems();
      await context.read<InventoryProvider>().loadStocks();
      await context.read<InventoryProvider>().loadTransactions();
      await context.read<WarehouseProvider>().loadWarehouses();

      if (!mounted) return;
      Navigator.pop(context);

      final warningText = result.warnings.isEmpty ? '' : ' (${result.warnings.length} warnings)';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Import complete — '
            '${result.productsImported} products, '
            '${result.stockRowsImported} stock rows, '
            '${result.saleItemsImported} sale lines.$warningText',
          ),
          backgroundColor: const Color(0xFF10B981),
          duration: const Duration(seconds: 6),
        ),
      );
    } catch (e) {
      if (mounted) Navigator.pop(context);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Import failed: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _importBusy = false);
    }
  }

  Future<void> _importFromNetwork() async {
    final url = _posDataUrl.text.trim();
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a POS JSON URL')),
      );
      return;
    }
    await _runPosImport(() => PosJsonImportService.importFromNetwork(url));
  }

  Future<void> _importFromFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
      dialogTitle: 'Select POS JSON file',
    );
    if (result == null || result.files.isEmpty) return;
    final filePath = result.files.first.path;
    if (filePath == null) return;
    await _runPosImport(() => PosJsonImportService.importFromFile(filePath));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.point_of_sale_outlined, color: Color(0xFF64748B), size: 20),
              SizedBox(width: 8),
              Text(
                'POS Data Extraction',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Import products, inventory, and sales from another POS — over the network or from a JSON file.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _posDataUrl,
            enabled: !_importBusy,
            decoration: const InputDecoration(
              labelText: 'POS JSON URL',
              hintText: 'http://192.168.1.10:8080/api/pos-export.json',
              prefixIcon: Icon(Icons.link),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _importBusy ? null : _importFromNetwork,
                icon: const Icon(Icons.cloud_download_outlined),
                label: const Text('Fetch from network'),
              ),
              OutlinedButton.icon(
                onPressed: _importBusy ? null : _importFromFile,
                icon: const Icon(Icons.upload_file),
                label: const Text('Upload JSON file'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
