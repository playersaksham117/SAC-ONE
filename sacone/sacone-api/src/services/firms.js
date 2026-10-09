import { AppError } from '../core/http.js';
import { financialYearOf, financialYearRange, financialYearsSince, isFinancialYear } from '../core/financial-year.js';
import { generateId } from '../core/utils.js';
import { generateFirmPrefix } from '../core/firm-prefix.js';
import { getFirmDatabase } from '../database/connection.js';
import { runWithFirm } from '../database/context.js';
import { ensurePrimaryFirm } from '../database/firm-provision.js';
import { repos } from '../repositories/index.js';
import { FirmRepository } from '../repositories/sqlite/firms.js';

const firmRepo = new FirmRepository();
const OWNER = 'owner_admin';

function requireOwner(actor) {
  if (actor?.user?.roleSlug !== OWNER) throw new AppError('Only the owner can manage firms', 403, 'OWNER_ONLY');
}

function requirePermission(actor, key) {
  const perms = actor?.permissions || [];
  if (!perms.includes('*') && !perms.includes(key)) throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

function audit(actor, req, action, recordId, newValue) {
  repos.auditLogs.create({
    userId: actor.user.id, userName: actor.user.fullName,
    action, module: 'core', recordType: 'firm', recordId, newValue,
    ipAddress: req?.ip || null, userAgent: req?.headers?.['user-agent'] || null,
  });
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEXT_FIELDS = {
  legalName: 160, addressLine1: 200, addressLine2: 200, city: 80, state: 80, country: 60,
  postalCode: 12, phone: 20, email: 120, website: 200,
};

/**
 * Company-profile fields from a firm form, trimmed and checked. Only keys present in `data`
 * are returned, so an edit can change one field without clearing the rest. A GSTIN fills in
 * the state code and PAN it contains.
 */
function cleanProfile(data) {
  const out = {};
  if (data.name !== undefined || data.businessName !== undefined) {
    const name = String(data.businessName ?? data.name ?? '').trim();
    if (!name) throw new AppError('Firm name is required', 400);
    if (name.length > 120) throw new AppError('Firm name is too long (120 characters at most)', 400);
    out.businessName = name;
  }
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (data[key] !== undefined) out[key] = String(data[key] ?? '').trim().slice(0, max) || null;
  }
  if (out.email && !EMAIL.test(out.email)) throw new AppError('Enter a valid email address', 400);
  if (out.postalCode && !/^[0-9]{6}$/.test(out.postalCode) && (out.country || 'India') === 'India') {
    throw new AppError('PIN code should be 6 digits', 400);
  }

  if (data.panNumber !== undefined) {
    const pan = String(data.panNumber ?? '').replace(/\s/g, '').toUpperCase();
    if (pan && !PAN.test(pan)) throw new AppError('PAN should be 10 characters, like ABCDE1234F', 400);
    out.panNumber = pan || null;
  }
  if (data.gstStateCode !== undefined) {
    const code = String(data.gstStateCode ?? '').trim();
    if (code && !/^[0-9]{2}$/.test(code)) throw new AppError('GST state code should be 2 digits, like 03', 400);
    out.gstStateCode = code || null;
  }
  if (data.gstNumber !== undefined) {
    const gst = String(data.gstNumber ?? '').replace(/\s/g, '').toUpperCase();
    if (gst && !GSTIN.test(gst)) throw new AppError('GSTIN should be 15 characters, like 03ABCDE1234F1Z5', 400);
    out.gstNumber = gst || null;
    if (gst) {
      if (out.gstStateCode && out.gstStateCode !== gst.slice(0, 2)) {
        throw new AppError(`GST state code ${out.gstStateCode} does not match the GSTIN (it starts with ${gst.slice(0, 2)})`, 400);
      }
      out.gstStateCode = gst.slice(0, 2);
      if (out.panNumber && out.panNumber !== gst.slice(2, 12)) {
        throw new AppError('PAN does not match the GSTIN (characters 3 to 12)', 400);
      }
      if (!out.panNumber) out.panNumber = gst.slice(2, 12);
    }
  }
  return out;
}

/** Invoice prefix and signatory (document numbering), checked. */
function cleanNumbering(data) {
  const out = {};
  if (data.firmPrefix !== undefined) {
    const prefix = String(data.firmPrefix ?? '').trim().toUpperCase();
    if (prefix && !/^[A-Z0-9]{1,8}$/.test(prefix)) throw new AppError('Invoice prefix: 1 to 8 letters or digits', 400);
    out.firmPrefix = prefix || null;
  }
  if (data.authorizedSignatory !== undefined) {
    out.authorizedSignatory = String(data.authorizedSignatory ?? '').trim().slice(0, 120) || null;
  }
  return out;
}

/** Write profile + numbering fields into the firm's own books. A blank prefix is made from the name. */
function applyProfile(firmId, profile, numbering, actor) {
  runWithFirm({ firmId }, () => {
    const company = repos.company.upsert({ ...profile, isSetupComplete: true }, actor.user.id);
    const prefix = numbering.firmPrefix !== undefined
      ? (numbering.firmPrefix || generateFirmPrefix(company.businessName))
      : undefined;
    if (prefix !== undefined || numbering.authorizedSignatory !== undefined) {
      repos.documentNumbering.updateFirmSettings(company.id, {
        firmPrefix: prefix,
        firmPrefixManual: numbering.firmPrefix !== undefined ? Boolean(numbering.firmPrefix) : undefined,
        authorizedSignatory: numbering.authorizedSignatory,
      });
    }
  });
}

/** Each firm's own profile (name, GSTIN, place) from its books. */
function profileOf(firm) {
  const company = runWithFirm({ firmId: firm.id }, () => repos.company.get());
  return {
    id: firm.id,
    name: company?.businessName || firm.name,
    gstNumber: company?.gstNumber || null,
    city: company?.city || null,
    state: company?.state || null,
    isPrimary: firm.isPrimary,
    isActive: firm.isActive,
    firstFinancialYear: firm.firstFinancialYear,
  };
}

export const firmService = {
  /** Ids of every active firm, first firm first (for key lookups by POS phones and the web store). */
  activeFirmIds() {
    ensurePrimaryFirm();
    return firmRepo.findAll().map((f) => f.id);
  },

  /**
   * Run `find` in each firm's books until it returns something; then run `next` in that firm.
   * Used for POS device keys and web-store API keys, which belong to one firm.
   */
  inFirmOf(find, next) {
    for (const firmId of this.activeFirmIds()) {
      const found = runWithFirm({ firmId }, find);
      if (found) return runWithFirm({ firmId, financialYear: financialYearOf() }, () => next(found));
    }
    return next(null);
  },

  /** Active firms this user may open. A user never assigned a firm gets the first firm. */
  firmsForUser(user) {
    ensurePrimaryFirm();
    const active = firmRepo.findAll();
    if (user?.roleSlug === OWNER) return active;
    const assigned = new Set(firmRepo.firmIdsForUser(user.id));
    if (!assigned.size) return active.filter((f) => f.isPrimary);
    return active.filter((f) => assigned.has(f.id));
  },

  canOpen(user, firmId) {
    return this.firmsForUser(user).some((f) => f.id === firmId);
  },

  financialYears(firm) {
    return financialYearsSince(firm.firstFinancialYear);
  },

  /** What the firm / financial-year picker shows after signing in. */
  choices(user) {
    return this.firmsForUser(user).map((firm) => ({
      ...profileOf(firm),
      financialYears: this.financialYears(firm),
    }));
  },

  /** The firm and year a session works in, or null when not chosen or no longer allowed. */
  sessionSelection(session) {
    if (!session.firm_id) return null;
    const firm = firmRepo.findById(session.firm_id);
    const user = { id: session.user_id, roleSlug: session.role_slug };
    if (!firm?.isActive || !this.canOpen(user, firm.id)) return null;
    const financialYear = financialYearRange(session.financial_year) || financialYearRange(financialYearOf());
    return { firm, financialYear };
  },

  select(token, user, { firmId, financialYear } = {}) {
    const firm = firmId ? firmRepo.findById(firmId) : null;
    if (!firm?.isActive || !this.canOpen(user, firm.id)) {
      throw new AppError('You do not have access to this firm', 403, 'FIRM_FORBIDDEN');
    }
    const code = financialYear || financialYearOf();
    if (!isFinancialYear(code) || !this.financialYears(firm).some((y) => y.code === code)) {
      throw new AppError('Choose a financial year from the list', 400, 'BAD_FINANCIAL_YEAR');
    }
    firmRepo.selectForSession(token, firm.id, code);
    return { firm: profileOf(firm), financialYear: financialYearRange(code) };
  },

  /* ── Administration (owner) ── */

  list(actor) {
    requireOwner(actor);
    return firmRepo.findAll({ includeInactive: true }).map((firm) => ({
      ...profileOf(firm),
      financialYears: this.financialYears(firm).map((y) => y.code),
      userCount: null,
    }));
  },

  /** Everything the firm form shows: the firm list entry plus its full company profile. */
  get(id, actor) {
    requireOwner(actor);
    const firm = firmRepo.findById(id);
    if (!firm) throw new AppError('Firm not found', 404);
    return runWithFirm({ firmId: id }, () => {
      const company = repos.company.get() || {};
      const numbering = company.id ? repos.documentNumbering.getFirm(company.id) : null;
      return {
        id: firm.id,
        isPrimary: firm.isPrimary,
        isActive: firm.isActive,
        firstFinancialYear: firm.firstFinancialYear,
        financialYears: this.financialYears(firm).map((y) => y.code),
        name: company.businessName || firm.name,
        legalName: company.legalName || '',
        addressLine1: company.addressLine1 || '',
        addressLine2: company.addressLine2 || '',
        city: company.city || '',
        state: company.state || '',
        country: company.country || 'India',
        postalCode: company.postalCode || '',
        gstNumber: company.gstNumber || '',
        gstStateCode: company.gstStateCode || '',
        panNumber: company.panNumber || '',
        phone: company.phone || '',
        email: company.email || '',
        website: company.website || '',
        firmPrefix: numbering?.firmPrefix || '',
        authorizedSignatory: numbering?.authorizedSignatory || '',
        createdAt: firm.createdAt,
      };
    });
  },

  /** A new firm with its own, empty books (own products, parties, stock, invoices and accounts). */
  create(data = {}, actor, req) {
    requireOwner(actor);
    const profile = cleanProfile({ ...data, name: data.name ?? data.businessName ?? '' });
    const numbering = cleanNumbering({ firmPrefix: data.firmPrefix ?? '', authorizedSignatory: data.authorizedSignatory });
    const firstFinancialYear = data.firstFinancialYear || financialYearOf();
    if (!isFinancialYear(firstFinancialYear) || firstFinancialYear > financialYearOf()) {
      throw new AppError('First financial year must be this year or earlier, like 2026-27', 400);
    }
    ensurePrimaryFirm();

    const id = generateId();
    firmRepo.create({ id, name: profile.businessName, dbFile: `firms/${id}.db`, firstFinancialYear, createdBy: actor.user.id });
    try {
      getFirmDatabase(id); // creates and prepares the firm's database file
      applyProfile(id, { country: 'India', ...profile }, numbering, actor);
    } catch (err) {
      firmRepo.update(id, { isActive: false });
      throw err;
    }
    audit(actor, req, 'create', id, { ...profile, firstFinancialYear });
    return this.get(id, actor);
  },

  /** Change any part of a firm: its profile, invoice prefix, first year, or switch it on/off. */
  update(id, data = {}, actor, req) {
    requireOwner(actor);
    const firm = firmRepo.findById(id);
    if (!firm) throw new AppError('Firm not found', 404);
    if (data.firstFinancialYear !== undefined
      && (!isFinancialYear(data.firstFinancialYear) || data.firstFinancialYear > financialYearOf())) {
      throw new AppError('First financial year must be this year or earlier, like 2026-27', 400);
    }
    const profile = cleanProfile(data);
    const numbering = cleanNumbering(data);
    if (data.isActive === false && firm.isPrimary) throw new AppError('The first firm cannot be switched off', 400);

    if (Object.keys(profile).length || Object.keys(numbering).length) applyProfile(id, profile, numbering, actor);
    firmRepo.update(id, { name: profile.businessName, isActive: data.isActive, firstFinancialYear: data.firstFinancialYear });
    if (data.isActive === false) firmRepo.clearSessionsForFirm(id);
    audit(actor, req, 'update', id, { ...profile, ...numbering, isActive: data.isActive, firstFinancialYear: data.firstFinancialYear });
    return this.get(id, actor);
  },

  /** Keep the registry name in step when a firm edits its own company profile. */
  syncName(firmId, name) {
    if (firmId && name) firmRepo.update(firmId, { name: String(name).trim() });
  },

  userFirms(userId, actor) {
    requirePermission(actor, 'core.users.view');
    const firms = firmRepo.findAll();
    const assigned = firmRepo.firmIdsForUser(userId);
    return { firmIds: assigned.length ? assigned : firms.filter((f) => f.isPrimary).map((f) => f.id), explicit: assigned.length > 0 };
  },

  setUserFirms(userId, firmIds, actor, req) {
    requirePermission(actor, 'core.users.edit');
    if (!Array.isArray(firmIds) || !firmIds.length) throw new AppError('Give the user at least one firm', 400);
    const known = new Set(firmRepo.findAll({ includeInactive: true }).map((f) => f.id));
    if (firmIds.some((id) => !known.has(id))) throw new AppError('Unknown firm', 400);
    firmRepo.setUserFirms(userId, firmIds);
    audit(actor, req, 'assign_firms', userId, { firmIds });
    return this.userFirms(userId, actor);
  },
};
