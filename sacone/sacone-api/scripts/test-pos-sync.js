/**
 * End-to-end POS device sync scenarios (BillEase POS ↔ SACONE).
 *
 * Usage:
 *   npm run db:setup           (with SEED_DEMO_DATA=true for sample products)
 *   npm run dev                (API on :4000)
 *   node scripts/test-pos-sync.js [baseUrl]
 */
import { createHash } from 'crypto';

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@sacone.local', password: process.env.ADMIN_PASSWORD || 'Admin@123' };

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ✔ ${label}`); }
  else { failed += 1; console.log(`  ✘ ${label} ${detail}`); }
}

async function call(path, { method = 'GET', body, token, key, deviceId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-API-Key'] = key;
  if (deviceId) headers['X-Device-Id'] = deviceId;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function main() {
  console.log(`POS sync scenarios against ${BASE}\n`);
  const run = Date.now().toString(36).toUpperCase();

  const login = await call('/api/auth/login', { method: 'POST', body: ADMIN });
  if (!login.ok) throw new Error(`Admin login failed: ${login.error?.message}`);
  const token = login.data.token;

  // Product + opening stock
  const products = await call('/api/products?limit=5&isActive=1', { token });
  const product = products.data?.items?.[0];
  if (!product) throw new Error('Need at least one product (run db:setup with SEED_DEMO_DATA=true)');
  const whs = await call('/api/warehouses', { token });
  const whList = Array.isArray(whs.data) ? whs.data : (whs.data?.items || []);
  const warehouse = whList.find((w) => w.isDefault) || whList[0];
  await call('/api/inventory/movements/opening-stock', {
    method: 'POST', token,
    body: { productId: product.id, warehouseId: warehouse.id, quantity: 50, reason: 'sync test' },
  });
  const stockBefore = await call(`/api/inventory/stock/product/${product.id}`, { token });
  const onHand = (r) => (r.data?.warehouses || []).find((s) => s.warehouseId === warehouse.id)?.quantityOnHand ?? 0;
  const qty0 = onHand(stockBefore);

  console.log('1. Device registration');
  const created = await call('/api/pos-devices', {
    method: 'POST', token, body: { name: `Counter ${run}`, warehouseId: warehouse.id },
  });
  check('device created with one-time sync key', created.status === 201 && created.data?.syncKey?.startsWith('sk_live_'), JSON.stringify(created.error));
  const key = created.data.syncKey;
  const device = created.data.device;
  const deviceId = `test-${run}`;

  console.log('2. Handshake & device binding');
  const ping = await call('/api/v1/sync/ping', { method: 'POST', key, deviceId });
  check('ping succeeds and returns warehouse', ping.ok && ping.data?.warehouse?.id === warehouse.id);
  const stolen = await call('/api/v1/sync/ping', { key, deviceId: 'another-terminal' });
  check('key rejected from a second terminal', stolen.status === 403 && stolen.error?.code === 'DEVICE_MISMATCH');
  const noKey = await call('/api/v1/sync/ping', {});
  check('missing key → 401', noKey.status === 401);

  console.log('3. Pull products & POS users');
  const pinUser = await call('/api/pos-devices/users', {
    method: 'POST', token, body: { loginId: `C${run}`.slice(0, 12), displayName: 'Test Cashier', pin: '4321', role: 'cashier' },
  });
  check('POS PIN user created', pinUser.status === 201, JSON.stringify(pinUser.error));
  const pulled = await call('/api/v1/sync/products?since=1970-01-01T00:00:00Z&page=1&limit=500', { key, deviceId });
  const pulledProduct = pulled.data?.products?.find((p) => p.uuid === product.id);
  check('product pulled with warehouse stock', pulledProduct && pulledProduct.current_stock === qty0, `got ${pulledProduct?.current_stock} want ${qty0}`);
  check('pull returns server_time for next cursor', Boolean(pulled.data?.server_time));
  const users = await call('/api/v1/sync/users?since=1970-01-01T00:00:00Z', { key, deviceId });
  const u = users.data?.users?.find((x) => x.display_name === 'Test Cashier');
  const expectedHash = createHash('sha256').update('4321').digest('hex');
  check('POS user pulled with sha256 PIN hash (offline login)', u?.pin_hash === expectedHash);

  console.log('4. Push sales (idempotent)');
  const price = product.sellingPrice;
  const gst = product.gstPercentage;
  const lineTotal = Math.round(price * 2 * (1 + gst / 100) * 100) / 100;
  const cashSale = {
    invoice_no: `INV-${run}-1`, sale_date: new Date().toISOString(), customer_name: null,
    subtotal: price * 2, tax_amount: lineTotal - price * 2, discount_amount: 0, total_amount: lineTotal,
    paid_amount: lineTotal, due_amount: 0, payment_method: 'UPI', payment_status: 'paid',
    items: [{ product_uuid: product.id, sku: product.sku, quantity: 2, unit_price: price, tax_rate: gst }],
  };
  const creditSale = {
    ...cashSale, invoice_no: `INV-${run}-2`, customer_name: `Sync Buyer ${run}`, customer_phone: `98${run.slice(-8).replace(/\D/g, '7').padEnd(8, '7')}`,
    paid_amount: 0, due_amount: lineTotal, payment_method: 'Cash', payment_status: 'credit',
  };
  const badSale = { ...cashSale, invoice_no: `INV-${run}-3`, items: [{ sku: 'NO-SUCH-SKU', quantity: 1, unit_price: 10 }] };
  const push1 = await call('/api/v1/sync/push/sales', { method: 'POST', key, deviceId, body: { sales: [cashSale, creditSale, badSale] } });
  check('2 sales applied, 1 failed', push1.data?.applied === 2 && push1.data?.failed === 1, JSON.stringify(push1.data?.results));
  check('every record reported as stored', push1.data?.results?.every((r) => r.stored));
  check('failed record explains UNKNOWN_PRODUCT', push1.data?.results?.[2]?.errorCode === 'UNKNOWN_PRODUCT');
  check('invoice number is device-prefixed', push1.data?.results?.[0]?.number === `${device.code}-INV-${run}-1`);
  const push2 = await call('/api/v1/sync/push/sales', { method: 'POST', key, deviceId, body: { sales: [cashSale, creditSale] } });
  check('re-push is detected as duplicate (no double invoice)', push2.data?.duplicate === 2 && push2.data?.applied === 0);

  console.log('5. Stock events are not double-counted');
  const ev = await call('/api/v1/sync/push/stock-events', {
    method: 'POST', key, deviceId,
    body: { stock_events: [
      { event_uuid: `ev-${run}-1`, sku: product.sku, event_type: 'SALE', quantity_change: -2, reference_type: 'sale', reference_number: cashSale.invoice_no },
      { event_uuid: `ev-${run}-2`, sku: product.sku, event_type: 'ADJUSTMENT', quantity_change: -1, reference_type: 'adjustment' },
    ] },
  });
  check('SALE event ignored, ADJUSTMENT sent for approval', ev.data?.ignored === 1 && ev.data?.pending_review === 1, JSON.stringify(ev.data?.results));
  const stockAfter = await call(`/api/inventory/stock/product/${product.id}`, { token });
  check('stock reduced exactly once (4 units)', onHand(stockAfter) === qty0 - 4, `got ${onHand(stockAfter)} want ${qty0 - 4}`);

  console.log('6. Returns & payments');
  const ret = await call('/api/v1/sync/push/returns', {
    method: 'POST', key, deviceId,
    body: { returns: [{ return_number: `RET-${run}-1`, sale_number: cashSale.invoice_no, reason: 'damaged', items: [{ sku: product.sku, quantity: 1, unit_price: price }] }] },
  });
  check('return applied against synced sale', ret.data?.applied === 1, JSON.stringify(ret.data?.results));
  const orphan = await call('/api/v1/sync/push/returns', {
    method: 'POST', key, deviceId,
    body: { returns: [{ return_number: `RET-${run}-2`, sale_number: 'NOT-SYNCED', items: [{ sku: product.sku, quantity: 1 }] }] },
  });
  check('return for unsynced sale kept as SALE_NOT_SYNCED', orphan.data?.results?.[0]?.errorCode === 'SALE_NOT_SYNCED');
  const pay = await call('/api/v1/sync/push/payments', {
    method: 'POST', key, deviceId,
    body: { payments: [{ voucher_number: `PV-${run}-1`, invoice_number: creditSale.invoice_no, amount: 50, payment_method: 'UPI', created_at: new Date().toISOString() }] },
  });
  check('payment becomes draft customer receipt', pay.data?.applied === 1 && pay.data?.results?.[0]?.warnings?.[0]?.code === 'DRAFT_RECEIPT', JSON.stringify(pay.data?.results));

  console.log('7. Product requests & admin retry');
  const req = await call('/api/v1/sync/push/products', {
    method: 'POST', key, deviceId,
    body: { products: [{ uuid: `local-${run}`, name: `POS Item ${run}`, sku: `POS-${run}`, gst_rate: 18, selling_price: 99 }] },
  });
  check('new product queued for review', req.data?.pending_review === 1);
  const inbox = await call(`/api/pos-devices/inbox?deviceId=${device.id}&entityType=product&status=pending_review`, { token });
  const approve = await call(`/api/pos-devices/inbox/${inbox.data.items[0].id}/approve`, { method: 'POST', token, body: {} });
  check('admin approval creates ERP product', approve.ok && approve.data?.resultType === 'product', JSON.stringify(approve.error));

  const failedSale = (await call(`/api/pos-devices/inbox?deviceId=${device.id}&status=failed&entityType=sale`, { token })).data.items[0];
  const retry = await call(`/api/pos-devices/inbox/${failedSale.id}/retry`, { method: 'POST', token });
  check('retry of still-invalid sale stays failed', retry.ok && retry.data?.status === 'failed');

  console.log('8. SAC-POS: customer pull & per-user RBAC attribution');
  const custPull = await call('/api/v1/sync/customers?since=1970-01-01T00:00:00Z', { key, deviceId });
  const buyer = custPull.data?.customers?.find((c) => c.name === creditSale.customer_name);
  check('credit customer pulled with outstanding balance', buyer && buyer.outstanding > 0, JSON.stringify(custPull.error));
  const usersList = await call('/api/users', { token });
  const staff = (Array.isArray(usersList.data) ? usersList.data : usersList.data?.items || [])
    .find((x) => x.email === ADMIN.email);
  const attributed = await call('/api/v1/sync/push/sales', {
    method: 'POST', key, deviceId,
    body: { sales: [{ ...cashSale, invoice_no: `INV-${run}-U1`, erp_user_id: staff.id }] },
  });
  check('sale attributed to logged-in ERP user (no warning)', attributed.data?.applied === 1
    && !(attributed.data.results[0].warnings || []).some((w) => w.code.startsWith('USER_')), JSON.stringify(attributed.data?.results));
  const ghost = await call('/api/v1/sync/push/sales', {
    method: 'POST', key, deviceId,
    body: { sales: [{ ...cashSale, invoice_no: `INV-${run}-U2`, erp_user_id: 'no-such-user' }] },
  });
  check('unknown ERP user → recorded with USER_INACTIVE warning', ghost.data?.results?.[0]?.warnings?.some((w) => w.code === 'USER_INACTIVE'));

  const staffRes = await call(`/api/v1/sync/staff?ids=${staff.id},nobody`, { key, deviceId });
  const me = staffRes.data?.staff?.find((x) => x.id === staff.id);
  check('staff status returns live ERP permissions for PIN unlock', me?.isActive && me.permissions.includes('pos.terminal.view'));
  check('unknown staff id reported as not existing', staffRes.data?.staff?.find((x) => x.id === 'nobody')?.exists === false);

  console.log('9. Revocation');
  await call(`/api/pos-devices/${device.id}/revoke`, { method: 'POST', token });
  const revoked = await call('/api/v1/sync/ping', { key, deviceId });
  check('revoked key → 401', revoked.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
