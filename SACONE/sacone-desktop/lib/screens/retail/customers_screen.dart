import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/retail_models.dart';
import '../../providers/retail_providers.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CustomerProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
            ),
            child: const Row(
              children: [
                Icon(Icons.people, color: Color(0xFF10B981)),
                SizedBox(width: 12),
                Text('Customer Management', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Expanded(
            child: Consumer<CustomerProvider>(
              builder: (context, provider, _) {
                if (provider.isLoading) return const Center(child: CircularProgressIndicator());
                return ListView.builder(
                  padding: const EdgeInsets.all(24),
                  itemCount: provider.customers.length,
                  itemBuilder: (context, i) {
                    final c = provider.customers[i];
                    return Card(
                      child: ListTile(
                        title: Text(c.name),
                        subtitle: Text('${c.code} • ${c.phone ?? '-'} • ${c.customerType}'),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('Due: ₹${c.outstandingBalance.toStringAsFixed(2)}',
                                style: TextStyle(color: c.outstandingBalance > 0 ? Colors.red : Colors.green)),
                            Text('Purchases: ₹${c.totalPurchases.toStringAsFixed(0)}'),
                          ],
                        ),
                        onTap: () => _showForm(context, customer: c),
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
        icon: const Icon(Icons.person_add),
        label: const Text('Add Customer'),
      ),
    );
  }

  Future<void> _showForm(BuildContext context, {Customer? customer}) async {
    final name = TextEditingController(text: customer?.name ?? '');
    final phone = TextEditingController(text: customer?.phone ?? '');
    final email = TextEditingController(text: customer?.email ?? '');
    final gstin = TextEditingController(text: customer?.gstin ?? '');
    String customerType = customer?.customerType ?? 'retail';

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(customer == null ? 'Add Customer' : 'Edit Customer'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name *')),
                TextField(controller: phone, decoration: const InputDecoration(labelText: 'Mobile *')),
                TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
                TextField(controller: gstin, decoration: const InputDecoration(labelText: 'GSTIN')),
                DropdownButtonFormField<String>(
                  initialValue: customerType,
                  items: const [
                    DropdownMenuItem(value: 'retail', child: Text('Retail')),
                    DropdownMenuItem(value: 'wholesale', child: Text('Wholesale')),
                    DropdownMenuItem(value: 'b2b', child: Text('B2B')),
                  ],
                  onChanged: (v) => setState(() => customerType = v ?? 'retail'),
                  decoration: const InputDecoration(labelText: 'Customer Type'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                await context.read<CustomerProvider>().save(
                  id: customer?.id,
                  name: name.text.trim(),
                  phone: phone.text.trim(),
                  email: email.text.trim(),
                  gstin: gstin.text.trim(),
                  customerType: customerType,
                );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
