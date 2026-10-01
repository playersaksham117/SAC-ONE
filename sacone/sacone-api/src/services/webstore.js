import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const productRepo = repos.products;
const customerRepo = repos.customers;
const apiKeyRepo = repos.apiKeys;
const logRepo = repos.apiRequestLogs;
const provisionRepo = repos.webOrderProvisions;
const auditRepo = repos.auditLogs;

export const WEBSTORE_SCOPES = [
  'products.read',
  'inventory.read',
  'customers.read',
  'customers.write',
  'orders.provision',
];

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function stockStatus(available, reorderLevel, minimumStock) {
  const qty = Number(available || 0);
  if (qty <= 0) return 'Out of Stock';
  const threshold = Number(reorderLevel) > 0 ? Number(reorderLevel) : Number(minimumStock || 0);
  if (threshold > 0 && qty <= threshold) return 'Low Stock';
  return 'In Stock';
}

/** Public-safe product DTO — no purchase price / cost / internal fields */
function toWebProduct(row) {
  return {
    productId: row.id,
    productName: row.name,
    sku: row.sku,
    category: row.categoryName || null,
    brand: row.brandName || null,
    mrp: Number(row.mrp || 0),
    sellingPrice: Number(row.sellingPrice || 0),
    gst: Number(row.gstPercentage || 0),
    productImage: row.imageUrl || null,
    activeStatus: Boolean(row.isActive),
  };
}

function toWebCustomer(c) {
  return {
    customerId: c.id,
    customerCode: c.code,
    name: c.name,
    phone: c.phone,
    email: c.email,
    gstNumber: c.gstNumber,
    gstStateCode: c.gstStateCode,
    address: c.address,
    city: c.city,
    state: c.state,
    activeStatus: c.isActive,
    sourceChannel: c.sourceChannel,
  };
}

