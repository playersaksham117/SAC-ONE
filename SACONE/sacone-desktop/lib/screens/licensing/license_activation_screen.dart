import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/license_provider.dart';
import '../home_screen.dart';

class LicenseActivationScreen extends StatefulWidget {
  final String? message;
  final bool allowBasicContinue;
  final VoidCallback? onContinueBasic;

  const LicenseActivationScreen({
    super.key,
    this.message,
    this.allowBasicContinue = false,
    this.onContinueBasic,
  });

  @override
  State<LicenseActivationScreen> createState() => _LicenseActivationScreenState();
}

class _LicenseActivationScreenState extends State<LicenseActivationScreen> {
  final _keyController = TextEditingController();
  bool _busy = false;
  String? _status;

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.vpn_key, size: 48, color: Color(0xFF2563EB)),
                    const SizedBox(height: 16),
                    Text(
                      'Activate TracInvent',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.message ??
                          'Enter your license key to unlock POS, mobile sync, analytics, and Pro features.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _keyController,
                      decoration: const InputDecoration(
                        labelText: 'License key',
                        hintText: 'TRINV-...',
                        border: OutlineInputBorder(),
                      ),
                      textCapitalization: TextCapitalization.characters,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _activate,
                      child: _busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Activate License'),
                    ),
                    if (widget.allowBasicContinue) ...[
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: widget.onContinueBasic ??
                            () {
                              Navigator.of(context).pushReplacement(
                                MaterialPageRoute(builder: (_) => const HomeScreen()),
                              );
                            },
                        child: const Text('Continue with Basic (Inventory only)'),
                      ),
                    ],
                    if (_status != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        _status!,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _status!.startsWith('Success') ? Colors.green.shade700 : Colors.red.shade700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    const Divider(),
                    const SizedBox(height: 12),
                    Text(
                      'License tiers',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    _tierRow('Basic', 'Inventory, warehouses, basic reports'),
                    _tierRow('Pro', 'POS, mobile sync, analytics, advanced retail'),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tierRow(String tier, String desc) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 56, child: Text(tier, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: Text(desc, style: TextStyle(color: Colors.grey.shade600, fontSize: 13))),
        ],
      ),
    );
  }

  Future<void> _activate() async {
    final key = _keyController.text.trim();
    if (key.isEmpty) return;

    setState(() {
      _busy = true;
      _status = null;
    });

    try {
      final license = context.read<LicenseProvider>();
      await license.activate(key);
      setState(() => _status = 'Success! ${license.license?.organizationName} — ${license.license?.tier.name.toUpperCase()}');
      if (mounted) {
        await Future.delayed(const Duration(milliseconds: 800));
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      }
    } catch (e) {
      setState(() => _status = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
