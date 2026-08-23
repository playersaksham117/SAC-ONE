import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/phase2_providers.dart';
import '../../providers/warehouse_provider.dart';

class AdvancedRetailHubScreen extends StatefulWidget {
  const AdvancedRetailHubScreen({super.key});

  @override
  State<AdvancedRetailHubScreen> createState() => _AdvancedRetailHubScreenState();
}

class _AdvancedRetailHubScreenState extends State<AdvancedRetailHubScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 6, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<Phase2Provider>();
      p.loadExpiryDashboard();
      p.loadAnalytics();
      p.loadOffers();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.auto_awesome, color: Color(0xFF7C3AED)),
                    SizedBox(width: 12),
                    Text('Advanced Retail', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  ],
                ),
                TabBar(
                  controller: _tabs,
                  isScrollable: true,
                  tabs: const [
                    Tab(text: 'Serial & Warranty'),
                    Tab(text: 'Pricing & Offers'),
                    Tab(text: 'Loyalty'),
                    Tab(text: 'Expiry'),
                    Tab(text: 'Dead Stock'),
                    Tab(text: 'Warehouse'),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _serialWarrantyTab(),
                _pricingOffersTab(),
                _loyaltyTab(),
                _expiryTab(),
                _deadStockTab(),
                _warehouseTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _serialWarrantyTab() {
    return Consumer<Phase2Provider>(
      builder: (context, p, _) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: const InputDecoration(
                      labelText: 'Serial / IMEI / SKU lookup',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (q) {
                      p.searchSerial(q);
                      p.lookupWarranty(q);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: () {
                    p.searchSerial(_searchController.text);
                    p.lookupWarranty(_searchController.text);
                  },
                  child: const Text('Search'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Row(
                children: [
                  Expanded(child: _listCard('Serial Numbers', p.serialResults, (r) =>
                      '${r['serialNumber']} • ${r['itemName']} • ${r['status']}')),
                  const SizedBox(width: 16),
                  Expanded(child: _listCard('Warranties', p.warrantyResults, (r) =>
                      '${r['itemName']} • ends ${(r['endDate'] as String).substring(0, 10)} • ${r['computedStatus'] ?? r['status']}')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pricingOffersTab() {
    return Consumer<Phase2Provider>(
      builder: (context, p, _) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('Multi-tier pricing: retail, wholesale, contractor, bulk',
              style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Configured via PricingEngine — POS auto-resolves price by customer tier and quantity.',
              style: TextStyle(color: Colors.grey.shade600)),
          const SizedBox(height: 24),
          const Text('Active Offers', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ...p.activeOffers.map((o) => Card(
                child: ListTile(
                  title: Text(o['name'] as String),
                  subtitle: Text('${o['offerType']} • priority ${o['priority']}'),
                ),
              )),
          if (p.activeOffers.isEmpty) const Text('No active offers — create via OfferEngine.createOffer()'),
        ],
      ),
    );
  }

  Widget _loyaltyTab() {
    return const Padding(
      padding: EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Loyalty Program', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          SizedBox(height: 12),
          Text('• 1 point earned per ₹100 purchase'),
          Text('• Auto-earn on POS checkout when customer selected'),
          Text('• Tiers: standard → silver (1000) → gold (5000) → platinum (10000)'),
          Text('• Redeem via LoyaltyService.redeemPoints() at checkout (Phase 2+)'),
        ],
      ),
    );
  }

  Widget _expiryTab() {
    return Consumer<Phase2Provider>(
      builder: (context, p, _) {
        final s = p.expirySummary;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                _metricCard('Expired', s['expired']),
                _metricCard('≤ 7 days', s['within7Days']),
                _metricCard('8–30 days', s['within30Days']),
              ],
            ),
            const SizedBox(height: 24),
            const Text('Near Expiry (FEFO priority)', style: TextStyle(fontWeight: FontWeight.w600)),
            ...p.nearExpiry.take(20).map((r) => ListTile(
                  title: Text('${r['name']} (${r['sku']})'),
                  subtitle: Text('Qty ${r['quantity']} • expires ${(r['expiryDate'] as String).substring(0, 10)}'),
                  trailing: Text('${r['daysLeft']}d'),
                )),
          ],
        );
      },
    );
  }

  Widget _deadStockTab() {
    return Consumer<Phase2Provider>(
      builder: (context, p, _) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Wrap(
            spacing: 12,
            children: p.agingBuckets
                .map((b) => Chip(label: Text('${b['bucket']} days: ${b['count']} items')))
                .toList(),
          ),
          const SizedBox(height: 16),
          ...p.deadStock.map((r) => Card(
                child: ListTile(
                  title: Text(r['name'] as String),
                  subtitle: Text('SKU ${r['sku']} • Qty ${r['onHand']}'),
                  trailing: Text('₹${(r['tiedUpValue'] as num).toStringAsFixed(0)}'),
                ),
              )),
        ],
      ),
    );
  }

  Widget _warehouseTab() {
    return Consumer2<Phase2Provider, WarehouseProvider>(
      builder: (context, p, wh, _) {
        final warehouseId = wh.warehouses.isNotEmpty ? wh.warehouses.first.id : null;
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Warehouse Optimization', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: warehouseId == null ? null : () => p.optimizeWarehouse(warehouseId),
                icon: const Icon(Icons.trending_up),
                label: const Text('Recalculate velocity & pick priority'),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: ListView(
                  children: p.pickPath
                      .map((r) => ListTile(
                            title: Text('Priority ${r['pickingPriority']} • score ${r['velocityScore']}'),
                            subtitle: Text('Fast zone: ${r['isFastMovingZone'] == 1 ? 'Yes' : 'No'}'),
                          ))
                      .toList(),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _listCard(String title, List<Map<String, dynamic>> rows, String Function(Map<String, dynamic>) fmt) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: rows.isEmpty
                ? const Center(child: Text('No results'))
                : ListView.builder(
                    itemCount: rows.length,
                    itemBuilder: (_, i) => ListTile(dense: true, title: Text(fmt(rows[i]))),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _metricCard(String label, dynamic data) {
    final map = data as Map<String, dynamic>? ?? {};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade600)),
            Text('${map['c'] ?? 0} batches', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            Text('Qty ${map['qty'] ?? 0}'),
          ],
        ),
      ),
    );
  }
}
