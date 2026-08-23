import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/retail_providers.dart';

class LedgerScreen extends StatefulWidget {
  const LedgerScreen({super.key});

  @override
  State<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends State<LedgerScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<LedgerProvider>().loadDues();
      context.read<CustomerProvider>().load();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
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
                    Icon(Icons.account_balance_wallet, color: Color(0xFFEA580C)),
                    SizedBox(width: 12),
                    Text('Credit & Ledger', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  ],
                ),
                TabBar(
                  controller: _tabs,
                  tabs: const [
                    Tab(text: 'Customer Dues'),
                    Tab(text: 'Supplier Dues'),
                    Tab(text: 'Payment'),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _duesList(context, isCustomer: true),
                _duesList(context, isCustomer: false),
                _paymentTab(context),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _duesList(BuildContext context, {required bool isCustomer}) {
    return Consumer<LedgerProvider>(
      builder: (context, ledger, _) {
        final rows = isCustomer ? ledger.customerDues : ledger.supplierDues;
        if (rows.isEmpty) return const Center(child: Text('No outstanding dues'));
        return ListView.builder(
          padding: const EdgeInsets.all(24),
          itemCount: rows.length,
          itemBuilder: (context, i) {
            final r = rows[i];
            return Card(
              child: ListTile(
                title: Text(r['name'] as String),
                subtitle: Text('${r['code']} • ${r['phone'] ?? '-'}'),
                trailing: Text(
                  '₹${(r['outstandingBalance'] as num).toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                onTap: isCustomer ? () => _showLedger(context, r['id'] as String, r['name'] as String) : null,
              ),
            );
          },
        );
      },
    );
  }

  Widget _paymentTab(BuildContext context) {
    return Consumer<CustomerProvider>(
      builder: (context, customers, _) {
        String? customerId;
        final amount = TextEditingController();
        String mode = 'cash';

        return Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Record Customer Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 16),
                  StatefulBuilder(
                    builder: (ctx, setState) => Column(
                      children: [
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(labelText: 'Customer'),
                          items: customers.customers
                              .map((c) => DropdownMenuItem(value: c.id, child: Text('${c.name} (Due: ₹${c.outstandingBalance.toStringAsFixed(0)})')))
                              .toList(),
                          onChanged: (v) => setState(() => customerId = v),
                        ),
                        const SizedBox(height: 12),
                        TextField(controller: amount, decoration: const InputDecoration(labelText: 'Amount'), keyboardType: TextInputType.number),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: mode,
                          decoration: const InputDecoration(labelText: 'Payment Mode'),
                          items: const [
                            DropdownMenuItem(value: 'cash', child: Text('Cash')),
                            DropdownMenuItem(value: 'upi', child: Text('UPI')),
                            DropdownMenuItem(value: 'card', child: Text('Card')),
                          ],
                          onChanged: (v) => setState(() => mode = v ?? 'cash'),
                        ),
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: customerId == null
                              ? null
                              : () async {
                                  final amt = double.tryParse(amount.text) ?? 0;
                                  if (amt <= 0) return;
                                  await context.read<LedgerProvider>().recordPayment(customerId!, amt, mode);
                                  amount.clear();
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment recorded')));
                                    context.read<CustomerProvider>().load();
                                  }
                                },
                          child: const Text('Save Payment'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _showLedger(BuildContext context, String customerId, String name) async {
    await context.read<LedgerProvider>().loadCustomerLedger(customerId);
    if (!context.mounted) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Ledger — $name'),
        content: SizedBox(
          width: 560,
          height: 400,
          child: Consumer<LedgerProvider>(
            builder: (context, ledger, _) {
              return ListView.builder(
                itemCount: ledger.entries.length,
                itemBuilder: (context, i) {
                  final e = ledger.entries[i];
                  return ListTile(
                    dense: true,
                    title: Text('${e.entryType.toUpperCase()} ${e.referenceNumber ?? ''}'),
                    subtitle: Text(e.entryDate.toString().substring(0, 16)),
                    trailing: Text('Bal: ₹${e.balanceAfter.toStringAsFixed(2)}'),
                  );
                },
              );
            },
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
      ),
    );
  }
}
