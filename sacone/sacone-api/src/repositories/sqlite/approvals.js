import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function mapRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    module: row.module,
    action: row.action,
    transactionType: row.transaction_type,
    conditionType: row.condition_type,
    thresholdAmount: row.threshold_amount != null ? round2(row.threshold_amount) : null,
    thresholdQuantity: row.threshold_quantity != null ? Number(row.threshold_quantity) : null,
    thresholdPercent: row.threshold_percent != null ? Number(row.threshold_percent) : null,
    firmId: row.firm_id,
    branchId: row.branch_id,
    level1RoleSlug: row.level1_role_slug,
    level2RoleSlug: row.level2_role_slug,
    allowSelfApproval: Boolean(row.allow_self_approval),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 100),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name || null,
    module: row.module,
    action: row.action,
    transactionType: row.transaction_type,
    transactionId: row.transaction_id,
    amount: row.amount != null ? round2(row.amount) : null,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    percent: row.percent != null ? Number(row.percent) : null,
    firmId: row.firm_id,
    branchId: row.branch_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name || null,
    requestedAt: row.requested_at,
    currentLevel: Number(row.current_level || 1),
    requiredLevels: Number(row.required_levels || 1),
    level1RoleSlug: row.level1_role_slug,
    level2RoleSlug: row.level2_role_slug,
    status: row.status,
    approvedByL1: row.approved_by_l1,
    approvedAtL1: row.approved_at_l1,
    approvedByL2: row.approved_by_l2,
    approvedAtL2: row.approved_at_l2,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    comments: row.comments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REQ_SELECT = `
  SELECT r.*,
    ar.name as rule_name,
    u.full_name as requested_by_name
  FROM approval_requests r
  LEFT JOIN approval_rules ar ON ar.id = r.rule_id
  LEFT JOIN users u ON u.id = r.requested_by
`;

