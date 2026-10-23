-- All names and addresses in CAPITALS: existing records now, and every new or edited
-- record automatically (ERP, SAC-POS sync, imports) through the triggers below.
-- Emails, notes, GSTIN / PAN, SKU, barcodes and codes are left as typed.

UPDATE products SET name = upper(name), description = upper(description), short_description = upper(short_description), model_variant = upper(model_variant), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE name IS NOT upper(name) OR description IS NOT upper(description) OR short_description IS NOT upper(short_description) OR model_variant IS NOT upper(model_variant);
DROP TRIGGER IF EXISTS trg_caps_products_ins;
CREATE TRIGGER trg_caps_products_ins AFTER INSERT ON products WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description) OR NEW.short_description IS NOT upper(NEW.short_description) OR NEW.model_variant IS NOT upper(NEW.model_variant)
BEGIN
  UPDATE products SET name = upper(name), description = upper(description), short_description = upper(short_description), model_variant = upper(model_variant) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_products_upd;
CREATE TRIGGER trg_caps_products_upd AFTER UPDATE OF name, description, short_description, model_variant ON products WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description) OR NEW.short_description IS NOT upper(NEW.short_description) OR NEW.model_variant IS NOT upper(NEW.model_variant)
BEGIN
  UPDATE products SET name = upper(name), description = upper(description), short_description = upper(short_description), model_variant = upper(model_variant) WHERE rowid = NEW.rowid;
END;

UPDATE categories SET name = upper(name), description = upper(description) WHERE name IS NOT upper(name) OR description IS NOT upper(description);
DROP TRIGGER IF EXISTS trg_caps_categories_ins;
CREATE TRIGGER trg_caps_categories_ins AFTER INSERT ON categories WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description)
BEGIN
  UPDATE categories SET name = upper(name), description = upper(description) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_categories_upd;
CREATE TRIGGER trg_caps_categories_upd AFTER UPDATE OF name, description ON categories WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description)
BEGIN
  UPDATE categories SET name = upper(name), description = upper(description) WHERE rowid = NEW.rowid;
END;

UPDATE brands SET name = upper(name), description = upper(description) WHERE name IS NOT upper(name) OR description IS NOT upper(description);
DROP TRIGGER IF EXISTS trg_caps_brands_ins;
CREATE TRIGGER trg_caps_brands_ins AFTER INSERT ON brands WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description)
BEGIN
  UPDATE brands SET name = upper(name), description = upper(description) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_brands_upd;
CREATE TRIGGER trg_caps_brands_upd AFTER UPDATE OF name, description ON brands WHEN NEW.name IS NOT upper(NEW.name) OR NEW.description IS NOT upper(NEW.description)
BEGIN
  UPDATE brands SET name = upper(name), description = upper(description) WHERE rowid = NEW.rowid;
END;

UPDATE units SET name = upper(name), abbreviation = upper(abbreviation) WHERE name IS NOT upper(name) OR abbreviation IS NOT upper(abbreviation);
DROP TRIGGER IF EXISTS trg_caps_units_ins;
CREATE TRIGGER trg_caps_units_ins AFTER INSERT ON units WHEN NEW.name IS NOT upper(NEW.name) OR NEW.abbreviation IS NOT upper(NEW.abbreviation)
BEGIN
  UPDATE units SET name = upper(name), abbreviation = upper(abbreviation) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_units_upd;
CREATE TRIGGER trg_caps_units_upd AFTER UPDATE OF name, abbreviation ON units WHEN NEW.name IS NOT upper(NEW.name) OR NEW.abbreviation IS NOT upper(NEW.abbreviation)
BEGIN
  UPDATE units SET name = upper(name), abbreviation = upper(abbreviation) WHERE rowid = NEW.rowid;
END;

