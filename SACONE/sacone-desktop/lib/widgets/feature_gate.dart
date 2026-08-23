import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/license_provider.dart';
import '../../providers/navigation_provider.dart';

/// Blocks Pro features or shows upgrade prompt when license lacks access.
class FeatureGate extends StatelessWidget {
  final String feature;
  final Widget child;
  final Widget? fallback;

  const FeatureGate({
    super.key,
    required this.feature,
    required this.child,
    this.fallback,
  });

  @override
  Widget build(BuildContext context) {
    return Consumer<LicenseProvider>(
      builder: (context, license, _) {
        if (license.canAccess(feature)) return child;
        return fallback ?? _LockedFeaturePanel(feature: feature);
      },
    );
  }
}

class _LockedFeaturePanel extends StatelessWidget {
  final String feature;

  const _LockedFeaturePanel({required this.feature});

  @override
  Widget build(BuildContext context) {
    final license = context.read<LicenseProvider>();
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Card(
          margin: const EdgeInsets.all(32),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline, size: 48, color: Colors.orange.shade700),
                const SizedBox(height: 16),
                Text(
                  'Pro Feature',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Text(
                  license.upgradeMessage(feature),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () {
                    context.read<NavigationProvider>().goToSettings();
                  },
                  icon: const Icon(Icons.vpn_key),
                  label: const Text('Activate License'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
