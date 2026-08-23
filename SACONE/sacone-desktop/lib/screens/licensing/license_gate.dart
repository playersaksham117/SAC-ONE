import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../providers/license_provider.dart';
import '../../models/license_models.dart';
import 'license_activation_screen.dart';

/// Post-auth gate: trial/expiry checks and forced update blocking.
class LicenseGate extends StatelessWidget {
  final Widget child;

  const LicenseGate({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Consumer<LicenseProvider>(
      builder: (context, license, _) {
        if (license.isLoading) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Validating license...'),
                ],
              ),
            ),
          );
        }

        if (license.forceUpdateRequired) {
          return _ForceUpdateScreen(manifest: license.updateManifest);
        }

        if (license.isExpired && license.license?.tier != LicenseTier.trial) {
          return const LicenseActivationScreen(
            message: 'Your subscription has expired. Enter a renewal key to continue.',
          );
        }

        if (license.isExpired && license.isTrial) {
          return LicenseActivationScreen(
            message: 'Your 14-day trial has ended. Activate a license to unlock Pro features.',
            allowBasicContinue: true,
            onContinueBasic: () => _continueBasic(context),
          );
        }

        return _TrialBannerWrapper(child: child);
      },
    );
  }

  void _continueBasic(BuildContext context) {
    // Trial expired — user opts into basic inventory-only mode.
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => child),
    );
  }
}

class _TrialBannerWrapper extends StatelessWidget {
  final Widget child;

  const _TrialBannerWrapper({required this.child});

  @override
  Widget build(BuildContext context) {
    return Consumer<LicenseProvider>(
      builder: (context, license, _) {
        if (!license.isTrial || license.isExpired) return child;

        return Column(
          children: [
            MaterialBanner(
              content: Text(
                'Trial: ${license.license?.daysRemaining ?? 0} days remaining • '
                '${license.license?.organizationName ?? ''}',
              ),
              leading: const Icon(Icons.schedule),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const LicenseActivationScreen()),
                    );
                  },
                  child: const Text('Activate'),
                ),
              ],
            ),
            Expanded(child: child),
          ],
        );
      },
    );
  }
}

class _ForceUpdateScreen extends StatelessWidget {
  final SecureUpdateManifest? manifest;

  const _ForceUpdateScreen({this.manifest});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.system_update, size: 56, color: Color(0xFF2563EB)),
                const SizedBox(height: 16),
                Text(
                  'Required Update',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Text(
                  'Version ${manifest?.minVersion ?? '?'} or later is required to continue.',
                  textAlign: TextAlign.center,
                ),
                if (manifest?.releaseNotes != null) ...[
                  const SizedBox(height: 16),
                  Text(manifest!.releaseNotes!, textAlign: TextAlign.center),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: manifest?.downloadUrl != null
                      ? () => launchUrl(Uri.parse(manifest!.downloadUrl!))
                      : null,
                  icon: const Icon(Icons.download),
                  label: const Text('Download Update'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
