-- Demo seed data for local SQLite testing

INSERT OR IGNORE INTO app_settings (id, company_name, currency_symbol, low_stock_threshold, sync_registered_email, sync_enabled)
VALUES ('singleton', 'TracInvent Demo Co.', '₹', 10, 'dev@tracinvent.local', 1);

INSERT OR IGNORE INTO users (
  id, username, email, display_name, password_hash, role, is_active, is_deleted
) VALUES (
  'dev-test-user', 'devadmin', 'dev@tracinvent.local', 'Dev Admin', 'dev-hash', 'admin', 1, 0
);

INSERT OR IGNORE INTO warehouses (
  id, code, name, address, city, state, country, contact_person, contact_phone, is_active, is_deleted
) VALUES (
  'wh-main', 'WH-001', 'Main Warehouse', '12 Industrial Area', 'Mumbai', 'Maharashtra', 'India', 'Ravi Kumar', '9876500001', 1, 0
);

INSERT OR IGNORE INTO storage_locations (id, warehouse_id, type, code, zone_name, row_num, col_num, is_active) VALUES
  ('loc-a1', 'wh-main', 'cell', 'A1', 'Zone A', 1, 1, 1),
  ('loc-a2', 'wh-main', 'cell', 'A2', 'Zone A', 1, 2, 1),
  ('loc-b1', 'wh-main', 'cell', 'B1', 'Zone B', 2, 1, 1),
  ('loc-b2', 'wh-main', 'cell', 'B2', 'Zone B', 2, 2, 1),
  ('loc-c1', 'wh-main', 'cell', 'C1', 'Zone C', 3, 1, 1);

INSERT OR IGNORE INTO inventory_items (
  id, name, sku, barcode, category, unit, reorder_level, min_stock_level, cost_price, selling_price, brand, hsn, model_variant, tax_rate, item_type, is_active, is_deleted
) VALUES
  ('item-001', 'Steel Bolt M8', 'SKU-BOLT-M8', '8901001001001', 'Hardware', 'pieces', 50, 20, 2.50, 4.00, 'FastFix', '73181500', 'M8', 18, 'product', 1, 0),
  ('item-002', 'Steel Nut M8', 'SKU-NUT-M8', '8901001001002', 'Hardware', 'pieces', 50, 20, 1.20, 2.50, 'FastFix', '73181600', 'M8', 18, 'product', 1, 0),
  ('item-003', 'Copper Wire 2.5mm', 'SKU-WIRE-25', '8901001001003', 'Electrical', 'meters', 100, 40, 45.00, 65.00, 'VoltLine', '85444900', '2.5mm', 12, 'product', 1, 0),
  ('item-004', 'PVC Pipe 1 inch', 'SKU-PVC-1IN', '8901001001004', 'Plumbing', 'pieces', 30, 10, 85.00, 120.00, 'FlowMax', '39172390', '1 inch', 18, 'product', 1, 0),
  ('item-005', 'Wall Paint White 1L', 'SKU-PAINT-W1', '8901001001005', 'Paints', 'liters', 15, 5, 180.00, 250.00, 'ColorPro', '32091010', '1L White', 28, 'product', 1, 0),
  ('item-006', 'Safety Gloves', 'SKU-GLOVE-L', '8901001001006', 'Safety', 'pairs', 25, 10, 35.00, 55.00, 'SafeHand', '40151900', 'Large', 12, 'product', 1, 0),
  ('item-007', 'LED Bulb 9W', 'SKU-LED-9W', '8901001001007', 'Electrical', 'pieces', 40, 15, 55.00, 85.00, 'BrightLite', '85395200', '9W Warm', 18, 'product', 1, 0),
  ('item-008', 'Hammer 500g', 'SKU-HAM-500', '8901001001008', 'Tools', 'pieces', 10, 3, 220.00, 320.00, 'ToolCraft', '82052000', '500g', 18, 'product', 1, 0),
  ('item-009', 'Measuring Tape 5m', 'SKU-TAPE-5M', '8901001001009', 'Tools', 'pieces', 12, 4, 95.00, 140.00, 'ToolCraft', '90178010', '5m', 18, 'product', 1, 0),
  ('item-010', 'Packaging Box Medium', 'SKU-BOX-M', '8901001001010', 'Packaging', 'pieces', 100, 30, 12.00, 18.00, 'PackWell', '48191000', 'Medium', 5, 'product', 1, 0),
  ('item-011', 'Masking Tape', 'SKU-MASK-T', '8901001001011', 'Adhesives', 'rolls', 20, 8, 25.00, 40.00, 'StickIt', '48114100', 'Standard', 12, 'product', 1, 0),
  ('item-012', 'Hand Sanitizer 500ml', 'SKU-SAN-500', '8901001001012', 'Hygiene', 'bottles', 8, 3, 45.00, 70.00, 'CleanCare', '38089400', '500ml', 18, 'product', 1, 0),
  ('item-013', 'Notebook A4', 'SKU-NB-A4', '8901001001013', 'Stationery', 'pieces', 30, 10, 18.00, 30.00, 'WriteRight', '48201020', 'A4 Ruled', 0, 'product', 1, 0),
  ('item-014', 'Printer Paper Ream', 'SKU-PAPER-R', '8901001001014', 'Stationery', 'reams', 20, 5, 210.00, 280.00, 'WriteRight', '48025620', 'A4 75gsm', 12, 'product', 1, 0),
  ('item-015', 'Industrial Lubricant 1L', 'SKU-LUB-1L', '8901001001015', 'Maintenance', 'liters', 5, 2, 320.00, 450.00, 'SmoothRun', '27101980', '1L', 18, 'product', 1, 0);

