-- SACONE Phase 12: CEO Dashboard provision
-- Settings + indexes only. No duplicate transaction / fact tables.

INSERT OR IGNORE INTO system_settings (key, value, description, updated_at) VALUES
  ('ceo.dead_stock_days', '90', 'Days without sale to classify dead stock', datetime('now')),
  ('ceo.slow_moving_max_qty', '2', 'Max qty sold in period to classify slow-moving (with stock)', datetime('now')),
  ('ceo.min_margin_percent', '10', 'Minimum gross margin % before low-margin alert', datetime('now')),
  ('ceo.unusual_discount_percent', '25', 'Line/invoice discount % treated as unusual', datetime('now')),
  ('ceo.overdue_receivable_alert_amount', '50000', 'Outstanding amount threshold for critical receivable alert', datetime('now')),
  ('ceo.health.weight.sales_trend', '20', 'Business health weight: sales trend (0-100 total)', datetime('now')),
  ('ceo.health.weight.gross_profit', '20', 'Business health weight: gross profit', datetime('now')),
  ('ceo.health.weight.cash_flow', '15', 'Business health weight: cash collections vs purchases', datetime('now')),
  ('ceo.health.weight.receivables', '15', 'Business health weight: receivables pressure', datetime('now')),
  ('ceo.health.weight.payables', '10', 'Business health weight: payables pressure', datetime('now')),
  ('ceo.health.weight.inventory', '20', 'Business health weight: inventory health', datetime('now')),
  ('ceo.costing_method', 'purchase_price', 'Inventory costing for estimated COGS: purchase_price (master). Future: wac|fifo', datetime('now')),
  ('ceo.refresh_seconds', '60', 'Near-real-time dashboard poll interval (seconds)', datetime('now'));

CREATE INDEX IF NOT EXISTS idx_pos_sales_ceo_created
  ON pos_sales(created_at, status);

CREATE INDEX IF NOT EXISTS idx_pos_payments_ceo_created
  ON pos_payments(created_at, method);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_ceo_date
  ON supplier_bills(bill_date, status);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_ceo_date
  ON supplier_payments(payment_date, method);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale
  ON pos_sale_items(sale_id, product_id);