export class ApprovalRepository {
  listRules({ module, activeOnly = false, includeInactive = true } = {}) {
    const where = [];
    const params = [];
    if (module) { where.push('module = ?'); params.push(module); }
    if (activeOnly || !includeInactive) { where.push('is_active = 1'); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return getDatabase().prepare(`
      SELECT * FROM approval_rules ${wh}
      ORDER BY sort_order ASC, module ASC, threshold_amount ASC
    `).all(...params).map(mapRule);
  }

  findRule(id) {
    return mapRule(getDatabase().prepare('SELECT * FROM approval_rules WHERE id = ?').get(id));
  }

  createRule(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO approval_rules (
        id, name, module, action, transaction_type, condition_type,
        threshold_amount, threshold_quantity, threshold_percent,
        firm_id, branch_id, level1_role_slug, level2_role_slug,
        allow_self_approval, is_active, sort_order, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.module,
      data.action,
      data.transactionType || null,
      data.conditionType || 'amount_gte',
      data.thresholdAmount ?? null,
      data.thresholdQuantity ?? null,
      data.thresholdPercent ?? null,
      data.firmId || null,
      data.branchId || null,
      data.level1RoleSlug,
      data.level2RoleSlug || null,
      data.allowSelfApproval ? 1 : 0,
      data.isActive === false ? 0 : 1,
      data.sortOrder ?? 100,
      data.notes || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findRule(id);
  }

  updateRule(id, data) {
    const existing = this.findRule(id);
    if (!existing) return null;
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE approval_rules SET
        name = COALESCE(?, name),
        module = COALESCE(?, module),
        action = COALESCE(?, action),
        transaction_type = COALESCE(?, transaction_type),
        condition_type = COALESCE(?, condition_type),
        threshold_amount = COALESCE(?, threshold_amount),
        threshold_quantity = COALESCE(?, threshold_quantity),
        threshold_percent = COALESCE(?, threshold_percent),
        firm_id = COALESCE(?, firm_id),
        branch_id = COALESCE(?, branch_id),
        level1_role_slug = COALESCE(?, level1_role_slug),
        level2_role_slug = ?,
        allow_self_approval = COALESCE(?, allow_self_approval),
        is_active = COALESCE(?, is_active),
        sort_order = COALESCE(?, sort_order),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? null,
      data.module ?? null,
      data.action ?? null,
      data.transactionType !== undefined ? data.transactionType : null,
      data.conditionType ?? null,
      data.thresholdAmount !== undefined ? data.thresholdAmount : null,
      data.thresholdQuantity !== undefined ? data.thresholdQuantity : null,
      data.thresholdPercent !== undefined ? data.thresholdPercent : null,
      data.firmId !== undefined ? data.firmId : null,
      data.branchId !== undefined ? data.branchId : null,
      data.level1RoleSlug ?? null,
      data.level2RoleSlug !== undefined ? data.level2RoleSlug : existing.level2RoleSlug,
      data.allowSelfApproval != null ? (data.allowSelfApproval ? 1 : 0) : null,
      data.isActive != null ? (data.isActive ? 1 : 0) : null,
      data.sortOrder ?? null,
      data.notes !== undefined ? data.notes : null,
      now,
      id
    );
    return this.findRule(id);
  }

  deactivateRule(id) {
    return this.updateRule(id, { isActive: false });
  }

  /** Highest-matching active rule for a transaction context (most specific by threshold). */
  matchRules({ module, action, transactionType, amount, quantity, percent, firmId, branchId }) {
    const rules = this.listRules({ module, activeOnly: true });
    const matched = [];
    for (const rule of rules) {
      if (rule.action !== action) continue;
      if (rule.transactionType && transactionType && rule.transactionType !== transactionType) continue;
      if (rule.firmId && firmId && rule.firmId !== firmId) continue;
      if (rule.branchId && branchId && rule.branchId !== branchId) continue;

      let ok = false;
      if (rule.conditionType === 'always') ok = true;
      else if (rule.conditionType === 'amount_gte') {
        ok = Number(amount || 0) >= Number(rule.thresholdAmount || 0);
      } else if (rule.conditionType === 'quantity_gte') {
        ok = Number(quantity || 0) >= Number(rule.thresholdQuantity || 0);
      } else if (rule.conditionType === 'percent_gte') {
        ok = Number(percent || 0) >= Number(rule.thresholdPercent || 0);
      }
      if (ok) matched.push(rule);
    }
    // Prefer highest threshold (stricter) then lowest sort_order
    matched.sort((a, b) => {
      const ta = Number(a.thresholdAmount || a.thresholdQuantity || a.thresholdPercent || 0);
      const tb = Number(b.thresholdAmount || b.thresholdQuantity || b.thresholdPercent || 0);
      if (tb !== ta) return tb - ta;
      return a.sortOrder - b.sortOrder;
    });
    return matched;
  }

  createRequest(data) {
    const id = generateId();
    const now = nowIso();
    const requiredLevels = data.level2RoleSlug ? 2 : 1;
    getDatabase().prepare(`
      INSERT INTO approval_requests (
        id, rule_id, module, action, transaction_type, transaction_id,
        amount, quantity, percent, firm_id, branch_id,
        requested_by, requested_at, current_level, required_levels,
        level1_role_slug, level2_role_slug, status, comments, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      data.ruleId || null,
      data.module,
      data.action,
      data.transactionType || null,
      data.transactionId,
      data.amount ?? null,
      data.quantity ?? null,
      data.percent ?? null,
      data.firmId || null,
      data.branchId || null,
      data.requestedBy || null,
      now,
      requiredLevels,
      data.level1RoleSlug || null,
      data.level2RoleSlug || null,
      data.comments || null,
      now,
      now
    );
    return this.findRequest(id);
  }

  findRequest(id) {
    return mapRequest(getDatabase().prepare(`${REQ_SELECT} WHERE r.id = ?`).get(id));
  }

  findOpenByTransaction(module, transactionId) {
    return mapRequest(getDatabase().prepare(`
      ${REQ_SELECT}
      WHERE r.module = ? AND r.transaction_id = ?
        AND r.status IN ('pending', 'partially_approved')
      ORDER BY r.created_at DESC LIMIT 1
    `).get(module, transactionId));
  }

  listRequests({
    status, module, requestedBy, mineForRoleSlugs, dateFrom, dateTo,
    limit = 100, offset = 0,
  } = {}) {
    const where = [];
    const params = [];
    if (status) {
      if (status === 'open') where.push(`r.status IN ('pending','partially_approved')`);
      else { where.push('r.status = ?'); params.push(status); }
    }
    if (module) { where.push('r.module = ?'); params.push(module); }
    if (requestedBy) { where.push('r.requested_by = ?'); params.push(requestedBy); }
    if (dateFrom) { where.push('r.requested_at >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('r.requested_at <= ?'); params.push(`${dateTo}T23:59:59`); }
    if (mineForRoleSlugs?.length) {
      const placeholders = mineForRoleSlugs.map(() => '?').join(',');
      where.push(`(
        (r.status = 'pending' AND r.current_level = 1 AND r.level1_role_slug IN (${placeholders}))
        OR (r.status = 'partially_approved' AND r.current_level = 2 AND r.level2_role_slug IN (${placeholders}))
      )`);
      params.push(...mineForRoleSlugs, ...mineForRoleSlugs);
    }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = getDatabase().prepare(`
      ${REQ_SELECT} ${wh}
      ORDER BY r.requested_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapRequest);
    const total = getDatabase().prepare(`SELECT COUNT(*) as c FROM approval_requests r ${wh}`).get(...params).c;
    return { items, total, limit, offset };
  }

  summary({ roleSlugs = [] } = {}) {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT COUNT(*) as c FROM approval_requests WHERE status IN ('pending','partially_approved')
    `).get().c;
    const approved = db.prepare(`
      SELECT COUNT(*) as c FROM approval_requests WHERE status = 'approved'
        AND date(updated_at) >= date('now', '-30 days')
    `).get().c;
    const rejected = db.prepare(`
      SELECT COUNT(*) as c FROM approval_requests WHERE status = 'rejected'
        AND date(updated_at) >= date('now', '-30 days')
    `).get().c;
    let assignedToMe = 0;
    if (roleSlugs.length) {
      const placeholders = roleSlugs.map(() => '?').join(',');
      assignedToMe = db.prepare(`
        SELECT COUNT(*) as c FROM approval_requests
        WHERE (status = 'pending' AND current_level = 1 AND level1_role_slug IN (${placeholders}))
           OR (status = 'partially_approved' AND current_level = 2 AND level2_role_slug IN (${placeholders}))
      `).get(...roleSlugs, ...roleSlugs).c;
    }
    return {
      pending: Number(pending),
      approvedRecent: Number(approved),
      rejectedRecent: Number(rejected),
      assignedToMe: Number(assignedToMe),
    };
  }

  updateRequestStatus(id, data) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE approval_requests SET
        status = COALESCE(?, status),
        current_level = COALESCE(?, current_level),
        approved_by_l1 = COALESCE(?, approved_by_l1),
        approved_at_l1 = COALESCE(?, approved_at_l1),
        approved_by_l2 = COALESCE(?, approved_by_l2),
        approved_at_l2 = COALESCE(?, approved_at_l2),
        rejected_by = COALESCE(?, rejected_by),
        rejected_at = COALESCE(?, rejected_at),
        rejection_reason = COALESCE(?, rejection_reason),
        comments = COALESCE(?, comments),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.status ?? null,
      data.currentLevel ?? null,
      data.approvedByL1 ?? null,
      data.approvedAtL1 ?? null,
      data.approvedByL2 ?? null,
      data.approvedAtL2 ?? null,
      data.rejectedBy ?? null,
      data.rejectedAt ?? null,
      data.rejectionReason ?? null,
      data.comments ?? null,
      now,
      id
    );
    return this.findRequest(id);
  }

  seedDefaultsIfEmpty(createdBy) {
    const count = getDatabase().prepare('SELECT COUNT(*) as c FROM approval_rules').get().c;
    if (count > 0) return { seeded: false, count };
    const defaults = [
      {
        name: 'Expense ≥ ₹10,000 — Manager',
        module: 'finance', action: 'expense', transactionType: 'expense',
        conditionType: 'amount_gte', thresholdAmount: 10000,
        level1RoleSlug: 'manager', level2RoleSlug: null, sortOrder: 10,
      },
      {
        name: 'Expense ≥ ₹50,000 — Manager then Owner',
        module: 'finance', action: 'expense', transactionType: 'expense',
        conditionType: 'amount_gte', thresholdAmount: 50000,
        level1RoleSlug: 'manager', level2RoleSlug: 'owner_admin', sortOrder: 5,
      },
      {
        name: 'Income ≥ ₹50,000 — Manager',
        module: 'finance', action: 'income', transactionType: 'income',
        conditionType: 'amount_gte', thresholdAmount: 50000,
        level1RoleSlug: 'manager', sortOrder: 20,
      },
      {
        name: 'Purchase bill ≥ ₹50,000 — Manager',
        module: 'purchases', action: 'purchase_bill', transactionType: 'purchase_bill',
        conditionType: 'amount_gte', thresholdAmount: 50000,
        level1RoleSlug: 'manager', sortOrder: 10,
      },
      {
        name: 'Purchase bill ≥ ₹2,00,000 — Manager then Owner',
        module: 'purchases', action: 'purchase_bill', transactionType: 'purchase_bill',
        conditionType: 'amount_gte', thresholdAmount: 200000,
        level1RoleSlug: 'manager', level2RoleSlug: 'owner_admin', sortOrder: 5,
      },
      {
        name: 'Inventory adjustment ≥ ₹10,000 — Manager',
        module: 'inventory', action: 'adjustment', transactionType: 'adjustment',
        conditionType: 'amount_gte', thresholdAmount: 10000,
        level1RoleSlug: 'manager', sortOrder: 10,
      },
      {
        name: 'POS discount ≥ 15% — Manager',
        module: 'pos', action: 'discount', transactionType: 'discount',
        conditionType: 'percent_gte', thresholdPercent: 15,
        level1RoleSlug: 'manager', sortOrder: 10,
      },
    ];
    for (const d of defaults) {
      this.createRule({ ...d, createdBy, allowSelfApproval: false, isActive: true });
    }
    return { seeded: true, count: defaults.length };
  }
}
