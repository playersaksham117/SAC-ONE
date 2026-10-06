import crypto from 'crypto';
import { AppError } from '../core/http.js';
import { config } from '../config/index.js';
import { repos } from '../repositories/index.js';
import { authService, userService } from './index.js';
import {
  round2,
  resolveFloor,
  MinSellingPriceRepository,
  SalesAgentRepository,
  CommissionPlanRepository,
  SaleCommissionRepository,
  CommissionPaymentRepository,
} from '../repositories/sqlite/commissions.js';

const agentRepo = repos.salesAgents || new SalesAgentRepository();
const planRepo = repos.commissionPlans || new CommissionPlanRepository();
const commissionRepo = repos.saleCommissions || new SaleCommissionRepository();
const paymentRepo = repos.commissionPayments || new CommissionPaymentRepository();
const auditRepo = repos.auditLogs;
const numberingRepo = repos.documentNumbering;
const productRepo = repos.products;
const cashRepo = repos.cashBook;
const minPriceRepo = new MinSellingPriceRepository();

/** Readable one-time password: no 0/O/1/l/I, always letters + digits + a symbol. */
function generatePassword() {
  const pick = (chars, n) => Array.from(crypto.randomBytes(n), (b) => chars[b % chars.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2)}${pick('abcdefghjkmnpqrstuvwxyz', 4)}${pick('23456789', 3)}@`;
}

/** Effective unit price (before GST, after line + invoice discounts) of a sale line. */
function unitNetPrice(line) {
  const qty = Number(line.quantity || 0);
  return qty > 0 ? round2(Number(line.taxableAmount || 0) / qty) : 0;
}

function meta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function requirePerm(actor, key) {
  authService.checkPermission(actor.permissions, key);
}

function methodToBasis(method) {
  if (method === 'percent_sales_value') return 'sales_value';
  if (method === 'percent_gross_profit') return 'gross_profit';
  if (method === 'fixed_per_invoice' || method === 'fixed_per_product') return 'fixed';
  return 'taxable';
}

function computeAmount({ method, rate, fixedAmount, salesAmount, taxableAmount, grossProfit, maxCommission }) {
  let amount = 0;
  if (method === 'percent_sales_value') amount = round2(salesAmount * (rate / 100));
  else if (method === 'percent_taxable') amount = round2(taxableAmount * (rate / 100));
  else if (method === 'percent_gross_profit') amount = round2(Math.max(0, grossProfit) * (rate / 100));
  else if (method === 'fixed_per_invoice' || method === 'fixed_per_product') amount = round2(fixedAmount);
  else amount = round2(taxableAmount * (rate / 100));
  if (maxCommission != null && amount > Number(maxCommission)) amount = round2(maxCommission);
  return Math.max(0, amount);
}

function resolveEligible({ paymentCondition, commissionEarned, paymentReceived, salesAmount }) {
  const earned = round2(commissionEarned);
  if (!(earned > 0)) return 0;
  if (paymentCondition === 'on_sale' || paymentCondition === 'after_return_period') return earned;
  if (paymentCondition === 'on_full_payment') {
    return paymentReceived + 0.02 >= salesAmount ? earned : 0;
  }
  // on_payment_received / on_partial_payment — proportional
  if (!(salesAmount > 0)) return 0;
  const ratio = Math.min(1, paymentReceived / salesAmount);
  return round2(earned * ratio);
}

export class CommissionService {
  // ── Agents ──────────────────────────────────────────────
  listAgents(query, actor) {
    requirePerm(actor, 'sales.agents.view');
    return agentRepo.list({
      status: query.status,
      search: query.search || query.q,
      limit: query.limit ? parseInt(query.limit, 10) : 200,
    });
  }

  getAgent(id, actor) {
    requirePerm(actor, 'sales.agents.view');
    const agent = agentRepo.findById(id);
    if (!agent) throw new AppError('Sales agent not found', 404);
    return agent;
  }

  createAgent(data, actor, req) {
    requirePerm(actor, 'sales.agents.create');
    if (!data.name) throw new AppError('Agent name is required', 400);
    const code = data.agentCode || agentRepo.nextCode();
    if (agentRepo.codeExists(code)) throw new AppError('Agent code already exists', 409);
    if (data.createLogin) authService.checkPermission(actor.permissions, 'core.users.create');
    if (data.linkUserId) this.#assertLinkable(data.linkUserId);

    let agent = agentRepo.create({ ...data, agentCode: code, createdBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'sales', recordType: 'sales_agent', recordId: agent.id,
      newValue: agent, ...meta(req),
    });

    let credentials = null;
    if (data.createLogin) {
      ({ agent, credentials } = this.#createLogin(agent, data.loginRoleId, actor, req));
    } else if (data.linkUserId) {
      agent = agentRepo.setUserId(agent.id, data.linkUserId);
    }
    return credentials ? { ...agent, credentials } : agent;
  }

  /**
   * One agent = one sales-staff login. Actions:
   *   create  new ERP login (Sales Staff role by default), password shown once
   *   link    use an existing ERP user
   *   unlink  keep the user, stop treating them as this agent
   *   reset   new one-time password for the linked login
   */
  manageLogin(id, { action, userId, roleId } = {}, actor, req) {
    requirePerm(actor, 'sales.agents.edit');
    const agent = agentRepo.findById(id);
    if (!agent) throw new AppError('Sales agent not found', 404);

    if (action === 'create') {
      authService.checkPermission(actor.permissions, 'core.users.create');
      if (agent.userId) throw new AppError('This agent already has a login', 409);
      const result = this.#createLogin(agent, roleId, actor, req);
      return { ...result.agent, credentials: result.credentials };
    }
    if (action === 'link') {
      if (!userId) throw new AppError('userId is required', 400);
      this.#assertLinkable(userId, id);
      return agentRepo.setUserId(id, userId);
    }
    if (action === 'unlink') return agentRepo.setUserId(id, null);
    if (action === 'reset') {
      if (!agent.userId) throw new AppError('This agent has no login yet', 400);
      const password = generatePassword();
      userService.update(agent.userId, { password, isActive: true }, actor, req);
      return { ...agentRepo.findById(id), credentials: { loginId: agent.loginEmail, password } };
    }
    throw new AppError('action must be create, link, unlink or reset', 400);
  }

  #assertLinkable(userId, agentId = null) {
    const user = repos.users.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    const other = agentRepo.findByUserId(userId);
    if (other && other.id !== agentId) throw new AppError(`That login already belongs to agent ${other.name}`, 409);
  }

  #loginEmailFor(agent) {
    const own = String(agent.email || '').trim().toLowerCase();
    if (own && !repos.users.emailExists(own)) return own;
    const base = String(agent.agentCode).toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = config.localDomain || 'sacone.local';
    for (let i = 0; ; i += 1) {
      const candidate = `${base}${i ? `-${i}` : ''}@${domain}`;
      if (!repos.users.emailExists(candidate)) return candidate;
    }
  }

  #createLogin(agent, roleId, actor, req) {
    const role = roleId ? repos.roles.findById(roleId) : repos.roles.findBySlug('sales_staff');
    if (!role?.id) throw new AppError('Sales Staff role not found; pick a role for the login', 400);
    const loginId = this.#loginEmailFor(agent);
    const password = generatePassword();
    const user = userService.create({
      email: loginId, password, fullName: agent.name, phone: agent.mobile || null, roleId: role.id,
    }, actor, req);
    return { agent: agentRepo.setUserId(agent.id, user.id), credentials: { loginId, password, roleName: role.name } };
  }

  /** The active agent that is this ERP user (sales staff selling under their own login). */
  agentForUser(userId) {
    const agent = agentRepo.findByUserId(userId);
    return agent?.status === 'active' ? agent : null;
  }

  updateAgent(id, data, actor, req) {
    requirePerm(actor, 'sales.agents.edit');
    const existing = agentRepo.findById(id);
    if (!existing) throw new AppError('Sales agent not found', 404);
    if (data.agentCode && agentRepo.codeExists(data.agentCode, id)) {
      throw new AppError('Agent code already exists', 409);
    }
    const updated = agentRepo.update(id, data);
    // Agent and login are the same person: keep name, phone and active status in step.
    if (updated.userId && repos.users.findById(updated.userId)) {
      const loginChanges = {};
      if (updated.name !== existing.name) loginChanges.fullName = updated.name;
      if (updated.mobile !== existing.mobile) loginChanges.phone = updated.mobile;
      if (updated.status !== existing.status) loginChanges.isActive = updated.status === 'active';
      if (Object.keys(loginChanges).length) {
        try {
          userService.update(updated.userId, loginChanges, actor, req);
        } catch (err) {
          if (err.statusCode !== 403) throw err; // no core.users.edit: agent saved, login unchanged
        }
      }
    }
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'sales', recordType: 'sales_agent', recordId: id,
      previousValue: existing, newValue: updated, ...meta(req),
    });
    return agentRepo.findById(id);
  }

  // ── Plans ───────────────────────────────────────────────
  // ── Minimum selling prices (only managed here, in Commission settings) ──
  listMinPrices(actor) {
    requirePerm(actor, 'sales.commissions.view');
    return minPriceRepo.list();
  }

  saveMinPrice(data, actor, req) {
    requirePerm(actor, 'sales.commissions.edit');
    const scope = String(data.scope || '');
    if (!['product', 'brand', 'category'].includes(scope)) throw new AppError('scope must be product, brand or category', 400);
    const targetId = data.targetId;
    const target = scope === 'product' ? repos.products.findById(targetId)
      : scope === 'brand' ? repos.brands.findById(targetId) : repos.categories.findById(targetId);
    if (!target) throw new AppError(`${scope} not found`, 404);

    const minPrice = data.minPrice === '' || data.minPrice == null ? null : Number(data.minPrice);
    const minPercentOfMrp = data.minPercentOfMrp === '' || data.minPercentOfMrp == null ? null : Number(data.minPercentOfMrp);
    if (minPrice == null && minPercentOfMrp == null) throw new AppError('Set a minimum price or a % of MRP', 400);
    if (minPrice != null && minPercentOfMrp != null) throw new AppError('Use either a minimum price or a % of MRP, not both', 400);
    if (minPrice != null && !(minPrice >= 0)) throw new AppError('Minimum price must be zero or more', 400);
    if (minPrice != null && scope !== 'product') throw new AppError('A fixed minimum price applies to one product; use % of MRP for brands and categories', 400);
    if (minPercentOfMrp != null && !(minPercentOfMrp > 0 && minPercentOfMrp <= 100)) throw new AppError('% of MRP must be between 0 and 100', 400);

    const saved = minPriceRepo.upsert({
      scope, targetId, minPrice, minPercentOfMrp,
      isActive: data.isActive !== false, notes: data.notes, createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'sales', recordType: 'min_selling_price', recordId: saved.id,
      newValue: saved, ...meta(req),
    });
    return saved;
  }

  deleteMinPrice(id, actor, req) {
    requirePerm(actor, 'sales.commissions.edit');
    const existing = minPriceRepo.findById(id);
    if (!existing) throw new AppError('Minimum price rule not found', 404);
    minPriceRepo.remove(id);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'delete', module: 'sales', recordType: 'min_selling_price', recordId: id,
      previousValue: existing, ...meta(req),
    });
    return { deleted: true };
  }

  /** productId → floor for every active product with a rule (SAC-POS pulls this). */
  minPriceMap() {
    const rules = minPriceRepo.activeRules();
    const map = {};
    if (!rules.product.size && !rules.brand.size && !rules.category.size) return map;
    for (const product of repos.products.findAll({ isActive: '1', limit: 100000 }).items || []) {
      const hit = resolveFloor(product, rules);
      if (hit) map[product.id] = hit.floor;
    }
    return map;
  }

  /**
   * Lines priced below their floor. Lines need productId, quantity, taxableAmount
   * (after all discounts, before GST) and a name.
   */
  belowMinPrice(lines) {
    const rules = minPriceRepo.activeRules();
    if (!rules.product.size && !rules.brand.size && !rules.category.size) return [];
    const out = [];
    for (const line of lines) {
      const product = repos.products.findById(line.productId);
      if (!product) continue;
      const hit = resolveFloor(product, rules);
      const price = unitNetPrice(line);
      if (hit && price + 0.005 < hit.floor) {
        out.push({ productId: line.productId, name: line.productName || product.name, unitPrice: price, floor: hit.floor });
      }
    }
    return out;
  }

  listPlans(query, actor) {
    requirePerm(actor, 'sales.commissions.view');
    return planRepo.list({ activeOnly: query.activeOnly === 'true' });
  }

  createPlan(data, actor, req) {
    requirePerm(actor, 'sales.commissions.create');
    if (!data.name || !data.code) throw new AppError('Plan name and code required', 400);
    const plan = planRepo.create({ ...data, createdBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'sales', recordType: 'commission_plan', recordId: plan.id,
      newValue: plan, ...meta(req),
    });
    return plan;
  }

  updatePlan(id, data, actor, req) {
    requirePerm(actor, 'sales.commissions.edit');
    const existing = planRepo.findById(id);
    if (!existing) throw new AppError('Commission plan not found', 404);
    const updated = planRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'sales', recordType: 'commission_plan', recordId: id,
      previousValue: existing, newValue: updated, ...meta(req),
    });
    return updated;
  }

  listRules(planId, actor) {
    requirePerm(actor, 'sales.commissions.view');
    return planRepo.listRules(planId);
  }

  createRule(planId, data, actor, req) {
    requirePerm(actor, 'sales.commissions.create');
    if (!planRepo.findById(planId)) throw new AppError('Plan not found', 404);
    const rule = planRepo.createRule({ ...data, planId });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'sales', recordType: 'commission_rule', recordId: rule.id,
      newValue: rule, ...meta(req),
    });
    return rule;
  }

  /**
   * Preview commission for POS (server-side authoritative calc).
   */
  preview(data, actor) {
    if (actor) requirePerm(actor, 'pos.terminal.view');
    if (!data.salesAgentId) {
      return { salesAgentId: null, estimatedCommission: 0, rate: 0, basis: null, label: 'Direct sale' };
    }
    const agent = agentRepo.findById(data.salesAgentId);
    if (!agent || agent.status !== 'active') throw new AppError('Invalid sales agent', 400);
    const resolved = this.#resolveRule({
      agent,
      customerId: data.customerId,
      items: data.items || [],
      salesAmount: Number(data.salesAmount || data.grandTotal || 0),
      taxableAmount: Number(data.taxableAmount || 0),
    });
    const cogs = this.#estimateCogs(data.items || []);
    const grossProfit = round2(Number(data.taxableAmount || 0) - cogs);
    const amount = computeAmount({
      method: resolved.calculationMethod,
      rate: resolved.rate,
      fixedAmount: resolved.fixedAmount,
      salesAmount: Number(data.salesAmount || data.grandTotal || 0),
      taxableAmount: Number(data.taxableAmount || 0),
      grossProfit,
      maxCommission: resolved.maxCommission,
    });
    return {
      salesAgentId: agent.id,
      salesAgentName: agent.name,
      estimatedCommission: amount,
      rate: resolved.rate,
      basis: methodToBasis(resolved.calculationMethod),
      method: resolved.calculationMethod,
      label: resolved.label,
      paymentCondition: resolved.paymentCondition,
    };
  }

  /**
   * Create commission rows when POS sale is posted. Call with system actor permissions.
   */
  createForSale(sale, { agents, actor, req } = {}) {
    if (!sale?.id) return [];
    const allocations = this.#normalizeAgentShares(agents || (sale.salesAgentId ? [{ salesAgentId: sale.salesAgentId, sharePercent: 100 }] : []));
    if (!allocations.length) return [];

    const created = [];
    // Lines sold below their minimum selling price earn no commission.
    const below = new Set(this.belowMinPrice(sale.items || []).map((l) => l.productId));
    const items = (sale.items || []).filter((i) => !below.has(i.productId));
    if (!items.length) return [];
    let basisSale = sale;
    if (below.size) {
      const kept = round2(items.reduce((s, i) => s + Number(i.taxableAmount || 0), 0));
      const ratio = Number(sale.taxableAmount || 0) > 0 ? kept / Number(sale.taxableAmount) : 0;
      basisSale = {
        ...sale,
        grandTotal: round2(items.reduce((s, i) => s + Number(i.lineTotal || 0), 0)),
        taxableAmount: kept,
        gstAmount: round2(items.reduce((s, i) => s + Number(i.gstAmount || 0), 0)),
        amountPaid: round2(Number(sale.amountPaid || 0) * ratio),
      };
    }
    const cogs = this.#estimateCogs(items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    })));
    const grossProfit = round2(Number(basisSale.taxableAmount || 0) - cogs);
    const paymentReceived = Number(basisSale.amountPaid || 0);

    for (const share of allocations) {
      const agent = agentRepo.findById(share.salesAgentId);
      if (!agent || agent.status !== 'active') continue;

      const sharePct = Number(share.sharePercent || 100) / 100;
      const salesAmount = round2(basisSale.grandTotal * sharePct);
      const taxableAmount = round2(basisSale.taxableAmount * sharePct);
      const gstAmount = round2((basisSale.gstAmount || 0) * sharePct);
      const shareCogs = round2(cogs * sharePct);
      const shareGp = round2(grossProfit * sharePct);
      const sharePaid = round2(paymentReceived * sharePct);

      const resolved = this.#resolveRule({
        agent,
        customerId: sale.customerId,
        items,
        salesAmount,
        taxableAmount,
      });

      if (resolved.minSalesAmount != null && salesAmount < Number(resolved.minSalesAmount)) {
        continue;
      }

      const earned = computeAmount({
        method: resolved.calculationMethod,
        rate: resolved.rate,
        fixedAmount: round2(resolved.fixedAmount * sharePct),
        salesAmount,
        taxableAmount,
        grossProfit: shareGp,
        maxCommission: resolved.maxCommission,
      });

      const eligible = resolveEligible({
        paymentCondition: resolved.paymentCondition,
        commissionEarned: earned,
        paymentReceived: sharePaid,
        salesAmount,
      });

      let status = 'pending';
      if (earned > 0 && eligible <= 0) status = 'earned';
      if (eligible > 0) status = 'eligible';

      const row = commissionRepo.create({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: String(sale.completedAt || sale.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        firmId: sale.firmId,
        customerId: sale.customerId,
        salesAgentId: agent.id,
        sharePercent: share.sharePercent,
        planId: resolved.planId,
        ruleId: resolved.ruleId,
        ruleSnapshot: resolved,
        calculationMethod: resolved.calculationMethod,
        commissionBasis: methodToBasis(resolved.calculationMethod),
        rateSnapshot: resolved.rate,
        fixedAmountSnapshot: resolved.fixedAmount,
        salesAmount,
        taxableAmount,
        gstAmount,
        cogsAmount: shareCogs,
        grossProfit: shareGp,
        paymentReceived: sharePaid,
        paymentCondition: resolved.paymentCondition,
        commissionEarned: earned,
        commissionEligible: eligible,
        commissionPaid: 0,
        status,
        appliedRuleLabel: resolved.label,
        remarks: below.size ? `${below.size} line(s) below minimum selling price excluded` : null,
        createdBy: actor?.user?.id,
      });
      created.push(row);

      if (actor) {
        auditRepo.create({
          userId: actor.user.id,
          userName: actor.user.fullName,
          action: 'create',
          module: 'sales',
          recordType: 'sale_commission',
          recordId: row.id,
          newValue: { saleId: sale.id, agentId: agent.id, earned, eligible },
          ...meta(req),
        });
      }
    }
    return created;
  }

  /** Recalculate eligibility after customer payment on an invoice. */
  refreshForSalePayment(saleId, actor, req) {
    const sale = repos.posSales.findById(saleId);
    if (!sale) return [];
    const rows = commissionRepo.findBySale(saleId);
    const updated = [];
    for (const row of rows) {
      const sharePct = Number(row.sharePercent || 100) / 100;
      const paymentReceived = round2(Number(sale.amountPaid || 0) * sharePct);
      const netEarned = round2(Math.max(0, row.commissionEarned - row.commissionReversed));
      const eligible = resolveEligible({
        paymentCondition: row.paymentCondition,
        commissionEarned: netEarned,
        paymentReceived,
        salesAmount: row.salesAmount,
      });
      // never reduce below already paid
      const nextEligible = Math.max(eligible, row.commissionPaid);
      updated.push(commissionRepo.updateAmounts(row.id, {
        paymentReceived,
        commissionEligible: nextEligible,
      }));
    }
    if (actor && updated.length) {
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'eligibility_refresh',
        module: 'sales',
        recordType: 'sale_commission',
        recordId: saleId,
        newValue: { count: updated.length },
        ...meta(req),
      });
    }
    return updated;
  }

  /** Reverse commission proportional to returned amount. */
  reverseForReturn(saleId, returnGrandTotal, actor, req) {
    const sale = repos.posSales.findById(saleId);
    if (!sale || !(sale.grandTotal > 0)) return [];
    const ratio = Math.min(1, Number(returnGrandTotal) / Number(sale.grandTotal));
    const rows = commissionRepo.findBySale(saleId);
    const updated = [];
    for (const row of rows) {
      const reverseAmt = round2(row.commissionEarned * ratio);
      const newReversed = round2(row.commissionReversed + reverseAmt);
      const netEarned = round2(Math.max(0, row.commissionEarned - newReversed));
      const paymentReceived = round2(Number(sale.amountPaid || 0) * (Number(row.sharePercent || 100) / 100));
      const eligible = Math.min(
        resolveEligible({
          paymentCondition: row.paymentCondition,
          commissionEarned: netEarned,
          paymentReceived,
          salesAmount: round2(row.salesAmount * (1 - ratio)),
        }),
        Math.max(row.commissionPaid, 0)
      );
      // eligible should not exceed net earned; keep paid intact
      const nextEligible = round2(Math.max(row.commissionPaid, Math.min(netEarned, resolveEligible({
        paymentCondition: row.paymentCondition,
        commissionEarned: netEarned,
        paymentReceived,
        salesAmount: round2(Math.max(0.01, row.salesAmount * (1 - ratio))),
      }))));
      void eligible;
      updated.push(commissionRepo.updateAmounts(row.id, {
        commissionReversed: newReversed,
        commissionEarned: row.commissionEarned, // keep original earned; track via reversed
        commissionEligible: nextEligible,
        status: newReversed + 0.01 >= row.commissionEarned ? 'reversed' : undefined,
        remarks: `Return reversal ${reverseAmt}`,
      }));
    }
    if (actor) {
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'reverse',
        module: 'sales',
        recordType: 'sale_commission',
        recordId: saleId,
        newValue: { returnGrandTotal, ratio },
        ...meta(req),
      });
    }
    return updated;
  }

  listCommissions(query, actor) {
    requirePerm(actor, 'sales.commissions.view');
    return commissionRepo.list({
      salesAgentId: query.salesAgentId,
      customerId: query.customerId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search || query.q,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }

  getCommission(id, actor) {
    requirePerm(actor, 'sales.commissions.view');
    const row = commissionRepo.findById(id);
    if (!row) throw new AppError('Commission not found', 404);
    return row;
  }

  agentDashboard(agentId, query, actor) {
    requirePerm(actor, 'sales.agents.view');
    if (!agentRepo.findById(agentId)) throw new AppError('Sales agent not found', 404);
    const summary = commissionRepo.agentDashboard(agentId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const ledger = commissionRepo.list({
      salesAgentId: agentId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: 200,
    });
    return { agent: agentRepo.findById(agentId), summary, ledger: ledger.items };
  }

  performanceReport(query, actor) {
    requirePerm(actor, 'sales.commission_reports.view');
    return commissionRepo.performanceReport({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  reportCsv(query, actor) {
    const { items } = this.listCommissions({ ...query, limit: 5000 }, actor);
    const header = [
      'Agent', 'Invoice', 'Date', 'Customer', 'Sales', 'Taxable', 'PaymentReceived',
      'Rate', 'Earned', 'Reversed', 'Paid', 'Due', 'Status',
    ];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push([
        r.salesAgentName, r.invoiceNumber, r.saleDate, r.customerName,
        r.salesAmount, r.taxableAmount, r.paymentReceived, r.rateSnapshot,
        r.commissionEarned, r.commissionReversed, r.commissionPaid, r.commissionDue, r.status,
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }

  // ── Payments ────────────────────────────────────────────
  listPayments(query, actor) {
    requirePerm(actor, 'sales.commission_payments.view');
    return paymentRepo.list({
      salesAgentId: query.salesAgentId,
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
    });
  }

  getPayment(id, actor) {
    requirePerm(actor, 'sales.commission_payments.view');
    const pay = paymentRepo.findById(id);
    if (!pay) throw new AppError('Commission payment not found', 404);
    return { ...pay, allocations: paymentRepo.listAllocations(id) };
  }

  createPayment(data, actor, req) {
    requirePerm(actor, 'sales.commission_payments.create');
    if (!data.salesAgentId) throw new AppError('Sales agent required', 400);
    if (!agentRepo.findById(data.salesAgentId)) throw new AppError('Sales agent not found', 404);
    const amount = round2(data.amount);
    if (!(amount > 0)) throw new AppError('Amount must be positive', 400);
    const mode = String(data.paymentMode || '').toLowerCase();
    if (!['cash', 'bank', 'upi', 'cheque', 'other'].includes(mode)) {
      throw new AppError('Invalid payment mode', 400);
    }

    const firm = numberingRepo.getFirm(data.firmId) || numberingRepo.getFirm();
    numberingRepo.ensureDefaultSeries(firm?.id);
    const { documentNumber } = numberingRepo.allocateNumber(
      firm?.id,
      'commission_payment',
      data.paymentDate || new Date()
    );

    const payment = paymentRepo.create({
      voucherNumber: documentNumber,
      firmId: firm?.id,
      paymentDate: data.paymentDate || new Date().toISOString().slice(0, 10),
      salesAgentId: data.salesAgentId,
      paymentMode: mode,
      paymentAccountId: data.paymentAccountId,
      amount,
      referenceNumber: data.referenceNumber,
      utrNumber: data.utrNumber,
      chequeNumber: data.chequeNumber,
      remarks: data.remarks,
      createdBy: actor.user.id,
    });

    const allocations = Array.isArray(data.allocations) ? data.allocations : [];
    let allocSum = 0;
    for (const line of allocations) {
      const amt = round2(line.allocatedAmount ?? line.amount);
      if (!(amt > 0)) continue;
      const comm = commissionRepo.findById(line.saleCommissionId || line.commissionId);
      if (!comm || comm.salesAgentId !== data.salesAgentId) {
        throw new AppError('Invalid commission entry for this agent', 400);
      }
      if (amt > comm.commissionDue + 0.02) {
        throw new AppError(`Allocation exceeds due for ${comm.invoiceNumber}`, 400);
      }
      allocSum = round2(allocSum + amt);
    }
    if (allocSum > amount + 0.02) throw new AppError('Allocations exceed payment amount', 400);

    for (const line of allocations) {
      const amt = round2(line.allocatedAmount ?? line.amount);
      if (!(amt > 0)) continue;
      paymentRepo.addAllocation(payment.id, line.saleCommissionId || line.commissionId, amt);
    }

    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'create', module: 'sales', recordType: 'commission_payment', recordId: payment.id,
      newValue: payment, ...meta(req),
    });

    if (data.post === true) {
      return this.postPayment(payment.id, actor, req);
    }
    return this.getPayment(payment.id, actor);
  }

  postPayment(id, actor, req) {
    requirePerm(actor, 'sales.commission_payments.approve');
    const payment = paymentRepo.findById(id);
    if (!payment) throw new AppError('Commission payment not found', 404);
    if (payment.status !== 'draft') throw new AppError('Only draft payments can be posted', 400);
    if (payment.createdBy === actor.user.id
      && !actor.permissions.includes('*')
      && actor.user.roleSlug !== 'owner_admin') {
      // self-approval protection for non-owners
      throw new AppError('You cannot approve your own commission payment', 400);
    }
    if (!payment.paymentAccountId) throw new AppError('Payment account required', 400);

    const allocations = paymentRepo.listAllocations(id);
    if (!allocations.length) throw new AppError('Add at least one commission allocation', 400);

    for (const line of allocations) {
      const comm = commissionRepo.findById(line.saleCommissionId);
      if (!comm) throw new AppError('Commission entry missing', 400);
      const newPaid = round2(comm.commissionPaid + line.allocatedAmount);
      commissionRepo.updateAmounts(comm.id, { commissionPaid: newPaid });
    }

    cashRepo.create({
      entryDate: payment.paymentDate,
      firmId: payment.firmId,
      paymentAccountId: payment.paymentAccountId,
      direction: 'out',
      amount: payment.amount,
      paymentMode: payment.paymentMode,
      reference: payment.voucherNumber,
      sourceType: 'commission_payment',
      sourceId: payment.id,
      createdBy: actor.user.id,
    });

    const posted = paymentRepo.markPosted(id, { approvedBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'post', module: 'sales', recordType: 'commission_payment', recordId: id,
      previousValue: payment, newValue: posted, ...meta(req),
    });
    return this.getPayment(id, actor);
  }

  #normalizeAgentShares(agents) {
    const list = (agents || []).filter((a) => a?.salesAgentId);
    if (!list.length) return [];
    const total = list.reduce((s, a) => s + Number(a.sharePercent || 0), 0);
    if (total <= 0) {
      return list.map((a) => ({ ...a, sharePercent: round2(100 / list.length) }));
    }
    if (total > 100.02) throw new AppError('Agent share total cannot exceed 100%', 400);
    if (list.length === 1 && !list[0].sharePercent) return [{ ...list[0], sharePercent: 100 }];
    return list.map((a) => ({ ...a, sharePercent: Number(a.sharePercent || 0) }));
  }

  #estimateCogs(items) {
    let cogs = 0;
    for (const item of items) {
      if (!item.productId) continue;
      const product = productRepo.findById(item.productId);
      const cost = Number(product?.purchasePrice || 0);
      cogs += cost * Number(item.quantity || 0);
    }
    return round2(cogs);
  }

  #resolveRule({ agent, customerId, items, salesAmount }) {
    const plan = (agent.commissionPlanId && planRepo.findById(agent.commissionPlanId))
      || planRepo.findDefault();

    const rules = plan ? planRepo.listRules(plan.id).filter((r) => r.isActive) : [];
    const productIds = new Set((items || []).map((i) => i.productId).filter(Boolean));
    const brandIds = new Set();
    const categoryIds = new Set();
    for (const pid of productIds) {
      const p = productRepo.findById(pid);
      if (p?.brandId) brandIds.add(p.brandId);
      if (p?.categoryId) categoryIds.add(p.categoryId);
    }

    const priorityOrder = ['invoice_override', 'customer', 'product', 'brand', 'category', 'agent', 'default'];
    let matched = null;
    for (const type of priorityOrder) {
      matched = rules.find((r) => {
        if (r.ruleType !== type) return false;
        if (type === 'customer') return r.customerId === customerId;
        if (type === 'product') return productIds.has(r.productId);
        if (type === 'brand') return brandIds.has(r.brandId);
        if (type === 'category') return categoryIds.has(r.categoryId);
        if (type === 'agent') return r.salesAgentId === agent.id;
        return true;
      });
      if (matched) break;
    }

    if (matched) {
      return {
        planId: plan?.id || null,
        ruleId: matched.id,
        calculationMethod: matched.calculationMethod,
        rate: matched.rate,
        fixedAmount: matched.fixedAmount,
        minSalesAmount: matched.minSalesAmount,
        maxCommission: matched.maxCommission,
        paymentCondition: plan?.paymentCondition || 'on_payment_received',
        label: `Rule:${matched.ruleType}`,
      };
    }

    if (plan) {
      return {
        planId: plan.id,
        ruleId: null,
        calculationMethod: plan.calculationMethod,
        rate: plan.rate,
        fixedAmount: plan.fixedAmount,
        minSalesAmount: plan.minSalesAmount,
        maxCommission: plan.maxCommission,
        paymentCondition: plan.paymentCondition,
        label: `Plan:${plan.name}`,
      };
    }

    // Agent defaults
    const basis = agent.defaultCommissionBasis || 'taxable';
    const method = basis === 'sales_value' ? 'percent_sales_value'
      : basis === 'gross_profit' ? 'percent_gross_profit'
        : basis === 'fixed' ? 'fixed_per_invoice'
          : 'percent_taxable';
    return {
      planId: null,
      ruleId: null,
      calculationMethod: method,
      rate: agent.defaultCommissionRate || 0,
      fixedAmount: 0,
      minSalesAmount: null,
      maxCommission: null,
      paymentCondition: 'on_payment_received',
      label: 'Agent default',
    };
  }
}

export const commissionService = new CommissionService();
