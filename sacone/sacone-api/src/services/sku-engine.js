import { getDatabase } from '../database/connection.js';
import { generateId, nowIso } from '../core/utils.js';
import {
  DEFAULT_FAMILY_CODES,
  DESCRIPTOR_RULES,
  KNOWN_BRAND_CODES,
} from './sku-engine-config.js';

function normalizeText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueCode(base, usedCodes) {
  let code = base;
  let n = 2;
  while (usedCodes.has(code)) {
    code = `${base}${n}`;
    n += 1;
  }
  usedCodes.add(code);
  return code;
}

export function suggestBrandCode(brandName, existingCodes = new Set()) {
  const name = normalizeText(brandName);
  if (!name) return 'BRD';

  if (KNOWN_BRAND_CODES[name]) {
    return uniqueCode(KNOWN_BRAND_CODES[name], existingCodes);
  }

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 3) {
    return uniqueCode(words[0], existingCodes);
  }

  const consonants = name.replace(/[^A-Z]/g, '');
  let candidate = consonants.slice(0, 3);
  if (candidate.length < 2) candidate = name.replace(/\s/g, '').slice(0, 3);
  if (candidate.length < 2) candidate = 'BR';

  return uniqueCode(candidate, existingCodes);
}

function loadFamilyPatterns(dbFamilies) {
  const patterns = [];

  for (const row of dbFamilies) {
    if (!row.isActive) continue;
    patterns.push({
      keywords: [normalizeText(row.keyword)],
      code: row.code.toUpperCase(),
      priority: row.priority ?? 0,
      source: 'db',
    });
  }

  for (const entry of DEFAULT_FAMILY_CODES) {
    patterns.push({
      keywords: entry.keywords.map(normalizeText),
      code: entry.code,
      priority: entry.priority ?? 0,
      source: 'default',
    });
  }

  patterns.sort((a, b) => {
    const maxA = Math.max(...a.keywords.map((k) => k.length));
    const maxB = Math.max(...b.keywords.map((k) => k.length));
    if (maxB !== maxA) return maxB - maxA;
    return b.priority - a.priority;
  });

  return patterns;
}

export function detectFamilyCode(productName, dbFamilies = []) {
  const normalized = normalizeText(productName);
  const patterns = loadFamilyPatterns(dbFamilies);
  const usedCodes = new Set(
    dbFamilies.filter((f) => f.isActive).map((f) => f.code.toUpperCase())
  );

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (normalized.includes(keyword)) {
        return pattern.code;
      }
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return 'PR';

  const first = words[0];
  if (first.length >= 4 && words.length > 1) {
    return first.slice(0, 2).toUpperCase();
  }
  return first.slice(0, Math.min(4, Math.max(2, first.length))).toUpperCase();
}

