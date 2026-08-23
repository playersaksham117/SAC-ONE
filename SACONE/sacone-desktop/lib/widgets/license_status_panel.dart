import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

import '../../providers/license_provider.dart';
import '../../models/license_models.dart';
import '../screens/licensing/license_activation_screen.dart';

class LicenseStatusPanel extends StatelessWidget {
  const LicenseStatusPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<LicenseProvider>(
      builder: (context, license, _) {
        final active = license.license;
        if (active == null) return const SizedBox.shrink();

        final dateFmt = DateFormat('dd MMM yyyy');
        final tierColor = switch (active.tier) {
          LicenseTier.pro || LicenseTier.enterprise => const Color(0xFF10B981),
          LicenseTier.trial => const Color(0xFFF59E0B),
          _ => const Color(0xFF64748B),
        };

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
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: tierColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.verified_user, color: tierColor),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'License & Subscription',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          active.organizationName,
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(active.tier.name.toUpperCase()),
                    backgroundColor: tierColor.withValues(alpha: 0.15),
                    labelStyle: TextStyle(color: tierColor, fontWeight: FontWeight.w600, fontSize: 11),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _infoRow('Status', active.isValid ? 'Active' : 'Expired'),
              _infoRow('Expires', dateFmt.format(active.expiresAt)),
              _infoRow('Days remaining', '${active.daysRemaining}'),
              if (active.tier != LicenseTier.trial) ...[
                _infoRow('Devices', '${active.activatedDevices} / ${active.maxDevices}'),
              ],
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _featureChip('POS', active.features.pos),
                  _featureChip('Mobile', active.features.mobileSync),
                  _featureChip('Analytics', active.features.analytics),
                  _featureChip('Advanced', active.features.advancedRetail),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const LicenseActivationScreen()),
                      );
                    },
                    icon: const Icon(Icons.vpn_key, size: 18),
                    label: const Text('Activate / Renew'),
                  ),
                  OutlinedButton.icon(
                    onPressed: license.isLoading ? null : () => license.refresh(),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Revalidate'),
                  ),
                ],
              ),
              if (license.subscriptionHistory.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Recent events', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                ...license.subscriptionHistory.take(5).map((e) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(e['eventType']?.toString() ?? '', style: const TextStyle(fontSize: 13)),
                      subtitle: Text(e['notes']?.toString() ?? '', style: const TextStyle(fontSize: 12)),
                      trailing: Text(
                        e['eventDate']?.toString().substring(0, 10) ?? '',
                        style: const TextStyle(fontSize: 11),
                      ),
                    )),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 120, child: Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 13))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _featureChip(String label, bool enabled) {
    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      avatar: Icon(
        enabled ? Icons.check_circle : Icons.cancel,
        size: 16,
        color: enabled ? Colors.green : Colors.grey,
      ),
      visualDensity: VisualDensity.compact,
    );
  }
}
