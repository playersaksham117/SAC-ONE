import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { periodFrom, periodText } from '../core/warranty.js';
import {
  generateSku,
  ensureUniqueSku,
  nameSimilarity,
  suggestBrandCode,
  skuEngineRepo,
} from './sku-engine.js';

const categoryRepo = repos.categories;
const brandRepo = repos.brands;
const unitRepo = repos.units;
const productRepo = repos.products;
const auditRepo = repos.auditLogs;

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pricesChanged(previous, next) {
  return (
    previous.mrp !== next.mrp
    || previous.sellingPrice !== next.sellingPrice
    || previous.purchasePrice !== next.purchasePrice
    || previous.gstPercentage !== next.gstPercentage
  );
}

function priceSnapshot(product) {
  return {
    mrp: product.mrp,
    sellingPrice: product.sellingPrice,
    purchasePrice: product.purchasePrice,
    gstPercentage: product.gstPercentage,
  };
}

function createLookupService(repo, {
  permissionPrefix,
  recordType,
  module = 'products',
  requireAbbreviation = false,
}) {
  return {
    list(actor, options) {
      authService.checkPermission(actor.permissions, `${permissionPrefix}.view`);
      return repo.findAll(options);
    },

    getById(id, actor) {
      authService.checkPermission(actor.permissions, `${permissionPrefix}.view`);
      const item = repo.findById(id);
      if (!item) throw new AppError(`${recordType} not found`, 404);
      return item;
    },

    create(data, actor, req) {
      authService.checkPermission(actor.permissions, `${permissionPrefix}.create`);
      if (!data.name?.trim()) throw new AppError('Name is required', 400);
      if (requireAbbreviation && !data.abbreviation?.trim()) {
        throw new AppError('Abbreviation is required', 400);
      }
      if (repo.nameExists(data.name.trim())) {
        throw new AppError('Name already exists', 409);
      }
      if (requireAbbreviation && repo.abbreviationExists(data.abbreviation.trim())) {
        throw new AppError('Abbreviation already exists', 409);
      }

      const item = repo.create({
        name: data.name.trim(),
        code: data.code?.trim() || null,
        description: data.description || null,
        abbreviation: data.abbreviation?.trim() || null,
        createdBy: actor.user.id,
      });

      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'create',
        module,
        recordType,
        recordId: item.id,
        newValue: item,
        ...getRequestMeta(req),
      });

      return item;
    },

    update(id, data, actor, req) {
      authService.checkPermission(actor.permissions, `${permissionPrefix}.edit`);
      const existing = repo.findById(id);
      if (!existing) throw new AppError(`${recordType} not found`, 404);

      if (data.name && repo.nameExists(data.name.trim(), id)) {
        throw new AppError('Name already exists', 409);
      }
      if (requireAbbreviation && data.abbreviation && repo.abbreviationExists(data.abbreviation.trim(), id)) {
        throw new AppError('Abbreviation already exists', 409);
      }

      const updated = repo.update(id, {
        name: data.name?.trim(),
        code: data.code,
        description: data.description,
        abbreviation: data.abbreviation?.trim(),
        isActive: data.isActive,
      });

      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'update',
        module,
        recordType,
        recordId: id,
        previousValue: existing,
        newValue: updated,
        ...getRequestMeta(req),
      });

      return updated;
    },

    delete(id, actor, req) {
      authService.checkPermission(actor.permissions, `${permissionPrefix}.delete`);
      const existing = repo.findById(id);
      if (!existing) throw new AppError(`${recordType} not found`, 404);

      const usage = repo.countProductsUsing(id);
      if (usage > 0) {
        throw new AppError(`${recordType} is used by ${usage} product(s) and cannot be deleted`, 400);
      }

      repo.delete(id);

      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'delete',
        module,
        recordType,
        recordId: id,
        previousValue: existing,
        ...getRequestMeta(req),
      });

      return { success: true };
    },
  };
}

export const categoryService = createLookupService(categoryRepo, {
  permissionPrefix: 'products.categories',
  recordType: 'category',
});

const baseBrandService = createLookupService(brandRepo, {
  permissionPrefix: 'products.brands',
  recordType: 'brand',
});

