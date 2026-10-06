/**
 * Phase 6 POS sample scenarios:
 * 1. Cash sale
 * 2. Credit sale
 * 3. Split payment
 * 4. Hold bill (+ resume + checkout)
 * 5. Sales return
 *
 * Run: node scripts/test-pos-scenarios.js
 * Requires API on localhost:4000 and stock available.
 */
const base = process.env.API_URL || 'http://localhost:4000';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message || JSON.stringify(json)}`);
  }
  return json.data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureStock(token, productId, warehouseId, minQty = 20) {
  const stock = await req(`/api/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`, { token });
  const onHand = stock.items?.[0]?.quantityOnHand || 0;
  if (onHand >= minQty) return;
  await req('/api/inventory/movements', {
    method: 'POST',
    token,
    body: {
      productId,
      warehouseId,
      movementType: 'opening_stock',
      quantity: minQty,
      reason: 'POS scenario seed stock',
    },
  });
}

async function main() {
  console.log('=== POS Phase 6 scenario tests ===\n');

  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@sacone.local', password: 'Admin@123' },
  });
  const token = adminLogin.token;

  const bootstrap = await req('/api/pos/bootstrap', { token });
  const warehouseId = bootstrap.defaultWarehouse.id;
  const walkIn = bootstrap.walkInCustomer;
  assert(walkIn?.isWalkIn, 'Walk-in customer missing');

  const products = await req('/api/products?limit=5&isActive=1', { token });
  const p1 = products.items[0];
  const p2 = products.items[1] || products.items[0];
  await ensureStock(token, p1.id, warehouseId, 50);
  await ensureStock(token, p2.id, warehouseId, 50);
  // Discounts below the selling price need room: set a minimum selling price in Product Master.
  const p2Full = await req(`/api/products/${p2.id}`, { token });
  await req('/api/products/min-prices', { method: 'POST', token, body: { scope: 'product', targetId: p2.id, minPrice: Math.max(0, p2Full.sellingPrice - 10) } });

  // Credit customer
  let creditCustomer;
  try {
    const list = await req('/api/customers?search=Credit%20Test', { token });
    creditCustomer = list.items.find((c) => c.name === 'Credit Test Customer');
  } catch {
    creditCustomer = null;
  }
  if (!creditCustomer) {
    creditCustomer = await req('/api/customers', {
      method: 'POST',
      token,
      body: { name: 'Credit Test Customer', phone: '9999990001', creditLimit: 50000 },
    });
  }

  // 1. Cash sale
  console.log('1) Cash sale');
  const cashPreview = await req('/api/pos/preview', {
    method: 'POST',
    token,
    body: { customerId: walkIn.id, items: [{ productId: p1.id, quantity: 1 }] },
  });
  const cash = await req('/api/pos/checkout', {
    method: 'POST',
    token,
    body: {
      warehouseId,
      customerId: walkIn.id,
      items: [{ productId: p1.id, quantity: 1 }],
      payments: [{ method: 'cash', amount: cashPreview.grandTotal }],
    },
  });
  assert(cash.invoiceNumber, 'Cash invoice missing');
  assert(cash.paymentStatus === 'paid', 'Cash sale should be paid');
  assert(cash.items[0].movementId, 'POS sale movement missing');
  console.log(`   OK ${cash.invoiceNumber} total=${cash.grandTotal} movement=${cash.items[0].movementId}`);

  // 2. Credit sale
  console.log('2) Credit sale');
  const creditPreview = await req('/api/pos/preview', {
    method: 'POST',
    token,
    body: { customerId: creditCustomer.id, items: [{ productId: p1.id, quantity: 2 }] },
  });
  const before = (await req(`/api/customers/${creditCustomer.id}`, { token })).outstandingBalance;
  const credit = await req('/api/pos/checkout', {
    method: 'POST',
    token,
    body: {
      warehouseId,
      customerId: creditCustomer.id,
      items: [{ productId: p1.id, quantity: 2 }],
      payments: [{ method: 'credit', amount: creditPreview.grandTotal }],
    },
  });
  const after = (await req(`/api/customers/${creditCustomer.id}`, { token })).outstandingBalance;
  assert(credit.paymentStatus === 'credit', 'Expected credit payment status');
  assert(Math.abs((after - before) - credit.grandTotal) < 0.05, 'Outstanding not updated');
  console.log(`   OK ${credit.invoiceNumber} outstanding ${before} -> ${after}`);

  // 3. Split payment
  console.log('3) Split payment');
  const splitPreview = await req('/api/pos/preview', {
    method: 'POST',
    token,
    body: {
      customerId: creditCustomer.id,
      items: [{ productId: p2.id, quantity: 1 }],
      invoiceDiscount: 5,
    },
  });
  const half = Math.floor(splitPreview.grandTotal / 2);
  const rest = Number((splitPreview.grandTotal - half).toFixed(2));
  const split = await req('/api/pos/checkout', {
    method: 'POST',
    token,
    body: {
      warehouseId,
      customerId: creditCustomer.id,
      invoiceDiscount: 5,
      items: [{ productId: p2.id, quantity: 1 }],
      payments: [
        { method: 'cash', amount: half },
        { method: 'upi', amount: rest, reference: 'UPI-TEST-001' },
      ],
    },
  });
  assert(split.payments.length === 2, 'Expected 2 payment lines');
  assert(split.paymentStatus === 'paid', 'Split without credit should be paid');
  console.log(`   OK ${split.invoiceNumber} payments=${split.payments.map((p) => p.method).join('+')}`);

  // 4. Hold bill
  console.log('4) Hold bill');
  const held = await req('/api/pos/hold', {
    method: 'POST',
    token,
    body: {
      warehouseId,
      customerId: walkIn.id,
      items: [{ productId: p1.id, quantity: 1 }],
      notes: 'scenario hold',
    },
  });
  assert(held.status === 'held', 'Hold status');
  const resumed = await req(`/api/pos/held/${held.id}/resume`, { method: 'POST', token });
  assert(resumed.cart.length === 1, 'Resume cart');
  const holdPreview = await req('/api/pos/preview', {
    method: 'POST',
    token,
    body: { customerId: walkIn.id, items: resumed.cart },
  });
  const heldCheckout = await req('/api/pos/checkout', {
    method: 'POST',
    token,
    body: {
      warehouseId,
      customerId: walkIn.id,
      heldBillId: held.id,
      items: resumed.cart,
      payments: [{ method: 'bank', amount: holdPreview.grandTotal, reference: 'NEFT-1' }],
    },
  });
  const heldAfter = await req(`/api/pos/held`, { token });
  assert(!heldAfter.find((h) => h.id === held.id && h.status === 'held'), 'Held bill should be resumed');
  console.log(`   OK ${held.holdNumber} -> ${heldCheckout.invoiceNumber}`);

  // 5. Sales return
  console.log('5) Sales return');
  const stockBefore = await req(`/api/inventory/stock?productId=${p1.id}&warehouseId=${warehouseId}`, { token });
  const onHandBefore = stockBefore.items?.[0]?.quantityOnHand || 0;
  const ret = await req('/api/pos/returns', {
    method: 'POST',
    token,
    body: {
      saleId: cash.id,
      refundMethod: 'cash',
      items: [{ saleItemId: cash.items[0].id, quantity: 1 }],
      reason: 'scenario return',
    },
  });
  assert(ret.returnNumber, 'Return number missing');
  assert(ret.items[0].movementId, 'Sales return movement missing');
  const stockAfter = await req(`/api/inventory/stock?productId=${p1.id}&warehouseId=${warehouseId}`, { token });
  const onHandAfter = stockAfter.items?.[0]?.quantityOnHand || 0;
  assert(Math.abs(onHandAfter - onHandBefore - 1) < 0.001, 'Return did not restock via movement');
  const returnedSale = await req(`/api/pos/sales/${cash.id}`, { token });
  assert(returnedSale.status === 'returned' || returnedSale.status === 'partially_returned', 'Sale status not updated');
  console.log(`   OK ${ret.returnNumber} stock ${onHandBefore} -> ${onHandAfter}`);

  // Cashier restriction smoke check
  console.log('6) Cashier RBAC smoke');
  const cashierLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'cashier@sacone.local', password: 'Cashier@123' },
  });
  const cPerms = cashierLogin.permissions || [];
  assert(cPerms.includes('pos.terminal.view'), 'Cashier needs POS');
  assert(!cPerms.includes('inventory.adjustments.approve'), 'Cashier must not approve adjustments');
  assert(!cPerms.includes('reports.ceo_dashboard.view'), 'Cashier must not access CEO dashboard');
  assert(!cPerms.includes('core.users.view'), 'Cashier must not access administration users');
  assert(!cPerms.includes('core.system_settings.edit'), 'Cashier must not edit settings');
  console.log('   OK cashier permissions restricted');

  console.log('\nAll POS scenarios passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
