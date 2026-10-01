import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
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
  };
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
  const found = repo.findByName(name);
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
    const barcode = skuEngineRepo.allocateBarcode();
    if (productRepo.barcodeExists(barcode)) {
      throw new AppError('Barcode collision — retry generate', 409);
    }
    return { barcode };
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

    const product = productRepo.create({
      ...input,
      createdBy: actor.user.id,
    });

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

    const updated = productRepo.update(id, input);

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
      'image_url', 'description', 'is_active', 'web_store_published',
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
      p.isActive ? 1 : 0, p.webStorePublished ? 1 : 0,
    ].map(escape).join(','));

    return `${headers.join(',')}\n${rows.join('\n')}`;
  }

  importCsv(csvText, actor, req) {
    authService.checkPermission(actor.permissions, 'products.products.create');
    if (!csvText?.trim()) throw new AppError('CSV content is required', 400);

    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) throw new AppError('CSV must include a header and at least one row', 400);

    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
    const required = ['sku', 'name'];
    for (const key of required) {
      if (!headers.includes(key)) {
        throw new AppError(`CSV missing required column: ${key}`, 400);
      }
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const values = parseLine(lines[i]);
      const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? '']));

      try {
        const categoryId = resolveLookupId(categoryRepo, {
          name: row.category,
          createIfMissing: Boolean(row.category),
          createdBy: actor.user.id,
        });
        const brandId = resolveLookupId(brandRepo, {
          name: row.brand,
          createIfMissing: Boolean(row.brand),
          createdBy: actor.user.id,
        });
        const unitId = resolveLookupId(unitRepo, {
          name: row.unit_name || row.unit,
          abbreviation: row.unit || row.unit_abbreviation || row.unit_name,
          createIfMissing: Boolean(row.unit || row.unit_name),
          createdBy: actor.user.id,
        });

        const payload = {
          name: row.name,
          sku: row.sku,
          barcode: row.barcode || null,
          categoryId,
          brandId,
          unitId,
          modelVariant: row.model_variant || row.variant || row.model || null,
          hsnCode: row.hsn_code || null,
          gstPercentage: row.gst_percentage,
          mrp: row.mrp,
          sellingPrice: row.selling_price,
          purchasePrice: row.purchase_price,
          reorderLevel: row.reorder_level,
          minimumStock: row.minimum_stock,
          imageUrl: row.image_url || null,
          description: row.description || null,
          isActive: row.is_active === undefined || row.is_active === '' ? true : !['0', 'false', 'no'].includes(String(row.is_active).toLowerCase()),
          webStorePublished: ['1', 'true', 'yes'].includes(String(row.web_store_published || '').toLowerCase()),
        };

        const existing = productRepo.findBySku(payload.sku);
        if (existing) {
          this.update(existing.id, payload, actor, req);
          results.updated += 1;
        } else {
          this.create(payload, actor, req);
          results.created += 1;
        }
      } catch (err) {
        results.errors.push({ row: i + 1, sku: row.sku || null, message: err.message });
      }
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'import',
      module: 'products',
      recordType: 'product',
      newValue: results,
      ...getRequestMeta(req),
    });

    return results;
  }
}

export const productService = new ProductService();
