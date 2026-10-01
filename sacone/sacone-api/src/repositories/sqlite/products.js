import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function mapLookup(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    abbreviation: row.abbreviation ?? undefined,
    description: row.description,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function parseAttributes(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore invalid JSON
  }
  return {};
}

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    brandId: row.brand_id,
    brandName: row.brand_name || null,
    unitId: row.unit_id,
    unitName: row.unit_name || null,
    unitAbbreviation: row.unit_abbreviation || null,
    modelVariant: row.model_variant || null,
    attributes: parseAttributes(row.attributes),
    hsnCode: row.hsn_code,
    gstPercentage: Number(row.gst_percentage || 0),
    mrp: Number(row.mrp || 0),
    sellingPrice: Number(row.selling_price || 0),
    purchasePrice: Number(row.purchase_price || 0),
    reorderLevel: Number(row.reorder_level || 0),
    minimumStock: Number(row.minimum_stock || 0),
    imageUrl: row.image_url,
    description: row.description,
    isActive: Boolean(row.is_active),
    webStorePublished: Boolean(row.web_store_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

const PRODUCT_SELECT = `
  SELECT p.*,
    c.name as category_name,
    b.name as brand_name,
    u.name as unit_name,
    u.abbreviation as unit_abbreviation
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN units u ON u.id = p.unit_id
`;

class LookupRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  findAll({ includeInactive = true } = {}) {
    const db = getDatabase();
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return db.prepare(`SELECT * FROM ${this.tableName} ${where} ORDER BY name ASC`).all().map(mapLookup);
  }

  findById(id) {
    const db = getDatabase();
    return mapLookup(db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id));
  }

  findByName(name) {
    const db = getDatabase();
    return mapLookup(
      db.prepare(`SELECT * FROM ${this.tableName} WHERE LOWER(name) = LOWER(?)`).get(name)
    );
  }

  nameExists(name, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare(`SELECT id FROM ${this.tableName} WHERE LOWER(name) = LOWER(?) AND id != ?`).get(name, excludeId)
      : db.prepare(`SELECT id FROM ${this.tableName} WHERE LOWER(name) = LOWER(?)`).get(name);
    return Boolean(row);
  }

  create({ name, code, description, abbreviation, createdBy }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();

    if (this.tableName === 'units') {
      db.prepare(`
        INSERT INTO units (id, name, abbreviation, description, is_active, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, name, abbreviation, description || null, now, now, createdBy || null);
    } else {
      db.prepare(`
        INSERT INTO ${this.tableName} (id, name, code, description, is_active, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, name, code || null, description || null, now, now, createdBy || null);
    }

    return this.findById(id);
  }

  update(id, data) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();

    if (this.tableName === 'units') {
      db.prepare(`
        UPDATE units SET
          name = ?, abbreviation = ?, description = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.name ?? existing.name,
        data.abbreviation ?? existing.abbreviation,
        data.description !== undefined ? data.description : existing.description,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        now,
        id
      );
    } else {
      db.prepare(`
        UPDATE ${this.tableName} SET
          name = ?, code = ?, description = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.name ?? existing.name,
        data.code !== undefined ? data.code : existing.code,
        data.description !== undefined ? data.description : existing.description,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        now,
        id
      );
    }

    return this.findById(id);
  }

  abbreviationExists(abbreviation, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM units WHERE LOWER(abbreviation) = LOWER(?) AND id != ?').get(abbreviation, excludeId)
      : db.prepare('SELECT id FROM units WHERE LOWER(abbreviation) = LOWER(?)').get(abbreviation);
    return Boolean(row);
  }

  codeExists(code, excludeId = null) {
    if (!code) return false;
    const db = getDatabase();
    const row = excludeId
      ? db.prepare(`SELECT id FROM ${this.tableName} WHERE UPPER(code) = UPPER(?) AND id != ?`).get(code, excludeId)
      : db.prepare(`SELECT id FROM ${this.tableName} WHERE UPPER(code) = UPPER(?)`).get(code);
    return Boolean(row);
  }

  allCodes(excludeId = null) {
    const db = getDatabase();
    const rows = excludeId
      ? db.prepare(`SELECT code FROM ${this.tableName} WHERE code IS NOT NULL AND code != '' AND id != ?`).all(excludeId)
      : db.prepare(`SELECT code FROM ${this.tableName} WHERE code IS NOT NULL AND code != ''`).all();
    return rows.map((r) => String(r.code).toUpperCase());
  }

  countProductsUsing(id) {
    const db = getDatabase();
    const column = this.tableName === 'categories' ? 'category_id'
      : this.tableName === 'brands' ? 'brand_id' : 'unit_id';
    return db.prepare(`SELECT COUNT(*) as count FROM products WHERE ${column} = ?`).get(id).count;
  }

  delete(id) {
    const db = getDatabase();
    db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return true;
  }
}