export function extractDescriptors(productName, brandName) {
  let text = normalizeText(productName);
  const brand = normalizeText(brandName);

  if (brand) {
    text = text.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  }

  for (const entry of DEFAULT_FAMILY_CODES) {
    for (const keyword of entry.keywords) {
      text = text.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    }
  }

  text = text.replace(/\bSERIES\b/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  const tokens = [];
  const seen = new Set();

  for (const rule of DESCRIPTOR_RULES) {
    if (!rule.test(text)) continue;
    const token = rule.extract(text);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    text = rule.consume(text).replace(/\s+/g, ' ').trim();
  }

  return tokens.slice(0, 6);
}

function descriptorRank(token) {
  if (/^\d+\.?\d*[A-Z]?\d*$/.test(token) && /B\d/.test(token)) return 10;
  if (/^\d+\.?\d*A$/.test(token)) return 11;
  if (/^\d+P$/.test(token)) return 12;
  if (/^[A-Z]$/.test(token)) return 13;
  if (/^\d/.test(token) || /^R\d/.test(token)) return 20;
  if (token === 'WW' || token === 'WH') return 30;
  return 40;
}

export function sortDescriptors(tokens) {
  return [...tokens].sort((a, b) => descriptorRank(a) - descriptorRank(b));
}

export function mergeFamilyBrand(familyCode, brandCode) {
  const family = (familyCode || 'PR').toUpperCase();
  const brand = (brandCode || 'BR').toUpperCase();
  if (family && brand && family.endsWith(brand[0])) {
    return `${family}${brand.slice(1)}`;
  }
  return `${family}${brand}`;
}

export function buildSkuBase({ productName, brandCode, familyCode, descriptors }) {
  const prefix = mergeFamilyBrand(familyCode, brandCode);
  const descPart = (descriptors || []).filter(Boolean).join('-');
  return descPart ? `${prefix}-${descPart}` : prefix;
}

/**
 * Turn Variant / Model text into SKU descriptor token(s).
 * Reuses descriptor rules when possible (e.g. ASTRON → AST, C Curve → C, R32 → R32).
 */
export function encodeModelVariant(modelVariant) {
  const raw = normalizeText(modelVariant);
  if (!raw) return [];

  const fromRules = sortDescriptors(extractDescriptors(raw, ''));
  if (fromRules.length) return fromRules;

  const cleaned = raw
    .replace(/\b(SERIES|MODEL|VARIANT|VAR|TYPE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const compact = cleaned.replace(/\s+/g, '');
  if (compact.length <= 6) return [compact];

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return [words[0].slice(0, 4)];

  const code = words
    .map((w) => w.slice(0, Math.min(3, w.length)))
    .join('')
    .slice(0, 6);
  return code ? [code] : [];
}

export function mergeDescriptors(nameDescriptors, modelVariant) {
  const merged = [];
  const seen = new Set();
  for (const token of [...(nameDescriptors || []), ...encodeModelVariant(modelVariant)]) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    merged.push(token);
  }
  return merged;
}

export function generateSku({
  productName,
  brandName,
  brandCode,
  categoryName,
  familyCode,
  modelVariant,
  dbFamilies,
}) {
  const family = familyCode || detectFamilyCode(productName, dbFamilies);
  const resolvedBrandCode = (brandCode || suggestBrandCode(brandName)).toUpperCase();
  const nameDescriptors = sortDescriptors(extractDescriptors(productName, brandName));
  const descriptors = mergeDescriptors(nameDescriptors, modelVariant);
  const sku = buildSkuBase({
    productName,
    brandCode: resolvedBrandCode,
    familyCode: family,
    descriptors,
  });

  return {
    sku,
    familyCode: family,
    brandCode: resolvedBrandCode,
    descriptors,
    modelVariant: modelVariant?.trim() || null,
    categoryName: categoryName || null,
  };
}

export function ensureUniqueSku(baseSku, skuExistsFn, excludeId = null) {
  if (!skuExistsFn(baseSku, excludeId)) {
    return { sku: baseSku, suffixed: false };
  }

  for (let i = 2; i <= 99; i += 1) {
    const candidate = `${baseSku}-${i}`;
    if (!skuExistsFn(candidate, excludeId)) {
      return { sku: candidate, suffixed: true, suffix: i };
    }
  }

  return { sku: `${baseSku}-${Date.now().toString(36).slice(-4).toUpperCase()}`, suffixed: true };
}

export function normalizeProductFingerprint(name, brandId, modelVariant = '') {
  return `${brandId || ''}|${normalizeText(name)}|${normalizeText(modelVariant)}`;
}

export function nameSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(na.split(/\s+/));
  const tb = new Set(nb.split(/\s+/));
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
}

export class SkuEngineRepository {
  listFamilyCodes({ includeInactive = false } = {}) {
    const db = getDatabase();
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return db.prepare(`
      SELECT * FROM product_family_codes ${where}
      ORDER BY priority DESC, keyword ASC
    `).all().map((row) => ({
      id: row.id,
      keyword: row.keyword,
      code: row.code,
      priority: row.priority,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findFamilyByKeyword(keyword) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM product_family_codes WHERE LOWER(keyword) = LOWER(?)
    `).get(keyword);
    if (!row) return null;
    return {
      id: row.id,
      keyword: row.keyword,
      code: row.code,
      priority: row.priority,
      isActive: Boolean(row.is_active),
    };
  }

  codeExists(code, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare(`
        SELECT id FROM product_family_codes
        WHERE UPPER(code) = UPPER(?) AND id != ?
      `).get(code, excludeId)
      : db.prepare(`
        SELECT id FROM product_family_codes WHERE UPPER(code) = UPPER(?)
      `).get(code);
    return Boolean(row);
  }

  createFamilyCode({ keyword, code, priority = 0, createdBy }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO product_family_codes (id, keyword, code, priority, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, keyword.trim(), code.toUpperCase(), priority, now, now, createdBy || null);
    return this.findFamilyById(id);
  }

  findFamilyById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM product_family_codes WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      keyword: row.keyword,
      code: row.code,
      priority: row.priority,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  updateFamilyCode(id, data) {
    const db = getDatabase();
    const existing = this.findFamilyById(id);
    if (!existing) return null;
    const now = nowIso();
    db.prepare(`
      UPDATE product_family_codes
      SET keyword = ?, code = ?, priority = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.keyword?.trim() ?? existing.keyword,
      (data.code ?? existing.code).toUpperCase(),
      data.priority ?? existing.priority,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      now,
      id
    );
    return this.findFamilyById(id);
  }

  allocateBarcode() {
    const db = getDatabase();
    const allocate = db.transaction(() => {
      db.prepare('UPDATE barcode_sequences SET last_value = last_value + 1 WHERE id = 1').run();
      const row = db.prepare('SELECT last_value FROM barcode_sequences WHERE id = 1').get();
      return String(row.last_value).padStart(9, '0');
    });
    return allocate();
  }

  syncBarcodeSequenceFromProducts() {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT MAX(CAST(barcode AS INTEGER)) as max_barcode
      FROM products
      WHERE barcode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
    `).get();
    const max = Number(row?.max_barcode || 0);
    if (max > 0) {
      const current = db.prepare('SELECT last_value FROM barcode_sequences WHERE id = 1').get();
      const next = Math.max(Number(current?.last_value || 0), max);
      db.prepare('UPDATE barcode_sequences SET last_value = ? WHERE id = 1').run(next);
    }
  }

  seedDefaultFamilyCodes(createdBy = null) {
    const db = getDatabase();
    const count = db.prepare('SELECT COUNT(*) as count FROM product_family_codes').get().count;
    if (count > 0) return;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO product_family_codes (id, keyword, code, priority, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `);
    const now = nowIso();
    for (const entry of DEFAULT_FAMILY_CODES) {
      for (const keyword of entry.keywords) {
        insert.run(generateId(), keyword, entry.code, entry.priority, now, now, createdBy);
      }
    }
  }
}

export const skuEngineRepo = new SkuEngineRepository();
