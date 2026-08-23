import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../../models/inventory_item.dart';
import '../../models/retail_models.dart';
import '../../providers/inventory_provider.dart';
import '../../providers/warehouse_provider.dart';
import '../../providers/retail_providers.dart';

class PurchaseOrdersScreen extends StatefulWidget {
  const PurchaseOrdersScreen({super.key});

  @override
  State<PurchaseOrdersScreen> createState() => _PurchaseOrdersScreenState();
}

class _PurchaseOrdersScreenState extends State<PurchaseOrdersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PurchaseProvider>().load();
      context.read<SupplierProvider>().load();
      context.read<WarehouseProvider>().loadWarehouses();
      context.read<InventoryProvider>().loadInventoryItems();
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
            child: Row(
              children: [
                const Icon(Icons.receipt_long, color: Color(0xFF7C3AED)),
                const SizedBox(width: 12),
                const Text('Purchase Orders', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const Spacer(),
                FilledButton.icon(
                  onPressed: () => _createPO(context),
                  icon: const Icon(Icons.add),
                  label: const Text('New PO'),
                ),
              ],
            ),
          ),
          Expanded(
            child: Consumer<PurchaseProvider>(
              builder: (context, provider, _) {
                if (provider.isLoading) return const Center(child: CircularProgressIndicator());
                return ListView.builder(
                  padding: const EdgeInsets.all(24),
                  itemCount: provider.orders.length,
                  itemBuilder: (context, i) {
                    final po = provider.orders[i];
                    return Card(
                      child: ListTile(
                        title: Text('${po.poNumber} — ${po.supplierName}'),
                        subtitle: Text(
                          '${po.status.toUpperCase()} • ${po.orderDate.toString().substring(0, 10)} • ${po.lines.length} items',
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('₹${po.totalAmount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                            if (po.status != 'received')
                              TextButton(onPressed: () => _receivePO(context, po), child: const Text('Receive')),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _createPO(BuildContext context) async {
    final suppliers = context.read<SupplierProvider>().suppliers;
    final warehouses = context.read<WarehouseProvider>().warehouses;
    final items = context.read<InventoryProvider>().items;
    if (suppliers.isEmpty || warehouses.isEmpty || items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add suppliers, warehouses, and inventory items first')),
      );
      return;
    }

    String? supplierId = suppliers.first.id;
    String? warehouseId = warehouses.first.id;
    InventoryItem selectedItem = items.first;
    final qtyController = TextEditingController(text: '1');
    final costController = TextEditingController(text: selectedItem.costPrice.toString());

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Create Purchase Order'),
          content: SizedBox(
            width: 480,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: supplierId,
                  decoration: const InputDecoration(labelText: 'Supplier'),
                  items: suppliers.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))).toList(),
                  onChanged: (v) => setState(() => supplierId = v),
                ),
                DropdownButtonFormField<String>(
                  initialValue: warehouseId,
                  decoration: const InputDecoration(labelText: 'Warehouse'),
                  items: warehouses.map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))).toList(),
                  onChanged: (v) => setState(() => warehouseId = v),
                ),
                DropdownButtonFormField<String>(
                  initialValue: selectedItem.id,
                  decoration: const InputDecoration(labelText: 'Product'),
                  items: items.map((i) => DropdownMenuItem(value: i.id, child: Text(i.name))).toList(),
                  onChanged: (v) => setState(() {
                    selectedItem = items.firstWhere((i) => i.id == v);
                    costController.text = selectedItem.costPrice.toString();
                  }),
                ),
                TextField(controller: qtyController, decoration: const InputDecoration(labelText: 'Qty'), keyboardType: TextInputType.number),
                TextField(controller: costController, decoration: const InputDecoration(labelText: 'Unit Cost'), keyboardType: TextInputType.number),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                final supplier = suppliers.firstWhere((s) => s.id == supplierId);
                final qty = double.tryParse(qtyController.text) ?? 1;
                final cost = double.tryParse(costController.text) ?? 0;
                const taxRate = 0.0;
                final lineTotal = qty * cost;
                final line = PurchaseOrderLine(
                  id: const Uuid().v4(),
                  purchaseOrderId: '',
                  itemId: selectedItem.id,
                  itemName: selectedItem.name,
                  sku: selectedItem.sku,
                  orderedQty: qty,
                  unitCost: cost,
                  taxRate: taxRate,
                  taxAmount: lineTotal * taxRate / 100,
                  lineTotal: lineTotal + (lineTotal * taxRate / 100),
                );
                await context.read<PurchaseProvider>().createOrder(
                  supplierId: supplier.id,
                  supplierName: supplier.name,
                  warehouseId: warehouseId!,
                  lines: [line],
                );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _receivePO(BuildContext context, PurchaseOrder po) async {
    final qtyMap = <String, double>{};
    for (final line in po.lines) {
      qtyMap[line.id] = line.pendingQty;
    }
    try {
      await context.read<PurchaseProvider>().receiveOrder(po.id, qtyMap);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Stock received successfully')));
        context.read<InventoryProvider>().loadInventoryItems();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'), backgroundColor: Colors.red));
      }
    }
  }
}