UPDATE customers SET name = upper(name), business_name = upper(business_name), contact_person = upper(contact_person), address = upper(address), city = upper(city), state = upper(state), shipping_address = upper(shipping_address), shipping_city = upper(shipping_city), shipping_state = upper(shipping_state), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE name IS NOT upper(name) OR business_name IS NOT upper(business_name) OR contact_person IS NOT upper(contact_person) OR address IS NOT upper(address) OR city IS NOT upper(city) OR state IS NOT upper(state) OR shipping_address IS NOT upper(shipping_address) OR shipping_city IS NOT upper(shipping_city) OR shipping_state IS NOT upper(shipping_state);
DROP TRIGGER IF EXISTS trg_caps_customers_ins;
CREATE TRIGGER trg_caps_customers_ins AFTER INSERT ON customers WHEN NEW.name IS NOT upper(NEW.name) OR NEW.business_name IS NOT upper(NEW.business_name) OR NEW.contact_person IS NOT upper(NEW.contact_person) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state) OR NEW.shipping_address IS NOT upper(NEW.shipping_address) OR NEW.shipping_city IS NOT upper(NEW.shipping_city) OR NEW.shipping_state IS NOT upper(NEW.shipping_state)
BEGIN
  UPDATE customers SET name = upper(name), business_name = upper(business_name), contact_person = upper(contact_person), address = upper(address), city = upper(city), state = upper(state), shipping_address = upper(shipping_address), shipping_city = upper(shipping_city), shipping_state = upper(shipping_state) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_customers_upd;
CREATE TRIGGER trg_caps_customers_upd AFTER UPDATE OF name, business_name, contact_person, address, city, state, shipping_address, shipping_city, shipping_state ON customers WHEN NEW.name IS NOT upper(NEW.name) OR NEW.business_name IS NOT upper(NEW.business_name) OR NEW.contact_person IS NOT upper(NEW.contact_person) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state) OR NEW.shipping_address IS NOT upper(NEW.shipping_address) OR NEW.shipping_city IS NOT upper(NEW.shipping_city) OR NEW.shipping_state IS NOT upper(NEW.shipping_state)
BEGIN
  UPDATE customers SET name = upper(name), business_name = upper(business_name), contact_person = upper(contact_person), address = upper(address), city = upper(city), state = upper(state), shipping_address = upper(shipping_address), shipping_city = upper(shipping_city), shipping_state = upper(shipping_state) WHERE rowid = NEW.rowid;
END;

UPDATE suppliers SET name = upper(name), contact_name = upper(contact_name), address = upper(address), city = upper(city), state = upper(state) WHERE name IS NOT upper(name) OR contact_name IS NOT upper(contact_name) OR address IS NOT upper(address) OR city IS NOT upper(city) OR state IS NOT upper(state);
DROP TRIGGER IF EXISTS trg_caps_suppliers_ins;
CREATE TRIGGER trg_caps_suppliers_ins AFTER INSERT ON suppliers WHEN NEW.name IS NOT upper(NEW.name) OR NEW.contact_name IS NOT upper(NEW.contact_name) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state)
BEGIN
  UPDATE suppliers SET name = upper(name), contact_name = upper(contact_name), address = upper(address), city = upper(city), state = upper(state) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_suppliers_upd;
CREATE TRIGGER trg_caps_suppliers_upd AFTER UPDATE OF name, contact_name, address, city, state ON suppliers WHEN NEW.name IS NOT upper(NEW.name) OR NEW.contact_name IS NOT upper(NEW.contact_name) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state)
BEGIN
  UPDATE suppliers SET name = upper(name), contact_name = upper(contact_name), address = upper(address), city = upper(city), state = upper(state) WHERE rowid = NEW.rowid;
END;