export class CategoryRepository extends LookupRepository {
  constructor() {
    super('categories');
  }
}

export class BrandRepository extends LookupRepository {
  constructor() {
    super('brands');
  }
}

export class UnitRepository extends LookupRepository {
  constructor() {
    super('units');
  }

  findByAbbreviation(abbreviation) {
    const db = getDatabase();
    return mapLookup(
      db.prepare('SELECT * FROM units WHERE LOWER(abbreviation) = LOWER(?)').get(abbreviation)
    );
  }
}

export class ProductRepository {
  findAll(filters = {}) {
    const db = getDatabase();
    const {
      search = '',
      barcode = '',
      sku = '',
      categoryId = '',
      brandId = '',
      isActive = null,
      webStorePublished = null,
      limit = 100,
      offset = 0,
    } = filters;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(
        LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.barcode, '')) LIKE ?
        OR LOWER(COALESCE(p.model_variant, '')) LIKE ?
        OR LOWER(COALESCE(p.attributes, '')) LIKE ?
      )`);
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like, like);
    }
    if (barcode) {
      conditions.push('LOWER(p.barcode) = LOWER(?)');
      params.push(barcode);
    }
    if (sku) {
      conditions.push('LOWER(p.sku) = LOWER(?)');
      params.push(sku);
    }
    if (categoryId) {
      conditions.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (brandId) {
      conditions.push('p.brand_id = ?');
      params.push(brandId);
    }
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      conditions.push('p.is_active = ?');
      params.push(isActive === true || isActive === '1' || isActive === 1 ? 1 : 0);
    }
    if (webStorePublished !== null && webStorePublished !== undefined && webStorePublished !== '') {
      conditions.push('p.web_store_published = ?');
      params.push(webStorePublished === true || webStorePublished === '1' || webStorePublished === 1 ? 1 : 0);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);

    const items = db.prepare(`
      ${PRODUCT_SELECT}
      ${where}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `).all(...params).map(mapProduct);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM products p ${where}
    `).get(...countParams).count;

    return { items, total, limit, offset };
  }

  findById(id) {
    const db = getDatabase();
    return mapProduct(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id));
  }

  findBySku(sku) {
    const db = getDatabase();
    return mapProduct(db.prepare(`${PRODUCT_SELECT} WHERE LOWER(p.sku) = LOWER(?)`).get(sku));
  }

  findByBarcode(barcode) {
    const db = getDatabase();
    return mapProduct(db.prepare(`${PRODUCT_SELECT} WHERE LOWER(p.barcode) = LOWER(?)`).get(barcode));
  }

  skuExists(sku, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?) AND id != ?').get(sku, excludeId)
      : db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?)').get(sku);
    return Boolean(row);
  }

  barcodeExists(barcode, excludeId = null) {
    if (!barcode) return false;
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM products WHERE LOWER(barcode) = LOWER(?) AND id != ? AND barcode IS NOT NULL AND barcode != \'\'').get(barcode, excludeId)
      : db.prepare('SELECT id FROM products WHERE LOWER(barcode) = LOWER(?) AND barcode IS NOT NULL AND barcode != \'\'').get(barcode);
    return Boolean(row);
  }

  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();

    const attributesJson = data.attributes && Object.keys(data.attributes).length
      ? JSON.stringify(data.attributes)
      : null;

    db.prepare(`
      INSERT INTO products (
        id, name, sku, barcode, category_id, brand_id, unit_id, model_variant, attributes, hsn_code, gst_percentage,
        mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description,
        is_active, web_store_published, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.sku,
      data.barcode || null,
      data.categoryId || null,
      data.brandId || null,
      data.unitId || null,
      data.modelVariant || null,
      attributesJson,
      data.hsnCode || null,
      Number(data.gstPercentage || 0),
      Number(data.mrp || 0),
      Number(data.sellingPrice || 0),
      Number(data.purchasePrice || 0),
      Number(data.reorderLevel || 0),
      Number(data.minimumStock || 0),
      data.imageUrl || null,
      data.description || null,
      data.isActive === false ? 0 : 1,
      data.webStorePublished ? 1 : 0,
      now,
      now,
      data.createdBy || null
    );

    return this.findById(id);
  }

  update(id, data) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();

    const attributesJson = data.attributes !== undefined
      ? (data.attributes && Object.keys(data.attributes).length ? JSON.stringify(data.attributes) : null)
      : (existing.attributes && Object.keys(existing.attributes).length ? JSON.stringify(existing.attributes) : null);

    db.prepare(`
      UPDATE products SET
        name = ?, sku = ?, barcode = ?, category_id = ?, brand_id = ?, unit_id = ?,
        model_variant = ?, attributes = ?, hsn_code = ?, gst_percentage = ?, mrp = ?, selling_price = ?, purchase_price = ?,
        reorder_level = ?, minimum_stock = ?, image_url = ?, description = ?,
        is_active = ?, web_store_published = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? existing.name,
      data.sku ?? existing.sku,
      data.barcode !== undefined ? (data.barcode || null) : existing.barcode,
      data.categoryId !== undefined ? (data.categoryId || null) : existing.categoryId,
      data.brandId !== undefined ? (data.brandId || null) : existing.brandId,
      data.unitId !== undefined ? (data.unitId || null) : existing.unitId,
      data.modelVariant !== undefined ? (data.modelVariant || null) : existing.modelVariant,
      attributesJson,
      data.hsnCode !== undefined ? data.hsnCode : existing.hsnCode,
      data.gstPercentage !== undefined ? Number(data.gstPercentage) : existing.gstPercentage,
      data.mrp !== undefined ? Number(data.mrp) : existing.mrp,
      data.sellingPrice !== undefined ? Number(data.sellingPrice) : existing.sellingPrice,
      data.purchasePrice !== undefined ? Number(data.purchasePrice) : existing.purchasePrice,
      data.reorderLevel !== undefined ? Number(data.reorderLevel) : existing.reorderLevel,
      data.minimumStock !== undefined ? Number(data.minimumStock) : existing.minimumStock,
      data.imageUrl !== undefined ? data.imageUrl : existing.imageUrl,
      data.description !== undefined ? data.description : existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.webStorePublished !== undefined ? (data.webStorePublished ? 1 : 0) : (existing.webStorePublished ? 1 : 0),
      now,
      id
    );

    return this.findById(id);
  }

  findSimilarByBrandAndName(brandId, name, { excludeId = null, limit = 5 } = {}) {
    const db = getDatabase();
    if (!brandId || !name?.trim()) return [];

    const normalized = String(name).toUpperCase().replace(/[^A-Z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const like = `%${normalized.split(/\s+/).slice(0, 4).join('%')}%`;

    const rows = db.prepare(`
      ${PRODUCT_SELECT}
      WHERE p.brand_id = ?
        ${excludeId ? 'AND p.id != ?' : ''}
        AND (
          UPPER(REPLACE(p.name, '  ', ' ')) = ?
          OR UPPER(p.name) LIKE ?
        )
      ORDER BY p.name ASC
      LIMIT ?
    `).all(...(excludeId ? [brandId, excludeId, normalized, like, limit] : [brandId, normalized, like, limit]));

    return rows.map(mapProduct);
  }

  isReferenced(id) {
    const db = getDatabase();
    const tables = [
      'stock_levels',
      'inventory_movements',
      'pos_sale_items',
      'pos_sales_return_items',
      'location_stock_levels',
      'warehouse_transfer_items',
      'stock_count_items',
    ];
    for (const table of tables) {
      try {
        const row = db.prepare(`SELECT 1 AS ok FROM ${table} WHERE product_id = ? LIMIT 1`).get(id);
        if (row) return true;
      } catch {
        // Table may not exist in older DBs
      }
    }
    return false;
  }

  delete(id) {
    const db = getDatabase();
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return true;
  }

  softDelete(id) {
    const now = nowIso();
    const db = getDatabase();
    db.prepare(`
      UPDATE products
      SET is_active = 0, web_store_published = 0, updated_at = ?
      WHERE id = ?
    `).run(now, id);
    return this.findById(id);
  }
}
