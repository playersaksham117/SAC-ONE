import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers/update_provider.dart';

/// Show update dialog
Future<void> showUpdateDialog(BuildContext context) async {
  await showDialog(
    context: context,
    barrierDismissible: false,
    builder: (context) => const UpdateDialog(),
  );
}

/// Update checker and installer dialog
class UpdateDialog extends StatefulWidget {
  const UpdateDialog({super.key});

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = Provider.of<UpdateProvider>(context, listen: false);
      if (provider.status == UpdateStatus.idle) {
        provider.checkForUpdates();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<UpdateProvider>(
      builder: (context, updateProvider, _) {
        return AlertDialog(
          title: Row(
            children: [
              Icon(
                _getStatusIcon(updateProvider.status),
                color: _getStatusColor(updateProvider.status),
              ),
              const SizedBox(width: 12),
              Text(_getTitle(updateProvider.status)),
            ],
          ),
          content: SizedBox(
            width: 500,
            child: _buildContent(context, updateProvider),
          ),
          actions: _buildActions(context, updateProvider),
        );
      },
    );
  }

  IconData _getStatusIcon(UpdateStatus status) {
    switch (status) {
      case UpdateStatus.checking:
        return Icons.sync;
      case UpdateStatus.available:
        return Icons.system_update;
      case UpdateStatus.downloading:
        return Icons.download;
      case UpdateStatus.readyToInstall:
        return Icons.check_circle;
      case UpdateStatus.installing:
        return Icons.install_desktop;
      case UpdateStatus.error:
        return Icons.error;
      case UpdateStatus.upToDate:
        return Icons.verified;
      default:
        return Icons.update;
    }
  }