export const brandService = {
  ...baseBrandService,

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'products.brands.create');
    if (!data.name?.trim()) throw new AppError('Name is required', 400);
    if (brandRepo.nameExists(data.name.trim())) {
      throw new AppError('Name already exists', 409);
    }

    let code = data.code?.trim()?.toUpperCase() || null;
    if (!code) {
      const used = new Set(brandRepo.allCodes());
      code = suggestBrandCode(data.name.trim(), used);
    } else if (brandRepo.codeExists(code)) {
      throw new AppError('Brand code already exists', 409);
    }

    const item = brandRepo.create({
      name: data.name.trim(),
      code,
      description: data.description || null,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'products',
      recordType: 'brand',
      recordId: item.id,
      newValue: item,
      ...getRequestMeta(req),
    });

    return item;
  },

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'products.brands.edit');
    const existing = brandRepo.findById(id);
    if (!existing) throw new AppError('brand not found', 404);

    if (data.name && brandRepo.nameExists(data.name.trim(), id)) {
      throw new AppError('Name already exists', 409);
    }

    let code = data.code !== undefined ? (data.code?.trim()?.toUpperCase() || null) : existing.code;
    if (code && brandRepo.codeExists(code, id)) {
      throw new AppError('Brand code already exists', 409);
    }
    if (!code) {
      const used = new Set(brandRepo.allCodes(id));
      code = suggestBrandCode(data.name?.trim() || existing.name, used);
    }

    const updated = brandRepo.update(id, {
      name: data.name?.trim(),
      code,
      description: data.description,
      isActive: data.isActive,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'products',
      recordType: 'brand',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  },
};

export const unitService = createLookupService(unitRepo, {
  permissionPrefix: 'products.units',
  recordType: 'unit',
  requireAbbreviation: true,
});

function normalizeProductInput(data, { preserveSku = null } = {}) {
  return {
    name: data.name?.trim(),
    sku: preserveSku ?? data.sku?.trim(),
    barcode: data.barcode?.trim() || null,
    categoryId: data.categoryId || null,
    brandId: data.brandId || null,
    unitId: data.unitId || null,
    modelVariant: data.modelVariant?.trim() || data.variant?.trim() || data.model?.trim() || null,
    hsnCode: data.hsnCode?.trim() || null,
    gstPercentage: toNumber(data.gstPercentage),
    mrp: toNumber(data.mrp),
    sellingPrice: toNumber(data.sellingPrice),
    purchasePrice: toNumber(data.purchasePrice),
    reorderLevel: toNumber(data.reorderLevel),
    minimumStock: toNumber(data.minimumStock),
    imageUrl: data.imageUrl?.trim() || null,
    description: data.description || null,
    isActive: data.isActive !== false && data.isActive !== 0 && data.isActive !== '0',
    webStorePublished: Boolean(data.webStorePublished === true || data.webStorePublished === 1 || data.webStorePublished === '1'),
    itemType: itemTypeOf(data.itemType),
  };
}

/** 'goods' | 'service' | undefined (not given: keep what it was / default goods). */
function itemTypeOf(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const v = String(value).toLowerCase();
  if (v === 'service' || v === 'services') return 'service';
  if (v === 'goods' || v === 'product' || v === 'products') return 'goods';
  throw new AppError('Type must be goods or service', 400);
}

function validateProductRefs(input) {
  if (input.categoryId && !categoryRepo.findById(input.categoryId)) {
    throw new AppError('Invalid category', 400);
  }
  if (input.brandId && !brandRepo.findById(input.brandId)) {
    throw new AppError('Invalid brand', 400);
  }
  if (input.unitId && !unitRepo.findById(input.unitId)) {
    throw new AppError('Invalid unit', 400);
  }
}

function resolveLookupId(repo, { id, name, createIfMissing = false, abbreviation = null, createdBy = null }) {
  if (id) {
    const existing = repo.findById(id);
    if (!existing) throw new AppError('Invalid lookup reference', 400);
    return existing.id;
  }
  if (!name) return null;
  const found = repo.findByName(name)
    // Units are also known by their abbreviation (a CSV says "KG" for the unit "Kilogram").
    || (repo.findByAbbreviation && (repo.findByAbbreviation(abbreviation || name) || repo.findByAbbreviation(name)));
  if (found) return found.id;
  if (!createIfMissing) return null;
  const created = repo.create({
    name: name.trim(),
    abbreviation: abbreviation || name.trim().slice(0, 5).toUpperCase(),
    createdBy,
  });
  return created.id;
}