INSERT OR IGNORE INTO stock (id, item_id, warehouse_id, location_id, quantity, batch_number, expiry_date) VALUES
  ('stk-001', 'item-001', 'wh-main', 'loc-a1', 120, 'BATCH-001', NULL),
  ('stk-002', 'item-002', 'wh-main', 'loc-a1', 95, 'BATCH-002', NULL),
  ('stk-003', 'item-003', 'wh-main', 'loc-a2', 250, 'BATCH-003', NULL),
  ('stk-004', 'item-004', 'wh-main', 'loc-b1', 45, 'BATCH-004', NULL),
  ('stk-005', 'item-005', 'wh-main', 'loc-b2', 8, 'BATCH-005', date('now', '+45 days')),
  ('stk-006', 'item-006', 'wh-main', 'loc-b2', 60, 'BATCH-006', NULL),
  ('stk-007', 'item-007', 'wh-main', 'loc-c1', 35, 'BATCH-007', NULL),
  ('stk-008', 'item-008', 'wh-main', 'loc-c1', 15, 'BATCH-008', NULL),
  ('stk-009', 'item-012', 'wh-main', 'loc-a2', 5, 'BATCH-009', date('now', '+15 days')),
  ('stk-010', 'item-015', 'wh-main', 'loc-b1', 3, 'BATCH-010', date('now', '+120 days'));

INSERT OR IGNORE INTO suppliers (id, code, name, contact_person, phone, city, credit_limit, credit_balance, is_active, is_deleted) VALUES
  ('sup-001', 'SUP-001', 'Metro Hardware Supplies', 'Anil Shah', '9876511111', 'Mumbai', 50000, 12500, 1, 0),
  ('sup-002', 'SUP-002', 'Bright Electricals', 'Priya Mehta', '9876522222', 'Pune', 75000, 0, 1, 0);

INSERT OR IGNORE INTO customers (id, code, name, phone, city, loyalty_points, credit_limit, credit_balance, is_active, is_deleted) VALUES
  ('cus-001', 'CUS-001', 'City Builders Pvt Ltd', '9876533333', 'Mumbai', 120, 100000, 8500, 1, 0),
  ('cus-002', 'CUS-002', 'Walk-in Customer', '0000000000', 'Mumbai', 0, 0, 0, 1, 0);