UPDATE companies SET business_name = upper(business_name), legal_name = upper(legal_name), address_line1 = upper(address_line1), address_line2 = upper(address_line2), city = upper(city), state = upper(state), country = upper(country), authorized_signatory = upper(authorized_signatory) WHERE business_name IS NOT upper(business_name) OR legal_name IS NOT upper(legal_name) OR address_line1 IS NOT upper(address_line1) OR address_line2 IS NOT upper(address_line2) OR city IS NOT upper(city) OR state IS NOT upper(state) OR country IS NOT upper(country) OR authorized_signatory IS NOT upper(authorized_signatory);
DROP TRIGGER IF EXISTS trg_caps_companies_ins;
CREATE TRIGGER trg_caps_companies_ins AFTER INSERT ON companies WHEN NEW.business_name IS NOT upper(NEW.business_name) OR NEW.legal_name IS NOT upper(NEW.legal_name) OR NEW.address_line1 IS NOT upper(NEW.address_line1) OR NEW.address_line2 IS NOT upper(NEW.address_line2) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state) OR NEW.country IS NOT upper(NEW.country) OR NEW.authorized_signatory IS NOT upper(NEW.authorized_signatory)
BEGIN
  UPDATE companies SET business_name = upper(business_name), legal_name = upper(legal_name), address_line1 = upper(address_line1), address_line2 = upper(address_line2), city = upper(city), state = upper(state), country = upper(country), authorized_signatory = upper(authorized_signatory) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_companies_upd;
CREATE TRIGGER trg_caps_companies_upd AFTER UPDATE OF business_name, legal_name, address_line1, address_line2, city, state, country, authorized_signatory ON companies WHEN NEW.business_name IS NOT upper(NEW.business_name) OR NEW.legal_name IS NOT upper(NEW.legal_name) OR NEW.address_line1 IS NOT upper(NEW.address_line1) OR NEW.address_line2 IS NOT upper(NEW.address_line2) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state) OR NEW.country IS NOT upper(NEW.country) OR NEW.authorized_signatory IS NOT upper(NEW.authorized_signatory)
BEGIN
  UPDATE companies SET business_name = upper(business_name), legal_name = upper(legal_name), address_line1 = upper(address_line1), address_line2 = upper(address_line2), city = upper(city), state = upper(state), country = upper(country), authorized_signatory = upper(authorized_signatory) WHERE rowid = NEW.rowid;
END;

UPDATE warehouses SET name = upper(name), address = upper(address), city = upper(city), state = upper(state) WHERE name IS NOT upper(name) OR address IS NOT upper(address) OR city IS NOT upper(city) OR state IS NOT upper(state);
DROP TRIGGER IF EXISTS trg_caps_warehouses_ins;
CREATE TRIGGER trg_caps_warehouses_ins AFTER INSERT ON warehouses WHEN NEW.name IS NOT upper(NEW.name) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state)
BEGIN
  UPDATE warehouses SET name = upper(name), address = upper(address), city = upper(city), state = upper(state) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_warehouses_upd;
CREATE TRIGGER trg_caps_warehouses_upd AFTER UPDATE OF name, address, city, state ON warehouses WHEN NEW.name IS NOT upper(NEW.name) OR NEW.address IS NOT upper(NEW.address) OR NEW.city IS NOT upper(NEW.city) OR NEW.state IS NOT upper(NEW.state)
BEGIN
  UPDATE warehouses SET name = upper(name), address = upper(address), city = upper(city), state = upper(state) WHERE rowid = NEW.rowid;
END;

UPDATE pos_sale_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE product_name IS NOT upper(product_name) OR short_description IS NOT upper(short_description);
DROP TRIGGER IF EXISTS trg_caps_pos_sale_items_ins;
CREATE TRIGGER trg_caps_pos_sale_items_ins AFTER INSERT ON pos_sale_items WHEN NEW.product_name IS NOT upper(NEW.product_name) OR NEW.short_description IS NOT upper(NEW.short_description)
BEGIN
  UPDATE pos_sale_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_pos_sale_items_upd;
CREATE TRIGGER trg_caps_pos_sale_items_upd AFTER UPDATE OF product_name, short_description ON pos_sale_items WHEN NEW.product_name IS NOT upper(NEW.product_name) OR NEW.short_description IS NOT upper(NEW.short_description)
BEGIN
  UPDATE pos_sale_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE rowid = NEW.rowid;
END;

UPDATE pos_quotation_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE product_name IS NOT upper(product_name) OR short_description IS NOT upper(short_description);
DROP TRIGGER IF EXISTS trg_caps_pos_quotation_items_ins;
CREATE TRIGGER trg_caps_pos_quotation_items_ins AFTER INSERT ON pos_quotation_items WHEN NEW.product_name IS NOT upper(NEW.product_name) OR NEW.short_description IS NOT upper(NEW.short_description)
BEGIN
  UPDATE pos_quotation_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_pos_quotation_items_upd;
