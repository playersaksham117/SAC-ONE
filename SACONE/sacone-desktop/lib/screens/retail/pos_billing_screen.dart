import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../providers/inventory_provider.dart';
import '../../providers/warehouse_provider.dart';
import '../../providers/retail_providers.dart';

class PosBillingScreen extends StatefulWidget {
  const PosBillingScreen({super.key});

  @override
  State<PosBillingScreen> createState() => _PosBillingScreenState();
}

class _PosBillingScreenState extends State<PosBillingScreen> {
  final _barcodeFocus = FocusNode();
  final _barcodeController = TextEditingController();
  final _paidController = TextEditingController(text: '0');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final wh = context.read<WarehouseProvider>();
      await wh.loadWarehouses();
      if (wh.warehouses.isNotEmpty) {
        context.read<PosProvider>().setWarehouse(wh.warehouses.first.id);
      }
      context.read<CustomerProvider>().load();
    });
  }

  @override
  void dispose() {
    _barcodeFocus.dispose();
    _barcodeController.dispose();
    _paidController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Shortcuts(
      shortcuts: const {
        SingleActivator(LogicalKeyboardKey.f2): _ClearCartIntent(),
        SingleActivator(LogicalKeyboardKey.f4): _CheckoutIntent(),
        SingleActivator(LogicalKeyboardKey.f8): _FocusBarcodeIntent(),
      },
      child: Actions(
        actions: {
          _ClearCartIntent: CallbackAction<_ClearCartIntent>(
            onInvoke: (_) {
              context.read<PosProvider>().clearCart();
              return null;
            },
          ),
          _CheckoutIntent: CallbackAction<_CheckoutIntent>(
            onInvoke: (_) {
              _checkout(context);
              return null;
            },
          ),
          _FocusBarcodeIntent: CallbackAction<_FocusBarcodeIntent>(
            onInvoke: (_) {
              _barcodeFocus.requestFocus();
              return null;
            },
          ),
        },
        child: Focus(
          autofocus: true,
          child: Scaffold(
            backgroundColor: const Color(0xFFF8FAFC),
            body: Row(
              children: [
                Expanded(flex: 3, child: _buildCart(context)),
                Expanded(flex: 2, child: _buildCheckoutPanel(context)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCart(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: Row(
            children: [
              const Icon(Icons.point_of_sale, color: Color(0xFF2563EB)),
              const SizedBox(width: 8),
              const Text('POS Billing', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              Text('F2 Clear • F4 Pay • F8 Scan', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _barcodeController,
            focusNode: _barcodeFocus,
            decoration: InputDecoration(
              labelText: 'Scan barcode / SKU (Enter to add)',
              prefixIcon: const Icon(Icons.qr_code_scanner),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              filled: true,
              fillColor: Colors.white,
            ),
            onSubmitted: (v) => _scanBarcode(context, v),
          ),
        ),
        Expanded(
          child: Consumer<PosProvider>(
            builder: (context, pos, _) {
              if (pos.cart.isEmpty) {
                return const Center(child: Text('Scan or search items to begin billing'));
              }
              return ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: pos.cart.length,
                itemBuilder: (context, i) {
                  final item = pos.cart[i];
                  return Card(
                    child: ListTile(
                      title: Text(item.name),
                      subtitle: Text('${item.sku} • ₹${item.unitPrice} + ${item.taxRate}% GST'),
                      trailing: SizedBox(
                        width: 120,
                        child: Row(
                          children: [
                            IconButton(
                              icon: const Icon(Icons.remove),
                              onPressed: () => pos.updateQty(item.itemId, item.quantity - 1),
                            ),
                            Text('${item.quantity.toInt()}'),
                            IconButton(
                              icon: const Icon(Icons.add),
                              onPressed: () => pos.updateQty(item.itemId, item.quantity + 1),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCheckoutPanel(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(20),
      child: Consumer3<PosProvider, WarehouseProvider, CustomerProvider>(
        builder: (context, pos, wh, customers, _) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: pos.warehouseId,
                decoration: const InputDecoration(labelText: 'Warehouse'),
                items: wh.warehouses
                    .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                    .toList(),
                onChanged: pos.setWarehouse,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: pos.paymentMode,
                decoration: const InputDecoration(labelText: 'Payment Mode'),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('Cash')),
                  DropdownMenuItem(value: 'upi', child: Text('UPI')),
                  DropdownMenuItem(value: 'card', child: Text('Card')),
                  DropdownMenuItem(value: 'credit', child: Text('Credit')),
                  DropdownMenuItem(value: 'split', child: Text('Split')),
                ],
                onChanged: (v) => pos.setPaymentMode(v ?? 'cash'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: pos.selectedCustomer?.id,
                decoration: const InputDecoration(labelText: 'Customer (optional)'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Walk-in Customer')),
                  ...customers.customers.map(
                    (c) => DropdownMenuItem(value: c.id, child: Text('${c.name} (${c.phone ?? '-'})')),
                  ),
                ],
                onChanged: (id) {
                  pos.setCustomer(id == null ? null : customers.customers.firstWhere((c) => c.id == id));
                },
              ),
              const Divider(height: 32),
              TextField(
                decoration: const InputDecoration(labelText: 'Coupon code'),
                onChanged: pos.setCouponCode,
                onSubmitted: (_) => pos.recalculateOffers(),
              ),
              if (pos.appliedOffers.isNotEmpty) ...[
                const SizedBox(height: 8),
                ...pos.appliedOffers.map((o) => Text(o, style: const TextStyle(color: Color(0xFF10B981), fontSize: 12))),
              ],
              if (pos.offerDiscount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Offer discount: -₹${pos.offerDiscount.toStringAsFixed(2)}',
                      style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.w600)),
                ),
              _totalRow('Subtotal', pos.subtotal),
              _totalRow('GST', pos.taxTotal),
              _totalRow('Grand Total', pos.grandTotal, bold: true),
              const SizedBox(height: 12),
              TextField(
                controller: _paidController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Paid Amount'),
                onChanged: (_) => setState(() {}),
              ),
              if (pos.grandTotal - (double.tryParse(_paidController.text) ?? 0) > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Due: ₹${(pos.grandTotal - (double.tryParse(_paidController.text) ?? 0)).toStringAsFixed(2)}',
                    style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
                  ),
                ),
              const Spacer(),
              FilledButton.icon(
                onPressed: pos.cart.isEmpty ? null : () => _checkout(context),
                icon: const Icon(Icons.payment),
                label: const Text('Complete Sale (F4)'),
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
              ),
              OutlinedButton(
                onPressed: () => pos.clearCart(),
                child: const Text('Clear Cart (F2)'),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _totalRow(String label, double amount, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
          Text('₹${amount.toStringAsFixed(2)}', style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
        ],
      ),
    );
  }

  Future<void> _scanBarcode(BuildContext context, String code) async {
    if (code.trim().isEmpty) return;
    try {
      await context.read<PosProvider>().addByBarcode(code.trim());
      _barcodeController.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _checkout(BuildContext context) async {
    final pos = context.read<PosProvider>();
    final paid = double.tryParse(_paidController.text) ?? pos.grandTotal;
    try {
      final invoice = await pos.checkout(paidAmount: paid);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invoice ${invoice.invoiceNumber} saved — ₹${invoice.totalAmount.toStringAsFixed(2)}')),
      );
      _paidController.text = '0';
      context.read<InventoryProvider>().loadInventoryItems();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'), backgroundColor: Colors.red));
      }
    }
  }
}

class _ClearCartIntent extends Intent {
  const _ClearCartIntent();
}

class _CheckoutIntent extends Intent {
  const _CheckoutIntent();
}

class _FocusBarcodeIntent extends Intent {
  const _FocusBarcodeIntent();
}