  Color _getStatusColor(UpdateStatus status) {
    switch (status) {
      case UpdateStatus.available:
        return Colors.blue;
      case UpdateStatus.downloading:
        return Colors.orange;
      case UpdateStatus.readyToInstall:
        return Colors.green;
      case UpdateStatus.error:
        return Colors.red;
      case UpdateStatus.upToDate:
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  String _getTitle(UpdateStatus status) {
    switch (status) {
      case UpdateStatus.checking:
        return 'Checking for Updates...';
      case UpdateStatus.available:
        return 'Update Available!';
      case UpdateStatus.downloading:
        return 'Downloading Update...';
      case UpdateStatus.readyToInstall:
        return 'Ready to Install';
      case UpdateStatus.installing:
        return 'Installing...';
      case UpdateStatus.error:
        return 'Update Error';
      case UpdateStatus.upToDate:
        return 'You\'re Up to Date!';
      default:
        return 'Software Update';
    }
  }

  Widget _buildContent(BuildContext context, UpdateProvider provider) {
    switch (provider.status) {
      case UpdateStatus.checking:
        return _buildCheckingContent();
      case UpdateStatus.available:
        return _buildAvailableContent(provider);
      case UpdateStatus.downloading:
        return _buildDownloadingContent(provider);
      case UpdateStatus.readyToInstall:
        return _buildReadyContent(provider);
      case UpdateStatus.installing:
        return _buildInstallingContent();
      case UpdateStatus.error:
        return _buildErrorContent(provider);
      case UpdateStatus.upToDate:
        return _buildUpToDateContent(provider);
      default:
        return _buildIdleContent(provider);
    }
  }

  Widget _buildCheckingContent() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        const CircularProgressIndicator(),
        const SizedBox(height: 20),
        Text('Checking GitHub for new releases...', style: TextStyle(color: Colors.grey.shade600)),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _buildAvailableContent(UpdateProvider provider) {
    final release = provider.availableUpdate!;
    final asset = release.windowsAsset;
    
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Current Version', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    Text(provider.currentVersion, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward, color: Colors.blue),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('New Version', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    Text(release.tagName, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.green.shade700)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Icon(Icons.calendar_today, size: 16, color: Colors.grey.shade600),
            const SizedBox(width: 8),
            Text('Released: ${DateFormat('MMM dd, yyyy').format(release.publishedAt)}', style: TextStyle(color: Colors.grey.shade600)),
            if (asset != null) ...[
              const SizedBox(width: 24),
              Icon(Icons.file_download, size: 16, color: Colors.grey.shade600),
              const SizedBox(width: 8),
              Text('Size: ${asset.formattedSize}', style: TextStyle(color: Colors.grey.shade600)),
            ],
          ],
        ),
        const SizedBox(height: 16),
        const Text('What\'s New:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 8),
        Container(
          constraints: const BoxConstraints(maxHeight: 200),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
          child: SingleChildScrollView(
            child: Text(release.body.isNotEmpty ? release.body : 'No release notes provided.', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
          ),
        ),
        if (asset == null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.orange.shade200)),
            child: Row(
              children: [
                Icon(Icons.warning_amber, color: Colors.orange.shade700),
                const SizedBox(width: 12),
                Expanded(child: Text('No Windows installer found. You can download manually from GitHub.', style: TextStyle(color: Colors.orange.shade700))),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildDownloadingContent(UpdateProvider provider) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        LinearProgressIndicator(value: provider.downloadProgress, backgroundColor: Colors.grey.shade200, valueColor: const AlwaysStoppedAnimation<Color>(Colors.blue)),
        const SizedBox(height: 16),
        Text('${(provider.downloadProgress * 100).toStringAsFixed(1)}%', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(provider.downloadProgressText, style: TextStyle(color: Colors.grey.shade600)),
        const SizedBox(height: 20),
        Text('Please wait while the update is being downloaded...', style: TextStyle(color: Colors.grey.shade600, fontSize: 13), textAlign: TextAlign.center),
      ],
    );
  }

  Widget _buildReadyContent(UpdateProvider provider) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        Icon(Icons.check_circle, size: 64, color: Colors.green.shade600),
        const SizedBox(height: 16),
        const Text('Download Complete!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text('The update is ready to install. Click "Install Now" to update TracInvent.\n\nThe application will close and restart automatically.', style: TextStyle(color: Colors.grey.shade600), textAlign: TextAlign.center),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.amber.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.amber.shade200)),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.amber.shade700),
              const SizedBox(width: 12),
              Expanded(child: Text('Save any unsaved work before installing.', style: TextStyle(color: Colors.amber.shade800, fontSize: 13))),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInstallingContent() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        const CircularProgressIndicator(),
        const SizedBox(height: 20),
        const Text('Installing Update...', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text('Please wait, the application will restart shortly.', style: TextStyle(color: Colors.grey.shade600)),
      ],
    );
  }

  Widget _buildErrorContent(UpdateProvider provider) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        Icon(Icons.error_outline, size: 64, color: Colors.red.shade400),
        const SizedBox(height: 16),
        Text(provider.errorMessage ?? 'An unknown error occurred', style: TextStyle(color: Colors.red.shade700), textAlign: TextAlign.center),
        const SizedBox(height: 20),
        Text('You can try again or download the update manually from GitHub.', style: TextStyle(color: Colors.grey.shade600, fontSize: 13), textAlign: TextAlign.center),
      ],
    );
  }

  Widget _buildUpToDateContent(UpdateProvider provider) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        Icon(Icons.verified, size: 64, color: Colors.green.shade600),
        const SizedBox(height: 16),
        const Text('TracInvent is up to date!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text('Current Version: ${provider.currentVersion}', style: TextStyle(color: Colors.grey.shade600)),
        if (provider.lastChecked != null) ...[
          const SizedBox(height: 8),
          Text('Last checked: ${DateFormat('MMM dd, yyyy HH:mm').format(provider.lastChecked!)}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
        ],
      ],
    );
  }

  Widget _buildIdleContent(UpdateProvider provider) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 20),
        Icon(Icons.update, size: 64, color: Colors.blue.shade400),
        const SizedBox(height: 16),
        Text('Current Version: ${provider.currentVersion}', style: const TextStyle(fontSize: 16)),
        const SizedBox(height: 12),
        Text('Click "Check for Updates" to see if a new version is available.', style: TextStyle(color: Colors.grey.shade600), textAlign: TextAlign.center),
      ],
    );
  }

  Future<void> _openGitHub(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  List<Widget> _buildActions(BuildContext context, UpdateProvider provider) {
    final actions = <Widget>[];

    switch (provider.status) {
      case UpdateStatus.checking:
      case UpdateStatus.installing:
        break;
      case UpdateStatus.downloading:
        actions.add(TextButton(onPressed: () { provider.reset(); Navigator.pop(context); }, child: const Text('Cancel')));
        break;
      case UpdateStatus.available:
        actions.addAll([
          TextButton(onPressed: () { provider.dismissUpdate(); Navigator.pop(context); }, child: const Text('Later')),
          if (provider.availableUpdate?.htmlUrl != null)
            TextButton(onPressed: () => _openGitHub(provider.availableUpdate!.htmlUrl), child: const Text('View on GitHub')),
          if (provider.availableUpdate?.windowsAsset != null)
            ElevatedButton.icon(onPressed: () => provider.downloadUpdate(), icon: const Icon(Icons.download), label: const Text('Download Update'), style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, foregroundColor: Colors.white))
          else
            ElevatedButton.icon(onPressed: () => _openGitHub(provider.availableUpdate!.htmlUrl), icon: const Icon(Icons.open_in_new), label: const Text('Download from GitHub')),
        ]);
        break;
      case UpdateStatus.readyToInstall:
        actions.addAll([
          TextButton(onPressed: () { provider.reset(); Navigator.pop(context); }, child: const Text('Install Later')),
          ElevatedButton.icon(onPressed: () => provider.installUpdate(), icon: const Icon(Icons.install_desktop), label: const Text('Install Now'), style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white)),
        ]);
        break;
      case UpdateStatus.error:
        actions.addAll([
          TextButton(onPressed: () { provider.reset(); Navigator.pop(context); }, child: const Text('Close')),
          ElevatedButton(onPressed: () => provider.forceCheck(), child: const Text('Try Again')),
        ]);
        break;
      default:
        actions.addAll([
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
          if (provider.status == UpdateStatus.idle) ElevatedButton(onPressed: () => provider.checkForUpdates(), child: const Text('Check for Updates')),
        ]);
        break;
    }
    return actions;
  }
}

/// Compact update banner widget
class UpdateBanner extends StatelessWidget {
  const UpdateBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<UpdateProvider>(
      builder: (context, provider, _) {
        if (!provider.hasUpdate) return const SizedBox.shrink();
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [Colors.blue.shade600, Colors.blue.shade800]),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [BoxShadow(color: Colors.blue.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 4))],
          ),
          child: Row(
            children: [
              const Icon(Icons.system_update, color: Colors.white, size: 32),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Update Available!', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    Text('Version ${provider.availableUpdate!.tagName} is ready to download', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
                  ],
                ),
              ),
              ElevatedButton(onPressed: () => showUpdateDialog(context), style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.blue.shade700), child: const Text('Update')),
            ],
          ),
        );
      },
    );
  }
}