INSERT OR IGNORE INTO stock_movements (id, item_id, warehouse_id, location_id, movement_type, quantity, reference_id, notes, created_by, created_at) VALUES
  ('mov-001', 'item-001', 'wh-main', 'loc-a1', 'IN', 50, 'PO-001', 'Initial stock receipt', 'dev-test-user', datetime('now', '-6 days')),
  ('mov-002', 'item-003', 'wh-main', 'loc-a2', 'IN', 100, 'PO-002', 'Wire restock', 'dev-test-user', datetime('now', '-5 days')),
  ('mov-003', 'item-007', 'wh-main', 'loc-c1', 'OUT', 10, 'SALE-001', 'Retail sale', 'dev-test-user', datetime('now', '-4 days')),
  ('mov-004', 'item-005', 'wh-main', 'loc-b2', 'OUT', 2, 'SALE-002', 'Paint order', 'dev-test-user', datetime('now', '-3 days')),
  ('mov-005', 'item-006', 'wh-main', 'loc-b2', 'IN', 30, 'PO-003', 'Safety gear restock', 'dev-test-user', datetime('now', '-2 days')),
  ('mov-006', 'item-012', 'wh-main', 'loc-a2', 'OUT', 3, 'SALE-003', 'Office supplies', 'dev-test-user', datetime('now', '-1 days')),
  ('mov-007', 'item-008', 'wh-main', 'loc-c1', 'TRANSFER', 5, 'TRF-001', 'Moved to front store', 'dev-test-user', datetime('now', '-12 hours')),
  ('mov-008', 'item-004', 'wh-main', 'loc-b1', 'IN', 20, 'PO-004', 'Plumbing restock', 'dev-test-user', datetime('now', '-3 hours'));

INSERT OR IGNORE INTO transactions (id, transaction_no, type, item_id, warehouse_id, location_id, quantity, unit_price, total_price, reference, created_by, created_at) VALUES
  ('txn-001', 'TXN-IN-001', 'IN', 'item-001', 'wh-main', 'loc-a1', 50, 2.50, 125.00, 'Opening stock', 'dev-test-user', datetime('now', '-6 days')),
  ('txn-002', 'TXN-OUT-001', 'OUT', 'item-007', 'wh-main', 'loc-c1', 10, 85.00, 850.00, 'Counter sale', 'dev-test-user', datetime('now', '-4 days'));

INSERT OR IGNORE INTO stock_adjustments (
  id, item_id, item_name, item_sku, warehouse_id, warehouse_name, cell_id, cell_name,
  quantity_before, quantity_adjusted, quantity_after, adjustment_type, status, reason, created_by, created_at
) VALUES
  ('adj-001', 'item-012', 'Hand Sanitizer 500ml', 'SKU-SAN-500', 'wh-main', 'Main Warehouse', 'loc-a2', 'A2',
   8, -3, 5, 'PHY', 'APR', 'Physical count correction', 'dev-test-user', datetime('now', '-2 days')),
  ('adj-002', 'item-015', 'Industrial Lubricant 1L', 'SKU-LUB-1L', 'wh-main', 'Main Warehouse', 'loc-b1', 'B1',
   4, -1, 3, 'DMG', 'PND', 'Damaged container leak', 'dev-test-user', datetime('now', '-1 days'));

INSERT OR IGNORE INTO purchase_orders (
  id, po_number, supplier_id, status, order_date, expected_date, subtotal, total_amount, created_by, created_at
) VALUES
  ('po-001', 'PO-2026-001', 'sup-001', 'SENT', date('now', '-3 days'), date('now', '+4 days'), 2500, 2500, 'dev-test-user', datetime('now', '-3 days'));

INSERT OR IGNORE INTO purchase_order_items (id, po_id, item_id, ordered_qty, received_qty, unit_price, total_price) VALUES
  ('poi-001', 'po-001', 'item-001', 100, 0, 2.50, 250.00),
  ('poi-002', 'po-001', 'item-002', 200, 0, 1.20, 240.00),
  ('poi-003', 'po-001', 'item-008', 10, 0, 220.00, 2200.00);

INSERT OR IGNORE INTO ledger_entries (
  id, entity_type, entity_id, transaction_type, debit, credit, balance, notes, created_by, created_at
) VALUES
  ('led-001', 'SUPPLIER', 'sup-001', 'PURCHASE', 12500, 0, 12500, 'Opening balance', 'dev-test-user', datetime('now', '-10 days')),
  ('led-002', 'CUSTOMER', 'cus-001', 'SALE', 8500, 0, 8500, 'Credit sale', 'dev-test-user', datetime('now', '-5 days'));
