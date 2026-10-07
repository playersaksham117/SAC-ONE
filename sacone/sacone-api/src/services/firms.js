import { AppError } from '../core/http.js';
import { financialYearOf, financialYearRange, financialYearsSince, isFinancialYear } from '../core/financial-year.js';
import { generateId } from '../core/utils.js';
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

  /** A new firm with its own, empty books (own products, parties, stock, invoices and accounts). */
  create(data = {}, actor, req) {
    requireOwner(actor);
    const name = String(data.name || '').trim();
    if (!name) throw new AppError('Firm name is required', 400);
    if (name.length > 120) throw new AppError('Firm name is too long', 400);
    const firstFinancialYear = data.firstFinancialYear || financialYearOf();
    if (!isFinancialYear(firstFinancialYear) || firstFinancialYear > financialYearOf()) {
      throw new AppError('First financial year must be this year or earlier, like 2026-27', 400);
    }
    ensurePrimaryFirm();

    const id = generateId();
    firmRepo.create({ id, name, dbFile: `firms/${id}.db`, firstFinancialYear, createdBy: actor.user.id });
    try {
      getFirmDatabase(id); // creates and prepares the firm's database file
      runWithFirm({ firmId: id }, () => repos.company.upsert({
        businessName: name,
        legalName: data.legalName || null,
        gstNumber: data.gstNumber ? String(data.gstNumber).trim().toUpperCase() : null,
        gstStateCode: data.gstStateCode || null,
        state: data.state || null,
        city: data.city || null,
        addressLine1: data.addressLine1 || null,
        phone: data.phone || null,
        email: data.email || null,
      }, actor.user.id));
    } catch (err) {
      firmRepo.update(id, { isActive: false });
      throw err;
    }
    audit(actor, req, 'create', id, { name, firstFinancialYear });
    return profileOf(firmRepo.findById(id));
  },

  update(id, data = {}, actor, req) {
    requireOwner(actor);
    const firm = firmRepo.findById(id);
    if (!firm) throw new AppError('Firm not found', 404);
    if (data.isActive === false) {
      if (firm.isPrimary) throw new AppError('The first firm cannot be switched off', 400);
      firmRepo.clearSessionsForFirm(id);
    }
    if (data.firstFinancialYear !== undefined
      && (!isFinancialYear(data.firstFinancialYear) || data.firstFinancialYear > financialYearOf())) {
      throw new AppError('First financial year must be this year or earlier, like 2026-27', 400);
    }
    const name = data.name !== undefined ? String(data.name).trim() : undefined;
    if (name === '') throw new AppError('Firm name is required', 400);
    firmRepo.update(id, { name, isActive: data.isActive, firstFinancialYear: data.firstFinancialYear });
    // The name shown everywhere comes from the firm's own company profile; keep both the same.
    if (name) runWithFirm({ firmId: id }, () => repos.company.upsert({ businessName: name }, actor.user.id));
    audit(actor, req, 'update', id, { name, isActive: data.isActive, firstFinancialYear: data.firstFinancialYear });
    return profileOf(firmRepo.findById(id));
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
