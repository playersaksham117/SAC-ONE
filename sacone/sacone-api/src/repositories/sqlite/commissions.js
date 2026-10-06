import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

export function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function mapAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentCode: row.agent_code,
    name: row.name,
    agentType: row.agent_type,
    userId: row.user_id || null,
    loginEmail: row.login_email || null,
    loginActive: row.login_active != null ? Boolean(row.login_active) : null,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    joiningDate: row.joining_date,
    status: row.status,
    commissionPlanId: row.commission_plan_id,
    commissionPlanName: row.plan_name || null,
    defaultCommissionRate: Number(row.default_commission_rate || 0),
    defaultCommissionBasis: row.default_commission_basis,
    bankAccountName: row.bank_account_name,
    bankAccountNumber: row.bank_account_number,
    bankIfsc: row.bank_ifsc,
    bankName: row.bank_name,
    remarks: row.remarks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    calculationMethod: row.calculation_method,
    rate: Number(row.rate || 0),
    fixedAmount: Number(row.fixed_amount || 0),
    minSalesAmount: row.min_sales_amount != null ? Number(row.min_sales_amount) : null,
    maxCommission: row.max_commission != null ? Number(row.max_commission) : null,
    paymentCondition: row.payment_condition,
    returnPeriodDays: Number(row.return_period_days || 0),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    priority: Number(row.priority || 100),
    ruleType: row.rule_type,
    customerId: row.customer_id,
    productId: row.product_id,
    brandId: row.brand_id,
    categoryId: row.category_id,
    salesAgentId: row.sales_agent_id,
    calculationMethod: row.calculation_method,
    rate: Number(row.rate || 0),
    fixedAmount: Number(row.fixed_amount || 0),
    minSalesAmount: row.min_sales_amount != null ? Number(row.min_sales_amount) : null,
    maxCommission: row.max_commission != null ? Number(row.max_commission) : null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommission(row) {
  if (!row) return null;
  return {
    id: row.id,
    saleId: row.sale_id,
    invoiceNumber: row.invoice_number,
    saleDate: row.sale_date,
    firmId: row.firm_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    salesAgentId: row.sales_agent_id,
    salesAgentName: row.agent_name || null,
    salesAgentCode: row.agent_code || null,
    sharePercent: Number(row.share_percent || 100),
    planId: row.plan_id,
    ruleId: row.rule_id,
    ruleSnapshot: row.rule_snapshot_json ? JSON.parse(row.rule_snapshot_json) : null,
    calculationMethod: row.calculation_method,
    commissionBasis: row.commission_basis,
    rateSnapshot: Number(row.rate_snapshot || 0),
    fixedAmountSnapshot: Number(row.fixed_amount_snapshot || 0),
    salesAmount: round2(row.sales_amount),
    taxableAmount: round2(row.taxable_amount),
    gstAmount: round2(row.gst_amount),
    cogsAmount: round2(row.cogs_amount),
    grossProfit: round2(row.gross_profit),
    paymentReceived: round2(row.payment_received),
    paymentCondition: row.payment_condition,
    commissionEarned: round2(row.commission_earned),
    commissionReversed: round2(row.commission_reversed),
    commissionEligible: round2(row.commission_eligible),
    commissionPaid: round2(row.commission_paid),
    commissionDue: round2(row.commission_due),
    status: row.status,
    appliedRuleLabel: row.applied_rule_label,
    remarks: row.remarks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    firmId: row.firm_id,
    paymentDate: row.payment_date,
    salesAgentId: row.sales_agent_id,
    salesAgentName: row.agent_name || null,
    paymentMode: row.payment_mode,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    amount: round2(row.amount),
    allocatedAmount: round2(row.allocated_amount),
    referenceNumber: row.reference_number,
    utrNumber: row.utr_number,
    chequeNumber: row.cheque_number,
    remarks: row.remarks,
    status: row.status,
    financialTransactionId: row.financial_transaction_id,
    postedAt: row.posted_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COMM_SELECT = `
  SELECT sc.*,
    a.name as agent_name, a.agent_code,
    c.name as customer_name
  FROM sale_commissions sc
  LEFT JOIN sales_agents a ON a.id = sc.sales_agent_id
  LEFT JOIN customers c ON c.id = sc.customer_id
`;

export class SalesAgentRepository {
  list({ status, search, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('a.status = ?'); params.push(status); }
    if (search) {
      where.push(`(LOWER(a.name) LIKE ? OR LOWER(a.agent_code) LIKE ? OR LOWER(COALESCE(a.mobile,'')) LIKE ?)`);
      const q = `%${String(search).toLowerCase()}%`;
      params.push(q, q, q);
    }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return getDatabase().prepare(`
      SELECT a.*, p.name as plan_name, u.email as login_email, u.is_active as login_active
      FROM sales_agents a
      LEFT JOIN commission_plans p ON p.id = a.commission_plan_id
      LEFT JOIN users u ON u.id = a.user_id
      ${wh}
      ORDER BY a.name
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapAgent);
  }

  findById(id) {
    return mapAgent(getDatabase().prepare(`
      SELECT a.*, p.name as plan_name, u.email as login_email, u.is_active as login_active
      FROM sales_agents a
      LEFT JOIN commission_plans p ON p.id = a.commission_plan_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.id = ?
    `).get(id));
  }

  /** The agent that is this ERP user (sales staff selling under their own login). */
  findByUserId(userId) {
    if (!userId) return null;
    const row = getDatabase().prepare('SELECT id FROM sales_agents WHERE user_id = ?').get(userId);
    return row ? this.findById(row.id) : null;
  }

  setUserId(id, userId) {
    getDatabase().prepare('UPDATE sales_agents SET user_id = ?, updated_at = ? WHERE id = ?').run(userId || null, nowIso(), id);
    return this.findById(id);
  }

  codeExists(code, excludeId = null) {
    const row = excludeId
      ? getDatabase().prepare('SELECT id FROM sales_agents WHERE agent_code = ? AND id != ?').get(code, excludeId)
      : getDatabase().prepare('SELECT id FROM sales_agents WHERE agent_code = ?').get(code);
    return Boolean(row);
  }

  nextCode() {
    const n = getDatabase().prepare('SELECT COUNT(*) as c FROM sales_agents').get().c;
    return `SA-${String(n + 1).padStart(4, '0')}`;
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO sales_agents (
        id, agent_code, name, agent_type, mobile, email, address, joining_date,
        status, commission_plan_id, default_commission_rate, default_commission_basis,
        bank_account_name, bank_account_number, bank_ifsc, bank_name, remarks,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.agentCode,
      data.name,
      data.agentType || 'internal',
      data.mobile || null,
      data.email || null,
      data.address || null,
      data.joiningDate || null,
      data.status || 'active',
      data.commissionPlanId || null,
      Number(data.defaultCommissionRate || 0),
      data.defaultCommissionBasis || 'taxable',
      data.bankAccountName || null,
      data.bankAccountNumber || null,
      data.bankIfsc || null,
      data.bankName || null,
      data.remarks || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    getDatabase().prepare(`
      UPDATE sales_agents SET
        agent_code = ?, name = ?, agent_type = ?, mobile = ?, email = ?,
        address = ?, joining_date = ?, status = ?, commission_plan_id = ?,
        default_commission_rate = ?, default_commission_basis = ?,
        bank_account_name = ?, bank_account_number = ?, bank_ifsc = ?, bank_name = ?,
        remarks = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.agentCode ?? existing.agentCode,
      data.name ?? existing.name,
      data.agentType ?? existing.agentType,
      data.mobile !== undefined ? data.mobile : existing.mobile,
      data.email !== undefined ? data.email : existing.email,
      data.address !== undefined ? data.address : existing.address,
      data.joiningDate !== undefined ? data.joiningDate : existing.joiningDate,
      data.status ?? existing.status,
      data.commissionPlanId !== undefined ? data.commissionPlanId : existing.commissionPlanId,
      data.defaultCommissionRate !== undefined ? Number(data.defaultCommissionRate) : existing.defaultCommissionRate,
      data.defaultCommissionBasis ?? existing.defaultCommissionBasis,
      data.bankAccountName !== undefined ? data.bankAccountName : existing.bankAccountName,
      data.bankAccountNumber !== undefined ? data.bankAccountNumber : existing.bankAccountNumber,
      data.bankIfsc !== undefined ? data.bankIfsc : existing.bankIfsc,
      data.bankName !== undefined ? data.bankName : existing.bankName,
      data.remarks !== undefined ? data.remarks : existing.remarks,
      nowIso(),
      id
    );
    return this.findById(id);
  }
}

export class CommissionPlanRepository {
  list({ activeOnly = false } = {}) {
    const wh = activeOnly ? 'WHERE is_active = 1' : '';
    return getDatabase().prepare(`SELECT * FROM commission_plans ${wh} ORDER BY is_default DESC, name`).all().map(mapPlan);
  }

  findById(id) {
    return mapPlan(getDatabase().prepare('SELECT * FROM commission_plans WHERE id = ?').get(id));
  }

  findDefault() {
    return mapPlan(getDatabase().prepare('SELECT * FROM commission_plans WHERE is_default = 1 AND is_active = 1 LIMIT 1').get());
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    if (data.isDefault) {
      getDatabase().prepare('UPDATE commission_plans SET is_default = 0').run();
    }
    getDatabase().prepare(`
      INSERT INTO commission_plans (
        id, code, name, description, calculation_method, rate, fixed_amount,
        min_sales_amount, max_commission, payment_condition, return_period_days,
        effective_from, effective_to, is_active, is_default, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.code,
      data.name,
      data.description || null,
      data.calculationMethod || 'percent_taxable',
      Number(data.rate || 0),
      Number(data.fixedAmount || 0),
      data.minSalesAmount ?? null,
      data.maxCommission ?? null,
      data.paymentCondition || 'on_payment_received',
      Number(data.returnPeriodDays || 0),
      data.effectiveFrom || null,
      data.effectiveTo || null,
      data.isActive === false ? 0 : 1,
      data.isDefault ? 1 : 0,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    if (data.isDefault) getDatabase().prepare('UPDATE commission_plans SET is_default = 0').run();
    getDatabase().prepare(`
      UPDATE commission_plans SET
        code = ?, name = ?, description = ?, calculation_method = ?, rate = ?, fixed_amount = ?,
        min_sales_amount = ?, max_commission = ?, payment_condition = ?, return_period_days = ?,
        effective_from = ?, effective_to = ?, is_active = ?, is_default = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.code ?? existing.code,
      data.name ?? existing.name,
      data.description !== undefined ? data.description : existing.description,
      data.calculationMethod ?? existing.calculationMethod,
      data.rate !== undefined ? Number(data.rate) : existing.rate,
      data.fixedAmount !== undefined ? Number(data.fixedAmount) : existing.fixedAmount,
      data.minSalesAmount !== undefined ? data.minSalesAmount : existing.minSalesAmount,
      data.maxCommission !== undefined ? data.maxCommission : existing.maxCommission,
      data.paymentCondition ?? existing.paymentCondition,
      data.returnPeriodDays !== undefined ? Number(data.returnPeriodDays) : existing.returnPeriodDays,
      data.effectiveFrom !== undefined ? data.effectiveFrom : existing.effectiveFrom,
      data.effectiveTo !== undefined ? data.effectiveTo : existing.effectiveTo,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : (existing.isDefault ? 1 : 0),
      nowIso(),
      id
    );
    return this.findById(id);
  }

  listRules(planId) {
    return getDatabase().prepare(`
      SELECT * FROM commission_rules WHERE plan_id = ? ORDER BY priority ASC, created_at ASC
    `).all(planId).map(mapRule);
  }

  createRule(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO commission_rules (
        id, plan_id, priority, rule_type, customer_id, product_id, brand_id, category_id,
        sales_agent_id, calculation_method, rate, fixed_amount, min_sales_amount, max_commission,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      data.planId,
      data.priority ?? 100,
      data.ruleType,
      data.customerId || null,
      data.productId || null,
      data.brandId || null,
      data.categoryId || null,
      data.salesAgentId || null,
      data.calculationMethod || 'percent_taxable',
      Number(data.rate || 0),
      Number(data.fixedAmount || 0),
      data.minSalesAmount ?? null,
      data.maxCommission ?? null,
      now,
      now
    );
    return mapRule(getDatabase().prepare('SELECT * FROM commission_rules WHERE id = ?').get(id));
  }

  seedDefaultIfEmpty(createdBy) {
    const count = getDatabase().prepare('SELECT COUNT(*) as c FROM commission_plans').get().c;
    if (count > 0) return { seeded: false };
    this.create({
      code: 'DEFAULT-2PCT',
      name: 'Default 2% on Taxable',
      calculationMethod: 'percent_taxable',
      rate: 2,
      paymentCondition: 'on_payment_received',
      isDefault: true,
      isActive: true,
      createdBy,
    });
    return { seeded: true };
  }
}

export class SaleCommissionRepository {
  findById(id) {
    return mapCommission(getDatabase().prepare(`${COMM_SELECT} WHERE sc.id = ?`).get(id));
  }

  findBySale(saleId) {
    return getDatabase().prepare(`${COMM_SELECT} WHERE sc.sale_id = ?`).all(saleId).map(mapCommission);
  }

  list({
    salesAgentId, customerId, status, dateFrom, dateTo, search, limit = 100, offset = 0,
  } = {}) {
    const where = [];
    const params = [];
    if (salesAgentId) { where.push('sc.sales_agent_id = ?'); params.push(salesAgentId); }
    if (customerId) { where.push('sc.customer_id = ?'); params.push(customerId); }
    if (status) { where.push('sc.status = ?'); params.push(status); }
    if (dateFrom) { where.push('sc.sale_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('sc.sale_date <= ?'); params.push(dateTo); }
    if (search) {
      where.push(`(LOWER(COALESCE(sc.invoice_number,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ?)`);
      const q = `%${String(search).toLowerCase()}%`;
      params.push(q, q);
    }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = getDatabase().prepare(`
      ${COMM_SELECT} ${wh}
      ORDER BY sc.sale_date DESC, sc.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapCommission);
    const total = getDatabase().prepare(`
      SELECT COUNT(*) as c FROM sale_commissions sc
      LEFT JOIN customers c ON c.id = sc.customer_id
      ${wh}
    `).get(...params).c;
    return { items, total, limit, offset };
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const due = round2(Math.max(0, Number(data.commissionEligible || 0) - Number(data.commissionPaid || 0)));
    getDatabase().prepare(`
      INSERT INTO sale_commissions (
        id, sale_id, invoice_number, sale_date, firm_id, branch_id, customer_id, sales_agent_id,
        share_percent, plan_id, rule_id, rule_snapshot_json, calculation_method, commission_basis,
        rate_snapshot, fixed_amount_snapshot, sales_amount, taxable_amount, gst_amount,
        cogs_amount, gross_profit, payment_received, payment_condition,
        commission_earned, commission_reversed, commission_eligible, commission_paid, commission_due,
        status, applied_rule_label, remarks, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.saleId,
      data.invoiceNumber || null,
      data.saleDate || now.slice(0, 10),
      data.firmId || null,
      data.branchId || null,
      data.customerId || null,
      data.salesAgentId,
      Number(data.sharePercent ?? 100),
      data.planId || null,
      data.ruleId || null,
      data.ruleSnapshot ? JSON.stringify(data.ruleSnapshot) : null,
      data.calculationMethod,
      data.commissionBasis,
      Number(data.rateSnapshot || 0),
      Number(data.fixedAmountSnapshot || 0),
      round2(data.salesAmount),
      round2(data.taxableAmount),
      round2(data.gstAmount || 0),
      round2(data.cogsAmount || 0),
      round2(data.grossProfit || 0),
      round2(data.paymentReceived || 0),
      data.paymentCondition,
      round2(data.commissionEarned),
      round2(data.commissionReversed || 0),
      round2(data.commissionEligible || 0),
      round2(data.commissionPaid || 0),
      due,
      data.status || 'pending',
      data.appliedRuleLabel || null,
      data.remarks || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  updateAmounts(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const earned = data.commissionEarned != null ? round2(data.commissionEarned) : existing.commissionEarned;
    const reversed = data.commissionReversed != null ? round2(data.commissionReversed) : existing.commissionReversed;
    const eligible = data.commissionEligible != null ? round2(data.commissionEligible) : existing.commissionEligible;
    const paid = data.commissionPaid != null ? round2(data.commissionPaid) : existing.commissionPaid;
    const due = round2(Math.max(0, eligible - paid));
    let status = data.status || existing.status;
    if (!data.status) {
      if (earned <= 0 && reversed > 0) status = 'reversed';
      else if (due <= 0.001 && paid > 0) status = 'paid';
      else if (paid > 0 && due > 0) status = 'partially_paid';
      else if (eligible > 0) status = 'eligible';
      else if (earned > 0) status = 'earned';
      else status = existing.status;
    }
    getDatabase().prepare(`
      UPDATE sale_commissions SET
        payment_received = COALESCE(?, payment_received),
        commission_earned = ?,
        commission_reversed = ?,
        commission_eligible = ?,
        commission_paid = ?,
        commission_due = ?,
        status = ?,
        remarks = COALESCE(?, remarks),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.paymentReceived != null ? round2(data.paymentReceived) : null,
      earned,
      reversed,
      eligible,
      paid,
      due,
      status,
      data.remarks ?? null,
      nowIso(),
      id
    );
    return this.findById(id);
  }

  agentDashboard(agentId, { dateFrom, dateTo } = {}) {
    const where = ['sc.sales_agent_id = ?'];
    const params = [agentId];
    if (dateFrom) { where.push('sc.sale_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('sc.sale_date <= ?'); params.push(dateTo); }
    const wh = `WHERE ${where.join(' AND ')}`;
    const row = getDatabase().prepare(`
      SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(sales_amount),0) as total_sales,
        COALESCE(SUM(taxable_amount),0) as taxable,
        COALESCE(SUM(payment_received),0) as collections,
        COALESCE(SUM(commission_earned),0) as earned,
        COALESCE(SUM(commission_eligible),0) as eligible,
        COALESCE(SUM(commission_paid),0) as paid,
        COALESCE(SUM(commission_due),0) as due,
        COALESCE(SUM(commission_reversed),0) as reversed
      FROM sale_commissions sc ${wh}
    `).get(...params);
    return {
      invoiceCount: Number(row.invoice_count || 0),
      totalSales: round2(row.total_sales),
      taxable: round2(row.taxable),
      collections: round2(row.collections),
      commissionEarned: round2(row.earned),
      commissionEligible: round2(row.eligible),
      commissionPaid: round2(row.paid),
      commissionDue: round2(row.due),
      commissionReversed: round2(row.reversed),
      averageInvoice: row.invoice_count ? round2(row.total_sales / row.invoice_count) : 0,
    };
  }

  performanceReport({ dateFrom, dateTo } = {}) {
    const where = [];
    const params = [];
    if (dateFrom) { where.push('sc.sale_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('sc.sale_date <= ?'); params.push(dateTo); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return getDatabase().prepare(`
      SELECT
        sc.sales_agent_id as agent_id,
        a.name as agent_name,
        a.agent_code,
        COUNT(*) as invoice_count,
        COALESCE(SUM(sc.sales_amount),0) as total_sales,
        COALESCE(SUM(sc.payment_received),0) as collections,
        COALESCE(SUM(sc.commission_earned),0) as earned,
        COALESCE(SUM(sc.commission_paid),0) as paid,
        COALESCE(SUM(sc.commission_due),0) as due,
        COALESCE(SUM(sc.commission_reversed),0) as reversed,
        COALESCE(SUM(sc.gross_profit),0) as gross_profit
      FROM sale_commissions sc
      LEFT JOIN sales_agents a ON a.id = sc.sales_agent_id
      ${wh}
      GROUP BY sc.sales_agent_id
      ORDER BY total_sales DESC
    `).all(...params).map((r) => ({
      agentId: r.agent_id,
      agentName: r.agent_name,
      agentCode: r.agent_code,
      invoiceCount: Number(r.invoice_count),
      totalSales: round2(r.total_sales),
      collections: round2(r.collections),
      commissionEarned: round2(r.earned),
      commissionPaid: round2(r.paid),
      commissionDue: round2(r.due),
      commissionReversed: round2(r.reversed),
      grossProfit: round2(r.gross_profit),
      averageInvoice: r.invoice_count ? round2(r.total_sales / r.invoice_count) : 0,
      commissionPctOfSales: r.total_sales ? round2((r.earned / r.total_sales) * 100) : 0,
    }));
  }
}

export class CommissionPaymentRepository {
  findById(id) {
    return mapPayment(getDatabase().prepare(`
      SELECT p.*, a.name as agent_name, acc.name as payment_account_name
      FROM commission_payments p
      LEFT JOIN sales_agents a ON a.id = p.sales_agent_id
      LEFT JOIN financial_payment_accounts acc ON acc.id = p.payment_account_id
      WHERE p.id = ?
    `).get(id));
  }

  list({ salesAgentId, status, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (salesAgentId) { where.push('p.sales_agent_id = ?'); params.push(salesAgentId); }
    if (status) { where.push('p.status = ?'); params.push(status); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = getDatabase().prepare(`
      SELECT p.*, a.name as agent_name, acc.name as payment_account_name
      FROM commission_payments p
      LEFT JOIN sales_agents a ON a.id = p.sales_agent_id
      LEFT JOIN financial_payment_accounts acc ON acc.id = p.payment_account_id
      ${wh}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapPayment);
    return { items, total: items.length, limit, offset };
  }

  listAllocations(paymentId) {
    return getDatabase().prepare(`
      SELECT pa.*, sc.invoice_number, sc.commission_due, sc.status as commission_status
      FROM commission_payment_allocations pa
      JOIN sale_commissions sc ON sc.id = pa.sale_commission_id
      WHERE pa.payment_id = ?
    `).all(paymentId).map((r) => ({
      id: r.id,
      paymentId: r.payment_id,
      saleCommissionId: r.sale_commission_id,
      allocatedAmount: round2(r.allocated_amount),
      invoiceNumber: r.invoice_number,
      createdAt: r.created_at,
    }));
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO commission_payments (
        id, voucher_number, firm_id, payment_date, sales_agent_id, payment_mode,
        payment_account_id, amount, allocated_amount, reference_number, utr_number,
        cheque_number, remarks, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      id,
      data.voucherNumber,
      data.firmId || null,
      data.paymentDate,
      data.salesAgentId,
      data.paymentMode,
      data.paymentAccountId || null,
      round2(data.amount),
      data.referenceNumber || null,
      data.utrNumber || null,
      data.chequeNumber || null,
      data.remarks || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  markPosted(id, { approvedBy, financialTransactionId } = {}) {
    getDatabase().prepare(`
      UPDATE commission_payments SET
        status = 'posted', posted_at = ?, approved_by = ?, financial_transaction_id = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), approvedBy || null, financialTransactionId || null, nowIso(), id);
    return this.findById(id);
  }

  addAllocation(paymentId, saleCommissionId, amount) {
    const id = generateId();
    getDatabase().prepare(`
      INSERT INTO commission_payment_allocations (id, payment_id, sale_commission_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, paymentId, saleCommissionId, round2(amount), nowIso());
    getDatabase().prepare(`
      UPDATE commission_payments SET allocated_amount = allocated_amount + ?, updated_at = ? WHERE id = ?
    `).run(round2(amount), nowIso(), paymentId);
    return id;
  }

  markCancelled(id, reason) {
    getDatabase().prepare(`
      UPDATE commission_payments SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), reason || null, nowIso(), id);
    return this.findById(id);
  }
}

/* ───────────── minimum selling prices (Commission settings) ───────────── */

function mapMinPrice(row) {
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    productId: row.product_id,
    brandId: row.brand_id,
    categoryId: row.category_id,
    targetName: row.target_name || null,
    targetCode: row.target_code || null,
    targetMrp: row.target_mrp != null ? Number(row.target_mrp) : null,
    minPrice: row.min_price != null ? Number(row.min_price) : null,
    minPercentOfMrp: row.min_percent_of_mrp != null ? Number(row.min_percent_of_mrp) : null,
    isActive: Boolean(row.is_active),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MIN_PRICE_SELECT = `
  SELECT m.*,
    COALESCE(p.name, b.name, c.name) AS target_name,
    COALESCE(p.sku, b.code, c.code) AS target_code,
    p.mrp AS target_mrp
  FROM min_selling_prices m
  LEFT JOIN products p ON p.id = m.product_id
  LEFT JOIN brands b ON b.id = m.brand_id
  LEFT JOIN categories c ON c.id = m.category_id
`;

/** Floor for one product from the active rules: product > brand > category. */
export function resolveFloor(product, rules) {
  const rule = rules.product.get(product.id)
    || (product.brandId && rules.brand.get(product.brandId))
    || (product.categoryId && rules.category.get(product.categoryId));
  if (!rule) return null;
  if (rule.minPrice != null) return { floor: round2(rule.minPrice), rule };
  const base = Number(product.mrp || product.sellingPrice || 0);
  if (!(base > 0)) return null;
  return { floor: round2(base * (rule.minPercentOfMrp / 100)), rule };
}

export class MinSellingPriceRepository {
  list() {
    return getDatabase().prepare(`${MIN_PRICE_SELECT} ORDER BY m.scope, target_name`).all().map(mapMinPrice);
  }

  findById(id) {
    return mapMinPrice(getDatabase().prepare(`${MIN_PRICE_SELECT} WHERE m.id = ?`).get(id));
  }

  /** Active rules indexed by target, for resolveFloor(). */
  activeRules() {
    const rules = { product: new Map(), brand: new Map(), category: new Map() };
    for (const r of getDatabase().prepare('SELECT * FROM min_selling_prices WHERE is_active = 1').all().map(mapMinPrice)) {
      const key = r.scope === 'product' ? r.productId : r.scope === 'brand' ? r.brandId : r.categoryId;
      rules[r.scope].set(key, r);
    }
    return rules;
  }

  /** Insert or replace the rule for one target. */
  upsert({ scope, targetId, minPrice, minPercentOfMrp, isActive = true, notes, createdBy }) {
    const db = getDatabase();
    const column = `${scope}_id`;
    const existing = db.prepare(`SELECT id FROM min_selling_prices WHERE scope = ? AND ${column} = ?`).get(scope, targetId);
    const now = nowIso();
    if (existing) {
      db.prepare(`
        UPDATE min_selling_prices
        SET min_price = ?, min_percent_of_mrp = ?, is_active = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(minPrice, minPercentOfMrp, isActive ? 1 : 0, notes || null, now, existing.id);
      return this.findById(existing.id);
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO min_selling_prices (
        id, scope, product_id, brand_id, category_id, min_price, min_percent_of_mrp,
        is_active, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, scope,
      scope === 'product' ? targetId : null,
      scope === 'brand' ? targetId : null,
      scope === 'category' ? targetId : null,
      minPrice, minPercentOfMrp, isActive ? 1 : 0, notes || null, createdBy || null, now, now,
    );
    return this.findById(id);
  }

  remove(id) {
    return getDatabase().prepare('DELETE FROM min_selling_prices WHERE id = ?').run(id).changes > 0;
  }
}
