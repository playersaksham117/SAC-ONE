import 'package:flutter/material.dart';
import '../services/database_cleanup_service.dart';

class DatabaseCleanupDialog extends StatefulWidget {
  const DatabaseCleanupDialog({super.key});

  @override
  State<DatabaseCleanupDialog> createState() => _DatabaseCleanupDialogState();
}

class _DatabaseCleanupDialogState extends State<DatabaseCleanupDialog> {
  bool _isProcessing = false;
  String? _currentOperation;
  String? _databaseSize;
  
  // Cleanup options
  bool _clearInventory = false;
  bool _clearStock = false;
  bool _clearWarehouses = false;
  bool _clearTransactions = false;
  bool _clearMovements = false;

  @override
  void initState() {
    super.initState();
    _loadDatabaseSize();
  }

  Future<void> _loadDatabaseSize() async {
    try {
      final size = await DatabaseCleanupService.getDatabaseSize();
      setState(() {
        _databaseSize = DatabaseCleanupService.formatBytes(size);
      });
    } catch (e) {
      setState(() {
        _databaseSize = 'Unknown';
      });
    }
  }

  Future<void> _performCleanup(String operation) async {
    // Confirm action
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Action'),
        content: Text(
          operation == 'full'
              ? 'This will DELETE ALL DATA and reset the database to its initial state.\n\n'
                'This action CANNOT be undone!'
              : 'This will clear selected tables.\n\n'
                'Deleted data cannot be recovered.',
          style: const TextStyle(color: Colors.red),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Proceed'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isProcessing = true;
      _currentOperation = operation == 'full' ? 'Cleaning database...' : 'Clearing tables...';
    });

    try {
      if (operation == 'full') {
        await DatabaseCleanupService.cleanDatabase();
      } else if (operation == 'selective') {
        await DatabaseCleanupService.clearTables(
          clearInventory: _clearInventory,
          clearStock: _clearStock,
          clearWarehouses: _clearWarehouses,
          clearTransactions: _clearTransactions,
          clearMovements: _clearMovements,
        );
      } else if (operation == 'optimize') {
        setState(() {
          _currentOperation = 'Optimizing database...';
        });
        await DatabaseCleanupService.optimizeDatabase();
      }

      // Reload database size
      await _loadDatabaseSize();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              operation == 'full'
                  ? 'Database cleaned successfully'
                  : operation == 'optimize'
                      ? 'Database optimized successfully'
                      : 'Selected tables cleared successfully',
            ),
            backgroundColor: Colors.green,
          ),
        );

        // Close dialog if full cleanup
        if (operation == 'full') {
          Navigator.of(context).pop(true);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _currentOperation = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        width: 550,
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
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.cleaning_services,
                    color: Colors.orange.shade700,
                    size: 32,
                  ),
                ),
                const SizedBox(width: 16),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Database Maintenance',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Clean, optimize, or reset your database',
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: _isProcessing ? null : () => Navigator.of(context).pop(),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Database info
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.storage, color: Color(0xFF64748B), size: 20),
                  const SizedBox(width: 12),
                  const Text(
                    'Database Size:',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    _databaseSize ?? 'Loading...',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF3B82F6),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Options
            if (_isProcessing) ...[
              Center(
                child: Column(
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(
                      _currentOperation ?? 'Processing...',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Option 1: Full cleanup
              _buildOptionCard(
                icon: Icons.delete_forever,
                iconColor: Colors.red,
                title: 'Full Database Reset',
                description: 'Delete ALL data and reinitialize the database',
                buttonText: 'Reset Database',
                buttonColor: Colors.red,
                onPressed: () => _performCleanup('full'),
              ),

              const SizedBox(height: 16),

              // Option 2: Selective cleanup
              _buildOptionCard(
                icon: Icons.playlist_remove,
                iconColor: Colors.orange,
                title: 'Clear Selected Tables',
                description: 'Choose which tables to clear',
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    _buildCheckbox('Clear Inventory Items', _clearInventory, (value) {
                      setState(() => _clearInventory = value ?? false);
                    }),
                    _buildCheckbox('Clear Stock Records', _clearStock, (value) {
                      setState(() => _clearStock = value ?? false);
                    }),
                    _buildCheckbox('Clear Warehouses & Locations', _clearWarehouses, (value) {
                      setState(() => _clearWarehouses = value ?? false);
                    }),
                    _buildCheckbox('Clear Transactions', _clearTransactions, (value) {
                      setState(() => _clearTransactions = value ?? false);
                    }),
                    _buildCheckbox('Clear Stock Movements', _clearMovements, (value) {
                      setState(() => _clearMovements = value ?? false);
                    }),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: (_clearInventory || _clearStock || _clearWarehouses || 
                                   _clearTransactions || _clearMovements)
                            ? () => _performCleanup('selective')
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.all(12),
                        ),
                        child: const Text('Clear Selected'),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Option 3: Optimize
              _buildOptionCard(
                icon: Icons.speed,
                iconColor: Colors.blue,
                title: 'Optimize Database',
                description: 'Run VACUUM and ANALYZE to improve performance',
                buttonText: 'Optimize Now',
                buttonColor: Colors.blue,
                onPressed: () => _performCleanup('optimize'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildOptionCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String description,
    String? buttonText,
    Color? buttonColor,
    VoidCallback? onPressed,
    Widget? child,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE2E8F0)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: iconColor, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (child != null) child,
          if (buttonText != null && onPressed != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onPressed,
                style: ElevatedButton.styleFrom(
                  backgroundColor: buttonColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(12),
                ),
                child: Text(buttonText),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCheckbox(String label, bool value, ValueChanged<bool?> onChanged) {
    return CheckboxListTile(
      title: Text(
        label,
        style: const TextStyle(fontSize: 14),
      ),
      value: value,
      onChanged: onChanged,
      dense: true,
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