CREATE TRIGGER trg_caps_pos_quotation_items_upd AFTER UPDATE OF product_name, short_description ON pos_quotation_items WHEN NEW.product_name IS NOT upper(NEW.product_name) OR NEW.short_description IS NOT upper(NEW.short_description)
BEGIN
  UPDATE pos_quotation_items SET product_name = upper(product_name), short_description = upper(short_description) WHERE rowid = NEW.rowid;
END;

UPDATE purchase_order_items SET product_name = upper(product_name) WHERE product_name IS NOT upper(product_name);
DROP TRIGGER IF EXISTS trg_caps_purchase_order_items_ins;
CREATE TRIGGER trg_caps_purchase_order_items_ins AFTER INSERT ON purchase_order_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE purchase_order_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_purchase_order_items_upd;
CREATE TRIGGER trg_caps_purchase_order_items_upd AFTER UPDATE OF product_name ON purchase_order_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE purchase_order_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;

UPDATE supplier_bill_items SET product_name = upper(product_name) WHERE product_name IS NOT upper(product_name);
DROP TRIGGER IF EXISTS trg_caps_supplier_bill_items_ins;
CREATE TRIGGER trg_caps_supplier_bill_items_ins AFTER INSERT ON supplier_bill_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE supplier_bill_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_supplier_bill_items_upd;
CREATE TRIGGER trg_caps_supplier_bill_items_upd AFTER UPDATE OF product_name ON supplier_bill_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE supplier_bill_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;

UPDATE purchase_return_items SET product_name = upper(product_name) WHERE product_name IS NOT upper(product_name);
DROP TRIGGER IF EXISTS trg_caps_purchase_return_items_ins;
CREATE TRIGGER trg_caps_purchase_return_items_ins AFTER INSERT ON purchase_return_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE purchase_return_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_caps_purchase_return_items_upd;
CREATE TRIGGER trg_caps_purchase_return_items_upd AFTER UPDATE OF product_name ON purchase_return_items WHEN NEW.product_name IS NOT upper(NEW.product_name)
BEGIN
  UPDATE purchase_return_items SET product_name = upper(product_name) WHERE rowid = NEW.rowid;
END;

-- Ship To (consignee) and transporter on bills already made
UPDATE pos_sales SET ship_to = json_set(ship_to, '$.name', upper(json_extract(ship_to, '$.name'))) WHERE json_valid(ship_to) AND json_type(ship_to, '$.name') = 'text' AND json_extract(ship_to, '$.name') IS NOT upper(json_extract(ship_to, '$.name'));
UPDATE pos_sales SET ship_to = json_set(ship_to, '$.address', upper(json_extract(ship_to, '$.address'))) WHERE json_valid(ship_to) AND json_type(ship_to, '$.address') = 'text' AND json_extract(ship_to, '$.address') IS NOT upper(json_extract(ship_to, '$.address'));
UPDATE pos_sales SET ship_to = json_set(ship_to, '$.city', upper(json_extract(ship_to, '$.city'))) WHERE json_valid(ship_to) AND json_type(ship_to, '$.city') = 'text' AND json_extract(ship_to, '$.city') IS NOT upper(json_extract(ship_to, '$.city'));
UPDATE pos_sales SET ship_to = json_set(ship_to, '$.state', upper(json_extract(ship_to, '$.state'))) WHERE json_valid(ship_to) AND json_type(ship_to, '$.state') = 'text' AND json_extract(ship_to, '$.state') IS NOT upper(json_extract(ship_to, '$.state'));
UPDATE pos_sales SET transport_details = json_set(transport_details, '$.transporter', upper(json_extract(transport_details, '$.transporter'))) WHERE json_valid(transport_details) AND json_type(transport_details, '$.transporter') = 'text' AND json_extract(transport_details, '$.transporter') IS NOT upper(json_extract(transport_details, '$.transporter'));
