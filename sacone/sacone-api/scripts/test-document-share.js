/**
 * Secure invoice share links, end to end on a throwaway SQLite database (no live server, no logins).
 * Run: node scripts/test-document-share.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacone-share-'));
process.env.DATABASE_DRIVER = 'sqlite';
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.APP_ENV = 'development';
process.env.PUBLIC_DOCUMENT_BASE_URL = 'http://localhost:3000';
process.env.DOCUMENT_LINK_TTL_HOURS = '24';
// Throwaway admin for the scratch DB, so the real one from .env is never used or printed.
process.env.DEFAULT_ADMIN_EMAIL = 'share-test@example.invalid';
process.env.DEFAULT_ADMIN_PASSWORD = 'not-a-real-password';

const { runDatabaseSetup } = await import('../src/database/setup.js');
const { getDatabase, closeDatabase } = await import('../src/database/connection.js');
const { config } = await import('../src/config/index.js');
const { createApp } = await import('../src/app.js');
const { documentLinkService } = await import('../src/services/document-links.js');

let passed = 0;
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}
async function expectError(fn, status, msg) {
  try {
    await fn();
  } catch (e) {
    check(e.statusCode === status, `${msg} (got ${e.statusCode})`);
    return;
  }
  throw new Error(`FAIL: ${msg} (no error)`);
}

await runDatabaseSetup();
const db = getDatabase();
const admin = db.prepare("SELECT id, full_name FROM users ORDER BY created_at LIMIT 1").get();
const now = new Date().toISOString();

db.pragma('foreign_keys = OFF');
db.prepare(`INSERT INTO customers (id, code, name, phone, email, gst_number, address, city, state, credit_limit, outstanding_balance,
  is_walk_in, is_active, notes, created_at, updated_at) VALUES ('c1','CUST-T','Asha Traders','9876543210','asha@example.com','27ABCDE1234F1Z5',
  '12 MG Road','Pune','Maharashtra', 50000, 12000, 0, 1, 'internal: slow payer', ?, ?)`).run(now, now);
const insertSale = db.prepare(`INSERT INTO pos_sales (id, invoice_number, warehouse_id, customer_id, status, payment_status, subtotal,
  taxable_amount, cgst_amount, sgst_amount, gst_amount, grand_total, amount_paid, created_by, created_at)
  VALUES (?, ?, 'w1', 'c1', ?, 'paid', 10593.22, 10593.22, 953.39, 953.39, 1906.78, 12500, 12500, ?, ?)`);
insertSale.run('s1', 'INV-1025', 'completed', admin.id, now);
insertSale.run('s2', 'INV-1026', 'voided', admin.id, now);
db.prepare(`INSERT INTO pos_sale_items (id, sale_id, product_id, product_name, hsn_code, quantity, unit_price, gst_percentage, taxable_amount, gst_amount, line_total)
  VALUES ('i1','s1','p1','Steel Almirah','9403', 1, 10593.22, 18, 10593.22, 1906.78, 12500)`).run();
db.prepare(`INSERT INTO pos_payments (id, sale_id, method, amount, created_at) VALUES ('pay1','s1','upi',12500,?)`).run(now);
db.pragma('foreign_keys = ON');

const actor = { user: { id: admin.id, fullName: admin.full_name, roleSlug: 'owner_admin' }, permissions: ['pos.sales.view'] };
const noPerm = { user: { id: admin.id, fullName: admin.full_name }, permissions: ['products.products.view'] };

const server = createApp().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const resolve = (token) => fetch(`${base}/api/shared-documents/resolve`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
});

try {
  console.log('Authorization');
  await expectError(() => documentLinkService.createSaleLink('s1', noPerm, null), 403, 'user without sales view cannot create a link');
  await expectError(() => documentLinkService.createSaleLink('missing', actor, null), 404, 'unknown invoice id is rejected');
  await expectError(() => documentLinkService.createSaleLink('s2', actor, null), 404, 'deleted (voided) invoice cannot be shared');
  const unauth = await fetch(`${base}/api/pos/sales/s1`);
  check(unauth.status === 401, 'invoice API needs a signed-in session');
  const unauthLink = await fetch(`${base}/api/pos/sales/s1/share-link`, { method: 'POST' });
  check(unauthLink.status === 401, 'link creation needs a signed-in session');

  console.log('Link creation');
  const link = documentLinkService.createSaleLink('s1', actor, null);
  const token = link.url.split('#')[1];
  check(link.url.startsWith('http://localhost:3000/share#'), 'token is in the URL fragment, not the path or query');
  check(/^[A-Za-z0-9_-]{43}$/.test(token), 'token is 256-bit random base64url');
  const stored = db.prepare('SELECT * FROM document_share_links').get();
  check(stored.token_hash !== token && stored.token_hash.length === 64, 'only a SHA-256 hash of the token is stored');
  const hours = (new Date(link.expiresAt) - Date.now()) / 3600000;
  check(hours > 23.9 && hours <= 24, 'link expires after DOCUMENT_LINK_TTL_HOURS');

  console.log('Public resolve');
  const ok = await resolve(token);
  const body = await ok.json();
  check(ok.status === 200 && body.data.sale.invoiceNumber === 'INV-1025', 'valid link returns the invoice');
  check(ok.headers.get('cache-control')?.includes('no-store'), 'response is no-store');
  check(ok.headers.get('referrer-policy') === 'no-referrer', 'response sets Referrer-Policy: no-referrer');
  const c = body.data.customer;
  check(c.gstNumber === '27ABCDE1234F1Z5' && c.city === 'Pune', 'customer fields printed on the invoice are included');
  check(!('creditLimit' in c) && !('outstandingBalance' in c) && !('email' in c) && !('notes' in c), 'credit limit, balance, email and notes are not exposed');
  check(!('id' in body.data.sale) && !('customerId' in body.data.sale) && !('createdBy' in body.data.sale), 'internal ids are not exposed');
  check(db.prepare('SELECT access_count FROM document_share_links').get().access_count === 1, 'access is counted');
  check(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('share_link_create','share_link_open')").get().n === 2, 'creation and opening are audited');

  console.log('Invalid, expired, revoked');
  check((await resolve('not-a-token')).status === 410, 'malformed token is rejected');
  check((await resolve('A'.repeat(43))).status === 410, 'unknown token is rejected');
  check((await resolve(undefined)).status === 410, 'missing token is rejected');
  db.prepare("UPDATE document_share_links SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  const expired = await resolve(token);
  check(expired.status === 410 && (await expired.json()).error.code === 'LINK_EXPIRED', 'expired link is rejected');
  const second = documentLinkService.createSaleLink('s1', actor, null);
  const t2 = second.url.split('#')[1];
  check((await resolve(t2)).status === 200, 'a fresh link works');
  check(documentLinkService.revokeSaleLinks('s1', actor, null).revoked === 1, 'revoke switches off active links');
  check((await resolve(t2)).status === 410, 'revoked link is rejected');
  const third = documentLinkService.createSaleLink('s1', actor, null).url.split('#')[1];
  db.prepare("UPDATE pos_sales SET status = 'voided' WHERE id = 's1'").run();
  check((await resolve(third)).status === 410, 'link stops working when the invoice is deleted');
  db.prepare("UPDATE pos_sales SET status = 'completed' WHERE id = 's1'").run();

  console.log('Configuration');
  const saved = config.publicDocumentBaseUrl;
  config.publicDocumentBaseUrl = '';
  await expectError(() => documentLinkService.createSaleLink('s1', actor, null), 409, 'links are refused when no public https URL is configured');
  check((await resolve(third)).status === 410, 'and existing links stop resolving');
  config.publicDocumentBaseUrl = saved;

  console.log('Rate limiting');
  let limited = false;
  for (let i = 0; i < 40 && !limited; i += 1) limited = (await resolve('A'.repeat(43))).status === 429;
  check(limited, 'public resolve is rate limited per IP');

  console.log(`\nAll ${passed} checks passed.`);
} finally {
  server.close();
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
}