function resolveBrandForSku(brandId) {
  if (!brandId) return { brandName: '', brandCode: 'BR' };
  const brand = brandRepo.findById(brandId);
  if (!brand) throw new AppError('Invalid brand', 400);
  let brandCode = brand.code?.trim()?.toUpperCase();
  if (!brandCode) {
    const used = new Set(brandRepo.allCodes(brand.id));
    brandCode = suggestBrandCode(brand.name, used);
    brandRepo.update(brand.id, { code: brandCode });
  }
  return { brandName: brand.name, brandCode };
}

/**
 * Warranty / guarantee from the form ({ warrantyValue, warrantyUnit, … }) or a CSV
 * ("1 year" in warranty / guarantee). Only the periods that were sent are returned.
 */
function periodsFrom(data) {
  const out = {};
  if (data.warrantyValue !== undefined || data.warranty !== undefined) {
    out.warranty = periodFrom(data.warrantyValue ?? data.warranty, data.warrantyUnit, 'Warranty');
  }
  if (data.guaranteeValue !== undefined || data.guarantee !== undefined) {
    out.guarantee = periodFrom(data.guaranteeValue ?? data.guarantee, data.guaranteeUnit, 'Guarantee');
  }
  return Object.keys(out).length ? out : null;
}

/** Short description (one line, ≤ 150 characters); undefined when not sent. */
function shortDescriptionFrom(data) {
  const raw = data.shortDescription ?? data.short_description;
  if (raw === undefined) return undefined;
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > 150) throw new AppError('Short description: keep it to one line (150 characters)', 400);
  return text || null;
}

