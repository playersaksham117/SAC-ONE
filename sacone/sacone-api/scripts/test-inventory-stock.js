/**
 * Phase 4 stock calculation test:
 * Opening +100, POS Sale -5, Return +2, Adjustment -3 (approve) => 94
 */

async function request(base, path, { method = 'GET', token, body } = {}) {
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
    throw new Error(json?.error?.message || `${method} ${path} failed (${res.status})`);
  }
  return json.data;
}

async function main() {
  const base = process.env.API_URL || 'http://localhost:4000';

  const login = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@sacone.local', password: 'Admin@123' },
  });
  const token = login.token;

  const products = await request(base, '/api/products?search=Mineral%20Water&limit=5', { token });
  const product = products.items[0];
  if (!product) throw new Error('Sample product Mineral Water not found');

  const warehouses = await request(base, '/api/inventory/warehouses', { token });
  const warehouse = warehouses.find((w) => w.isDefault) || warehouses[0];
  if (!warehouse) throw new Error('No warehouse found');

  const existing = await request(base, `/api/inventory/stock/product/${product.id}?warehouseId=${warehouse.id}`, { token });
  console.log('Product:', product.sku, product.name);
  console.log('Warehouse:', warehouse.code, warehouse.name);
  console.log('Stock before test:', existing.totals);

  const step = async (label, body) => {
    const result = await request(base, '/api/inventory/movements', {
      method: 'POST',
      token,
      body: {
        productId: product.id,
        warehouseId: warehouse.id,
        ...body,
      },
    });
    console.log(label, {
      status: result.movement.status,
      in: result.movement.quantityIn,
      out: result.movement.quantityOut,
      available: result.stock?.quantityAvailable,
    });
    return result;
  };

  await step('1) Opening Stock +100', {
    movementType: 'opening_stock',
    quantity: 100,
    reason: 'Phase 4 test opening',
  });

  await step('2) POS Sale -5', {
    movementType: 'pos_sale',
    quantity: 5,
    reason: 'Phase 4 test sale',
    referenceType: 'pos_sale',
  });

  await step('3) Sales Return +2', {
    movementType: 'sales_return',
    quantity: 2,
    reason: 'Phase 4 test return',
  });

  const adjustment = await step('4) Adjustment Decrease -3 (pending)', {
    movementType: 'adjustment_decrease',
    quantity: 3,
    reason: 'Phase 4 test adjustment',
  });

  if (adjustment.movement.status !== 'pending') {
    throw new Error('Expected adjustment to be pending approval');
  }

  const mid = await request(base, `/api/inventory/stock/product/${product.id}?warehouseId=${warehouse.id}`, { token });
  console.log('Stock after pending adjustment (should still exclude -3):', mid.totals.available);

  const approved = await request(base, `/api/inventory/adjustments/${adjustment.movement.id}/approve`, {
    method: 'POST',
    token,
  });
  console.log('5) Adjustment approved. Available:', approved.stock.quantityAvailable);

  const finalStock = await request(base, `/api/inventory/stock/product/${product.id}?warehouseId=${warehouse.id}`, { token });
  const available = finalStock.totals.available;
  console.log('Final stock:', available);

  const recomputed = await request(base, '/api/inventory/stock/recompute', {
    method: 'POST',
    token,
    body: { productId: product.id, warehouseId: warehouse.id },
  });
  console.log('Recomputed from ledger:', recomputed.quantityAvailable);

  const expected = Number(existing.totals.available || 0) + 100 - 5 + 2 - 3;
  if (available !== expected || recomputed.quantityAvailable !== expected) {
    throw new Error(`Expected ${expected}, got available=${available}, recomputed=${recomputed.quantityAvailable}`);
  }

  if (expected === 94) {
    console.log('PASS: Opening 100 - Sale 5 + Return 2 - Adjustment 3 = 94');
  } else {
    console.log(`PASS: Net +94 applied correctly. Final stock = ${available} (started at ${existing.totals.available})`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
