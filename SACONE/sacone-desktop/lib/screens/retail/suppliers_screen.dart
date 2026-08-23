import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/retail_models.dart';
import '../../providers/retail_providers.dart';

class SuppliersScreen extends StatefulWidget {
  const SuppliersScreen({super.key});

  @override
  State<SuppliersScreen> createState() => _SuppliersScreenState();
}

class _SuppliersScreenState extends State<SuppliersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SupplierProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _header(context),
          Expanded(
            child: Consumer<SupplierProvider>(
              builder: (context, provider, _) {
                if (provider.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (provider.suppliers.isEmpty) {
                  return const Center(child: Text('No suppliers yet'));
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(24),
                  itemCount: provider.suppliers.length,
                  itemBuilder: (context, i) {
                    final s = provider.suppliers[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(
                          '${s.code} • ${s.phone ?? '-'} • GST: ${s.gstin ?? '-'}',
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'Due: ₹${s.creditBalance.toStringAsFixed(2)}',
                              style: TextStyle(
                                color: s.creditBalance > 0 ? Colors.red : Colors.green,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text('Limit: ₹${s.creditLimit.toStringAsFixed(0)}'),
                          ],
                        ),
                        onTap: () => _showForm(context, supplier: s),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showForm(context),
        icon: const Icon(Icons.add),
        label: const Text('Add Supplier'),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_shipping, color: Color(0xFF2563EB)),
          const SizedBox(width: 12),
          const Text('Supplier Management', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<SupplierProvider>().load(),
          ),
        ],
      ),
    );
  }

  Future<void> _showForm(BuildContext context, {Supplier? supplier}) async {
    final name = TextEditingController(text: supplier?.name ?? '');
    final contact = TextEditingController(text: supplier?.contactPerson ?? '');
    final phone = TextEditingController(text: supplier?.phone ?? '');
    final email = TextEditingController(text: supplier?.email ?? '');
    final gstin = TextEditingController(text: supplier?.gstin ?? '');
    final address = TextEditingController(text: supplier?.address ?? '');
    final limit = TextEditingController(text: supplier?.creditLimit.toString() ?? '0');

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(supplier == null ? 'Add Supplier' : 'Edit Supplier'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name *')),
                TextField(controller: contact, decoration: const InputDecoration(labelText: 'Contact Person')),
                TextField(controller: phone, decoration: const InputDecoration(labelText: 'Phone')),
                TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
                TextField(controller: gstin, decoration: const InputDecoration(labelText: 'GSTIN')),
                TextField(controller: address, decoration: const InputDecoration(labelText: 'Address')),
                TextField(controller: limit, decoration: const InputDecoration(labelText: 'Credit Limit'), keyboardType: TextInputType.number),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              final ok = await context.read<SupplierProvider>().save(
                id: supplier?.id,
                name: name.text.trim(),
                contactPerson: contact.text.trim(),
                phone: phone.text.trim(),
                email: email.text.trim(),
                address: address.text.trim(),
                gstin: gstin.text.trim(),
                creditLimit: double.tryParse(limit.text) ?? 0,
              );
              if (ctx.mounted && ok) Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