export class ProductService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    return productRepo.findAll({
      ...filters,
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    const product = productRepo.findById(id);
    if (!product) throw new AppError('Product not found', 404);
    return {
      ...product,
      skuLocked: productRepo.isReferenced(id),
    };
  }

  searchByBarcode(barcode, actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    if (!barcode) throw new AppError('Barcode is required', 400);
    const product = productRepo.findByBarcode(barcode);
    if (!product) throw new AppError('Product not found for barcode', 404);
    return product;
  }

  searchBySku(sku, actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    if (!sku) throw new AppError('SKU is required', 400);
    const product = productRepo.findBySku(sku);
    if (!product) throw new AppError('Product not found for SKU', 404);
    return product;
  }

  previewGenerateSku(data, actor) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    if (!data.name?.trim()) throw new AppError('Product name is required', 400);

    const category = data.categoryId ? categoryRepo.findById(data.categoryId) : null;
    const { brandName, brandCode } = data.brandId
      ? resolveBrandForSku(data.brandId)
      : { brandName: '', brandCode: 'BR' };

    const dbFamilies = skuEngineRepo.listFamilyCodes();
    const generated = generateSku({
      productName: data.name,
      brandName,
      brandCode,
      categoryName: category?.name,
      modelVariant: data.modelVariant || data.variant || data.model || null,
      dbFamilies,
    });

    const unique = ensureUniqueSku(
      generated.sku,
      (sku, excludeId) => productRepo.skuExists(sku, excludeId || data.excludeProductId || null)
    );

    return {
      ...generated,
      sku: unique.sku,
      suffixed: unique.suffixed,
      suffix: unique.suffix || null,
    };
  }

  generateBarcode(actor) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    return { barcode: skuEngineRepo.peekNextBarcode() };
  }

  checkDuplicate(data, actor) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    if (!data.name?.trim() || !data.brandId) {
      return { duplicates: [], possibleDuplicate: false };
    }

    const candidates = productRepo.findSimilarByBrandAndName(
      data.brandId,
      data.name,
      { excludeId: data.excludeProductId || null, limit: 10 }
    );

    const duplicates = candidates.filter((p) => nameSimilarity(p.name, data.name) >= 0.85);

    return {
      possibleDuplicate: duplicates.length > 0,
      duplicates,
    };
  }

  listFamilyCodes(actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    return skuEngineRepo.listFamilyCodes({ includeInactive: true });
  }

  createFamilyCode(data, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.edit');
    if (!data.keyword?.trim() || !data.code?.trim()) {
      throw new AppError('Keyword and code are required', 400);
    }
    if (skuEngineRepo.findFamilyByKeyword(data.keyword.trim())) {
      throw new AppError('Family keyword already exists', 409);
    }
    if (skuEngineRepo.codeExists(data.code.trim())) {
      throw new AppError('Family code already exists', 409);
    }
    return skuEngineRepo.createFamilyCode({
      keyword: data.keyword.trim(),
      code: data.code.trim().toUpperCase(),
      priority: toNumber(data.priority, 0),
      createdBy: actor.user.id,
    });
  }

  updateFamilyCode(id, data, actor) {
    authService.checkPermission(actor.permissions, 'products.products.edit');
    const existing = skuEngineRepo.findFamilyById(id);
    if (!existing) throw new AppError('Family code not found', 404);
    if (data.code && skuEngineRepo.codeExists(data.code, id)) {
      throw new AppError('Family code already exists', 409);
    }
    return skuEngineRepo.updateFamilyCode(id, {
      keyword: data.keyword?.trim(),
      code: data.code?.trim()?.toUpperCase(),
      priority: data.priority,
      isActive: data.isActive,
    });
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    const input = normalizeProductInput(data);

    if (!input.name) throw new AppError('Product name is required', 400);
    if (!input.sku) {
      const preview = this.previewGenerateSku({
        name: input.name,
        brandId: input.brandId,
        categoryId: input.categoryId,
        modelVariant: input.modelVariant,
      }, actor);
      input.sku = preview.sku;
    }
    if (productRepo.skuExists(input.sku)) {
      throw new AppError('SKU already exists', 409);
    }
    if (input.barcode && productRepo.barcodeExists(input.barcode)) {
      throw new AppError('Barcode already exists', 409);
    }

    validateProductRefs(input);

    const periods = periodsFrom(data);
    let product = productRepo.create({
      ...input,
      createdBy: actor.user.id,
    });
    if (periods) product = productRepo.setPeriods(product.id, periods);
    const shortDesc = shortDescriptionFrom(data);
    if (shortDesc !== undefined) product = productRepo.setShortDescription(product.id, shortDesc);
    skuEngineRepo.recordBarcodeUsed(product.barcode);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'products',
      recordType: 'product',
      recordId: product.id,
      newValue: product,
      ...getRequestMeta(req),
    });

    return product;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.edit');
    const existing = productRepo.findById(id);
    if (!existing) throw new AppError('Product not found', 404);

    const skuLocked = productRepo.isReferenced(id);
    const input = normalizeProductInput(
      { ...existing, ...data },
      { preserveSku: skuLocked ? existing.sku : undefined }
    );

    if (!input.name) throw new AppError('Product name is required', 400);
    if (!input.sku) throw new AppError('SKU is required', 400);
    if (input.itemType === 'service' && existing.itemType !== 'service') {
      const onHand = productRepo.stockOnHand(id);
      if (Math.abs(onHand) > 0.000001) {
        throw new AppError(`${existing.name} still has ${onHand} in stock. Bring its stock to zero (adjust or return it) before making it a service.`, 400, 'HAS_STOCK');
      }
    }
    if (skuLocked && data.sku && data.sku.trim() !== existing.sku) {
      throw new AppError('SKU cannot be changed — product is used in transactions or stock', 400);
    }
    if (productRepo.skuExists(input.sku, id)) {
      throw new AppError('SKU already exists', 409);
    }
    if (input.barcode && productRepo.barcodeExists(input.barcode, id)) {
      throw new AppError('Barcode already exists', 409);
    }

    validateProductRefs(input);

    const periods = periodsFrom(data);
    let updated = productRepo.update(id, input);
    if (periods) updated = productRepo.setPeriods(id, periods);
    const shortDesc = shortDescriptionFrom(data);
    if (shortDesc !== undefined) updated = productRepo.setShortDescription(id, shortDesc);
    skuEngineRepo.recordBarcodeUsed(updated?.barcode);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'products',
      recordType: 'product',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });

    if (pricesChanged(existing, updated)) {
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'price_change',
        module: 'products',
        recordType: 'product',
        recordId: id,
        previousValue: priceSnapshot(existing),
        newValue: priceSnapshot(updated),
        ...getRequestMeta(req),
      });
    }

    if (existing.isActive && !updated.isActive) {
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'deactivate',
        module: 'products',
        recordType: 'product',
        recordId: id,
        previousValue: { isActive: true },
        newValue: { isActive: false },
        ...getRequestMeta(req),
      });
    }

    return updated;
  }

  deactivate(id, actor, req) {
    return this.update(id, { isActive: false }, actor, req);
  }

  activate(id, actor, req) {
    return this.update(id, { isActive: true }, actor, req);
  }

  delete(id, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.delete');
    const existing = productRepo.findById(id);
    if (!existing) throw new AppError('Product not found', 404);

    let softDeleted = false;
    if (productRepo.isReferenced(id)) {
      productRepo.softDelete(id);
      softDeleted = true;
    } else {
      productRepo.delete(id);
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: softDeleted ? 'soft_delete' : 'delete',
      module: 'products',
      recordType: 'product',
      recordId: id,
      previousValue: existing,
      ...getRequestMeta(req),
    });

    return {
      success: true,
      softDeleted,
      message: softDeleted
        ? 'Product is linked to stock/sales — deactivated instead of permanently deleted'
        : 'Product deleted',
    };
  }

  bulkDelete(ids, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.delete');
    if (!Array.isArray(ids) || !ids.length) {
      throw new AppError('Select at least one product', 400);
    }

    const results = [];
    for (const id of ids) {
      try {
        results.push({ id, ...this.delete(id, actor, req) });
      } catch (err) {
        results.push({
          id,
          success: false,
          error: err instanceof AppError ? err.message : 'Delete failed',
        });
      }
    }

    const deleted = results.filter((r) => r.success && !r.softDeleted).length;
    const softDeleted = results.filter((r) => r.success && r.softDeleted).length;
    const failed = results.filter((r) => !r.success).length;

    return { deleted, softDeleted, failed, results };
  }

  bulkUpdate(ids, patch, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.edit');
    if (!Array.isArray(ids) || !ids.length) {
      throw new AppError('Select at least one product', 400);
    }

    const allowed = {};
    const fields = [
      'categoryId', 'brandId', 'unitId', 'gstPercentage',
      'reorderLevel', 'minimumStock', 'isActive', 'webStorePublished',
    ];
    for (const key of fields) {
      if (patch?.[key] !== undefined) allowed[key] = patch[key];
    }
    if (!Object.keys(allowed).length) {
      throw new AppError('No bulk fields to update', 400);
    }

    const updated = [];
    const failed = [];
    for (const id of ids) {
      try {
        updated.push(this.update(id, allowed, actor, req));
      } catch (err) {
        failed.push({
          id,
          error: err instanceof AppError ? err.message : 'Update failed',
        });
      }
    }

    return { updated: updated.length, failed: failed.length, items: updated, errors: failed };
  }

  exportCsv(actor) {
    authService.checkPermission(actor.permissions, 'products.products.view');
    const { items } = productRepo.findAll({ limit: 10000, offset: 0 });

    const headers = [
      'sku', 'name', 'barcode', 'category', 'brand', 'unit', 'model_variant', 'hsn_code', 'gst_percentage',
      'mrp', 'selling_price', 'purchase_price', 'reorder_level', 'minimum_stock',
      'image_url', 'description', 'is_active', 'web_store_published', 'item_type', 'warranty', 'guarantee',
    ];

    const escape = (value) => {
      const str = value == null ? '' : String(value);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const rows = items.map((p) => [
      p.sku, p.name, p.barcode || '', p.categoryName || '', p.brandName || '', p.unitAbbreviation || p.unitName || '',
      p.modelVariant || '',
      p.hsnCode || '', p.gstPercentage, p.mrp, p.sellingPrice, p.purchasePrice,
      p.reorderLevel, p.minimumStock, p.imageUrl || '', p.description || '',
      p.isActive ? 1 : 0, p.webStorePublished ? 1 : 0, p.itemType === 'service' ? 'service' : 'product',
      periodText(p.warrantyValue, p.warrantyUnit).toLowerCase(), periodText(p.guaranteeValue, p.guaranteeUnit).toLowerCase(),
    ].map(escape).join(','));

    return `${headers.join(',')}\n${rows.join('\n')}`;
  }

  /**
   * Import products from CSV (Excel "CSV UTF-8"; comma, semicolon or tab separated).
   * - A row is matched to an existing product by SKU, else (no SKU given) by name.
   * - Names are unique: a row whose name belongs to another product, or repeats an earlier row
   *   of the file, is skipped (case, extra spaces and line breaks don't make a name different).
   * - Updating: blank cells keep what the product has (a short sheet never wipes prices / brand).
   * - Prices like "₹1,200.50" and GST like "18%" are read; any other text in a number column is an error.
   * - dryRun: everything is checked exactly as a real import, then rolled back (nothing is saved).
   * Returns { dryRun, created, updated, skipped: [{row,name,sku,message}], errors: [...], rows: [{row,name,sku,action}] }.
   */
  importCsv(csvText, actor, req, { dryRun = false } = {}) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    if (!csvText?.trim()) throw new AppError('CSV content is required', 400);

    const table = parseCsvTable(csvText);
    if (table.length < 2) throw new AppError('CSV must include a header and at least one row', 400);

    // "Selling Price", "selling-price" and "selling_price" all mean selling_price; "Product Name" → name.
    const HEADER_ALIASES = { product_name: 'name', item_name: 'name', product: 'name', item: 'name', item_code: 'sku', product_code: 'sku', code: 'sku', gst: 'gst_percentage', gst_rate: 'gst_percentage', 'gst_%': 'gst_percentage', price: 'selling_price', sale_price: 'selling_price', cost_price: 'purchase_price' };
    const headers = table[0].map((h) => {
      const k = String(h).toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[()]/g, '');
      return HEADER_ALIASES[k] || k;
    });
    if (!headers.includes('name')) throw new AppError('CSV missing required column: name', 400);

    const db = getDatabase();
    const nameKey = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    // every product in this firm, by its name, to stop duplicates (kept current while importing)
    const byName = new Map();
    for (const p of db.prepare('SELECT id, name, sku, is_active AS isActive FROM products').all()) {
      if (!byName.has(nameKey(p.name))) byName.set(nameKey(p.name), p);
    }

    const results = { dryRun: Boolean(dryRun), created: 0, updated: 0, skipped: [], errors: [], rows: [] };
    const seenName = new Map();
    const seenSku = new Map();
    const ROLLBACK = Symbol('dry run');

    const num = (row, col, label) => {
      const raw = row[col];
      if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
      const cleaned = String(raw).replace(/₹|rs\.?|inr|%|,|\s/gi, '');
      const n = Number(cleaned);
      if (!Number.isFinite(n)) throw new AppError(`${label} "${raw}" is not a number`, 400);
      if (n < 0) throw new AppError(`${label} cannot be negative`, 400);
      return n;
    };
    const text = (row, ...cols) => {
      for (const c of cols) if (row[c] !== undefined && String(row[c]).trim() !== '') return String(row[c]).trim();
      return undefined;
    };
    const yesNo = (v) => (v === undefined ? undefined : !['0', 'false', 'no', 'n', 'inactive'].includes(String(v).toLowerCase()));

    const runAll = db.transaction(() => {
      for (let i = 1; i < table.length; i += 1) {
        const cells = table[i];
        if (!cells.some((c) => String(c).trim())) continue;
        const rowNo = i + 1;
        const row = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
        const name = String(row.name || '').replace(/\s+/g, ' ').trim();
        const sku = String(row.sku || '').trim();
        const note = (list, message) => {
          list.push({ row: rowNo, name: name || null, sku: sku || null, message });
          results.rows.push({ row: rowNo, name, sku, action: list === results.skipped ? 'skip' : 'error', message });
        };

        if (!name) { note(results.errors, 'Name is missing'); continue; }
        const key = nameKey(name);
        if (seenName.has(key)) { note(results.skipped, `Same name as row ${seenName.get(key)} of this file`); continue; }
        if (sku && seenSku.has(sku.toLowerCase())) { note(results.skipped, `Same SKU as row ${seenSku.get(sku.toLowerCase())} of this file`); continue; }

        const bySku = sku ? productRepo.findBySku(sku) : null;
        const sameName = byName.get(key);
        let target = null;
        if (bySku) {
          if (sameName && sameName.id !== bySku.id) {
            note(results.skipped, `Name "${sameName.name}" already belongs to SKU ${sameName.sku}`);
            continue;
          }
          target = bySku;
        } else if (sameName) {
          if (sku) {
            note(results.skipped, `"${sameName.name}" already exists as SKU ${sameName.sku}${sameName.isActive ? '' : ' (inactive)'}; use that SKU to update it`);
            continue;
          }
          target = productRepo.findById(sameName.id);
        }
        seenName.set(key, rowNo);
        if (sku) seenSku.set(sku.toLowerCase(), rowNo);

        try {
          // each row on its own savepoint: a failing row leaves nothing half-saved
          const saved = db.transaction(() => {
            const lookup = (repo, nameVal, abbr) => (nameVal
              ? resolveLookupId(repo, { name: nameVal, abbreviation: abbr, createIfMissing: true, createdBy: actor.user.id })
              : undefined);
            const unitName = text(row, 'unit_name', 'unit');
            const itemType = text(row, 'item_type', 'type');
            const fields = {
              name,
              sku: sku || undefined,
              barcode: text(row, 'barcode'),
              categoryId: lookup(categoryRepo, text(row, 'category')),
              brandId: lookup(brandRepo, text(row, 'brand')),
              unitId: lookup(unitRepo, unitName, text(row, 'unit', 'unit_abbreviation', 'unit_name')),
              modelVariant: text(row, 'model_variant', 'variant', 'model'),
              hsnCode: text(row, 'hsn_code', 'hsn', 'sac', 'hsn_sac'),
              itemType: itemType === undefined ? undefined : (/^serv/i.test(itemType) ? 'service' : 'goods'),
              gstPercentage: num(row, 'gst_percentage', 'GST %'),
              mrp: num(row, 'mrp', 'MRP'),
              sellingPrice: num(row, 'selling_price', 'Selling price'),
              purchasePrice: num(row, 'purchase_price', 'Purchase price'),
              reorderLevel: num(row, 'reorder_level', 'Reorder level'),
              minimumStock: num(row, 'minimum_stock', 'Minimum stock'),
              imageUrl: text(row, 'image_url'),
              description: text(row, 'description'),
              isActive: yesNo(text(row, 'is_active', 'active')),
              webStorePublished: text(row, 'web_store_published') === undefined ? undefined : yesNo(text(row, 'web_store_published')),
              warranty: text(row, 'warranty'),
              guarantee: text(row, 'guarantee'),
            };
            if (fields.gstPercentage !== undefined && fields.gstPercentage > 100) throw new AppError('GST % must be 0 to 100', 400);
            // only what the sheet gives: blank cells keep the product's values
            const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
            if (target) return { action: 'update', product: this.update(target.id, payload, actor, req), before: target };
            return { action: 'create', product: this.create({ isActive: true, ...payload }, actor, req) };
          })();

          if (saved.before) byName.delete(nameKey(saved.before.name));
          byName.set(nameKey(saved.product.name), { id: saved.product.id, name: saved.product.name, sku: saved.product.sku, isActive: saved.product.isActive });
          if (saved.action === 'create') results.created += 1; else results.updated += 1;
          results.rows.push({ row: rowNo, name, sku: saved.product.sku, action: saved.action });
        } catch (err) {
          seenName.delete(key);
          note(results.errors, err.message);
        }
      }
      if (dryRun) throw ROLLBACK;
    });

    try {
      runAll();
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }

    if (!dryRun) {
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'import',
        module: 'products',
        recordType: 'product',
        newValue: { created: results.created, updated: results.updated, skipped: results.skipped.length, errors: results.errors },
        ...getRequestMeta(req),
      });
    }

    return results;
  }
}

/**
 * Split CSV text into rows of cells: quoted cells may hold commas, quotes ("") and line breaks.
 * The separator (comma, semicolon or tab) is taken from the header line.
 */
function parseCsvTable(csvText) {
  const src = String(csvText).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'));
  const count = (ch) => firstLine.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter((r, idx) => idx === 0 || r.some((c) => c !== ''));
}

export const productService = new ProductService();