export class WebstoreService {
  // ── Products ───────────────────────────────────────────
  listProducts({ search = '', limit = 100, offset = 0 } = {}) {
    const result = productRepo.findAll({
      search,
      isActive: true,
      webStorePublished: true,
      limit: Math.min(parseInt(limit, 10) || 100, 500),
      offset: parseInt(offset, 10) || 0,
    });
    return {
      items: result.items.map(toWebProduct),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  getProduct(productId) {
    const product = productRepo.findById(productId);
    if (!product || !product.isActive || !product.webStorePublished) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    return toWebProduct(product);
  }

  // ── Inventory ──────────────────────────────────────────
  listInventory({ sku = '', productId = '', limit = 200, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = ['p.is_active = 1', 'p.web_store_published = 1'];
    const params = [];

    if (productId) {
      conditions.push('p.id = ?');
      params.push(productId);
    }
    if (sku) {
      conditions.push('LOWER(p.sku) = LOWER(?)');
      params.push(sku);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = Math.min(parseInt(limit, 10) || 200, 500);
    const off = parseInt(offset, 10) || 0;

    const rows = db.prepare(`
      SELECT
        p.id as product_id,
        p.sku,
        p.reorder_level,
        p.minimum_stock,
        COALESCE(SUM(s.quantity_available), 0) as available_quantity
      FROM products p
      LEFT JOIN stock_levels s ON s.product_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.sku ASC
      LIMIT ? OFFSET ?
    `).all(...params, lim, off);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM products p ${where}
    `).get(...params).count;

    return {
      items: rows.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        availableQuantity: Number(r.available_quantity || 0),
        stockStatus: stockStatus(r.available_quantity, r.reorder_level, r.minimum_stock),
      })),
      total,
      limit: lim,
      offset: off,
    };
  }

  // ── Customers (central master) ─────────────────────────
  searchCustomers(query, { limit = 20 } = {}) {
    const items = customerRepo.lookup(query, {
      limit: Math.min(parseInt(limit, 10) || 20, 50),
    }).filter((c) => !c.isWalkIn);
    return { items: items.map(toWebCustomer) };
  }

  getCustomer(customerId) {
    const customer = customerRepo.findById(customerId);
    if (!customer || !customer.isActive || customer.isWalkIn) {
      throw new AppError('Customer not found', 404, 'NOT_FOUND');
    }
    return toWebCustomer(customer);
  }

  createCustomer(data, apiKeyActor) {
    if (!data?.name?.trim()) throw new AppError('name is required', 400);
    // Reuse customer master create path via repo directly with web channel
    const code = (data.customerCode || data.code || customerRepo.nextCode()).trim().toUpperCase();
    if (customerRepo.codeExists(code)) {
      throw new AppError('Customer code already exists', 409, 'CONFLICT');
    }

    const customer = customerRepo.create({
      code,
      name: data.name.trim(),
      phone: data.phone,
      email: data.email,
      gstNumber: data.gstNumber,
      gstStateCode: data.gstStateCode,
      address: data.address,
      city: data.city,
      state: data.state,
      notes: data.notes,
      sourceChannel: 'web',
      creditLimit: 0,
      createdBy: null,
    });

    auditRepo.create({
      userId: null,
      userName: `api_key:${apiKeyActor?.name || apiKeyActor?.id}`,
      action: 'create',
      module: 'webstore',
      recordType: 'customer',
      recordId: customer.id,
      newValue: toWebCustomer(customer),
    });

    return toWebCustomer(customer);
  }

  updateCustomer(customerId, data, apiKeyActor) {
    const existing = customerRepo.findById(customerId);
    if (!existing || existing.isWalkIn) {
      throw new AppError('Customer not found', 404, 'NOT_FOUND');
    }

    // Only profile fields — never outstanding, credit limit, walk-in, or financial flags
    const allowed = {
      name: data.name,
      phone: data.phone,
      email: data.email,
      gstNumber: data.gstNumber,
      gstStateCode: data.gstStateCode,
      address: data.address,
      city: data.city,
      state: data.state,
      notes: data.notes,
    };

    const updated = customerRepo.update(customerId, allowed);
    auditRepo.create({
      userId: null,
      userName: `api_key:${apiKeyActor?.name || apiKeyActor?.id}`,
      action: 'update',
      module: 'webstore',
      recordType: 'customer',
      recordId: customerId,
      previousValue: toWebCustomer(existing),
      newValue: toWebCustomer(updated),
    });
    return toWebCustomer(updated);
  }

  /**
   * Future order provision — validates contract & customer, stores provision record.
   * Does NOT reserve stock or create inventory movements.
   */
  provisionOrder(body, apiKeyActor) {
    if (!body || typeof body !== 'object') {
      throw new AppError('Request body is required', 400);
    }

    const externalOrderRef = body.externalOrderRef || body.orderRef || null;
    const customerId = body.customerId;
    if (!customerId) throw new AppError('customerId is required', 400);

    const customer = customerRepo.findById(customerId);
    if (!customer || !customer.isActive || customer.isWalkIn) {
      throw new AppError('Invalid customerId', 400, 'INVALID_CUSTOMER');
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AppError('items array is required', 400);
    }

    const normalizedItems = [];
    for (const [index, item] of body.items.entries()) {
      if (!item.productId && !item.sku) {
        throw new AppError(`items[${index}]: productId or sku is required`, 400);
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new AppError(`items[${index}]: quantity must be positive`, 400);
      }

      let product = item.productId ? productRepo.findById(item.productId) : null;
      if (!product && item.sku) product = productRepo.findBySku(item.sku);
      if (!product || !product.isActive || !product.webStorePublished) {
        throw new AppError(`items[${index}]: product not available for web store`, 400, 'INVALID_PRODUCT');
      }

      normalizedItems.push({
        productId: product.id,
        sku: product.sku,
        quantity: qty,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : product.sellingPrice,
      });
    }

    const payload = {
      externalOrderRef,
      customerId,
      currency: body.currency || 'INR',
      shippingAddress: body.shippingAddress || null,
      billingAddress: body.billingAddress || null,
      notes: body.notes || null,
      items: normalizedItems,
      intendedFlow: [
        'customer_validation',
        'order_creation',
        'stock_reservation',
        'inventory_movement',
      ],
    };

    const provision = provisionRepo.create({
      apiKeyId: apiKeyActor.id,
      customerId,
      externalOrderRef,
      payload,
      status: 'received',
      notes: 'Provision accepted for future fulfillment. Stock not reserved.',
    });

    return {
      provisionId: provision.id,
      provisionNumber: provision.provisionNumber,
      status: provision.status,
      fulfillmentStatus: 'pending_future_release',
      stockReserved: false,
      inventoryMovementCreated: false,
      message: 'Order provision recorded. Full order management and stock reservation are not enabled in this phase.',
      customer: toWebCustomer(customer),
      items: normalizedItems,
      intendedFlow: payload.intendedFlow,
      createdAt: provision.createdAt,
    };
  }

  // ── Admin: API keys & logs ─────────────────────────────
  listApiKeys(actor) {
    authService.checkPermission(actor.permissions, 'webstore.api_settings.view');
    return apiKeyRepo.list({ includeInactive: true });
  }

  createApiKey(data, actor, req) {
    authService.checkPermission(actor.permissions, 'webstore.api_settings.edit');
    if (!data?.name?.trim()) throw new AppError('API key name is required', 400);

    let scopes = Array.isArray(data.scopes) ? data.scopes : WEBSTORE_SCOPES;
    scopes = scopes.filter((s) => WEBSTORE_SCOPES.includes(s) || s === '*');
    if (!scopes.length) scopes = [...WEBSTORE_SCOPES];

    const created = apiKeyRepo.create({
      name: data.name.trim(),
      scopes,
      notes: data.notes,
      createdBy: actor.user.id,
      expiresAt: data.expiresAt || null,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'webstore',
      recordType: 'api_key',
      recordId: created.id,
      newValue: { id: created.id, name: created.name, keyPrefix: created.keyPrefix, scopes: created.scopes },
      ...getRequestMeta(req),
    });

    return created;
  }

  revokeApiKey(id, actor, req) {
    authService.checkPermission(actor.permissions, 'webstore.api_settings.edit');
    const existing = apiKeyRepo.findById(id);
    if (!existing) throw new AppError('API key not found', 404);
    const revoked = apiKeyRepo.revoke(id);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'revoke',
      module: 'webstore',
      recordType: 'api_key',
      recordId: id,
      previousValue: existing,
      newValue: revoked,
      ...getRequestMeta(req),
    });
    return revoked;
  }

  listApiLogs(filters, actor) {
    authService.checkPermission(actor.permissions, 'webstore.api_settings.view');
    return logRepo.list({
      apiKeyId: filters.apiKeyId || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getScopes() {
    return WEBSTORE_SCOPES;
  }
}

export const webstoreService = new WebstoreService();
