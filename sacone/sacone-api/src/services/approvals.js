import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const approvalRepo = repos.approvals;
const auditRepo = repos.auditLogs;
const roleRepo = repos.roles;

function meta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function requirePerm(actor, key) {
  authService.checkPermission(actor.permissions, key);
}

function actorRoleSlugs(actor) {
  const slugs = new Set();
  if (actor?.user?.roleSlug) slugs.add(actor.user.roleSlug);
  if (actor?.role?.slug) slugs.add(actor.role.slug);
  if (slugs.has('owner_admin') || actor?.permissions?.includes('*')) {
    slugs.add('owner_admin');
    slugs.add('manager');
    slugs.add('accountant');
  }
  return [...slugs];
}

export class ApprovalService {
  listModules() {
    return [
      { code: 'finance', actions: ['income', 'expense', 'void'] },
      { code: 'purchases', actions: ['purchase_order', 'purchase_bill', 'purchase_return'] },
      { code: 'inventory', actions: ['adjustment', 'transfer'] },
      { code: 'pos', actions: ['discount', 'cancel_sale', 'return'] },
      { code: 'warehouse', actions: ['transfer', 'stock_count'] },
    ];
  }

  listRoleOptions(actor) {
    requirePerm(actor, 'core.approvals.view');
    return roleRepo.findAll({ includeInactive: false }).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
    }));
  }

  listRules(query, actor) {
    requirePerm(actor, 'core.approvals.view');
    return approvalRepo.listRules({
      module: query.module,
      includeInactive: query.includeInactive !== 'false',
    });
  }

  getRule(id, actor) {
    requirePerm(actor, 'core.approvals.view');
    const rule = approvalRepo.findRule(id);
    if (!rule) throw new AppError('Approval rule not found', 404);
    return rule;
  }

  createRule(data, actor, req) {
    requirePerm(actor, 'core.approvals.create');
    if (!data.name || !data.module || !data.action || !data.level1RoleSlug) {
      throw new AppError('name, module, action, and level1RoleSlug are required', 400);
    }
    const rule = approvalRepo.createRule({ ...data, createdBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'core',
      recordType: 'approval_rule',
      recordId: rule.id,
      newValue: rule,
      ...meta(req),
    });
    return rule;
  }

  updateRule(id, data, actor, req) {
    requirePerm(actor, 'core.approvals.edit');
    const existing = approvalRepo.findRule(id);
    if (!existing) throw new AppError('Approval rule not found', 404);
    const updated = approvalRepo.updateRule(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'approval_rule',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...meta(req),
    });
    return updated;
  }

  deactivateRule(id, actor, req) {
    requirePerm(actor, 'core.approvals.edit');
    const existing = approvalRepo.findRule(id);
    if (!existing) throw new AppError('Approval rule not found', 404);
    const updated = approvalRepo.deactivateRule(id);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'deactivate',
      module: 'core',
      recordType: 'approval_rule',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...meta(req),
    });
    return updated;
  }

  duplicateRule(id, actor, req) {
    requirePerm(actor, 'core.approvals.create');
    const existing = approvalRepo.findRule(id);
    if (!existing) throw new AppError('Approval rule not found', 404);
    const copy = approvalRepo.createRule({
      ...existing,
      name: `${existing.name} (copy)`,
      isActive: false,
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'duplicate',
      module: 'core',
      recordType: 'approval_rule',
      recordId: copy.id,
      newValue: { from: id, ...copy },
      ...meta(req),
    });
    return copy;
  }

  evaluateAndCreate({
    module, action, transactionType, transactionId, amount, quantity, percent,
    firmId, branchId, comments, create = true,
  }, actor, req) {
    const matched = approvalRepo.matchRules({
      module, action, transactionType, amount, quantity, percent, firmId, branchId,
    });
    if (!matched.length) {
      return { required: false, rule: null, request: null };
    }
    const rule = matched[0];
    const existing = approvalRepo.findOpenByTransaction(module, transactionId);
    if (existing) return { required: true, rule, request: existing };
    if (!create) return { required: true, rule, request: null };

    const request = approvalRepo.createRequest({
      ruleId: rule.id,
      module,
      action,
      transactionType,
      transactionId,
      amount,
      quantity,
      percent,
      firmId,
      branchId,
      requestedBy: actor.user.id,
      level1RoleSlug: rule.level1RoleSlug,
      level2RoleSlug: rule.level2RoleSlug,
      comments,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'request',
      module: 'core',
      recordType: 'approval_request',
      recordId: request.id,
      newValue: { module, transactionId, amount, ruleId: rule.id },
      ...meta(req),
    });
    return { required: true, rule, request };
  }

  dashboard(_query, actor) {
    requirePerm(actor, 'core.approvals.view');
    return {
      summary: approvalRepo.summary({ roleSlugs: actorRoleSlugs(actor) }),
      modules: this.listModules(),
    };
  }

  listRequests(query, actor) {
    requirePerm(actor, 'core.approvals.view');
    const scope = query.scope || 'all';
    const opts = {
      status: query.status,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    };
    if (scope === 'mine') opts.requestedBy = actor.user.id;
    if (scope === 'assigned') opts.mineForRoleSlugs = actorRoleSlugs(actor);
    if (scope === 'open') opts.status = 'open';
    return approvalRepo.listRequests(opts);
  }

  getRequest(id, actor) {
    requirePerm(actor, 'core.approvals.view');
    const row = approvalRepo.findRequest(id);
    if (!row) throw new AppError('Approval request not found', 404);
    return row;
  }

  canApproveRequest(request, actor) {
    const slugs = actorRoleSlugs(actor);
    if (request.status === 'pending' && request.currentLevel === 1) {
      return slugs.includes(request.level1RoleSlug) || slugs.includes('owner_admin');
    }
    if (request.status === 'partially_approved' && request.currentLevel === 2) {
      return slugs.includes(request.level2RoleSlug) || slugs.includes('owner_admin');
    }
    return false;
  }

  async approve(id, data, actor, req) {
    requirePerm(actor, 'core.approvals.approve');
    const request = approvalRepo.findRequest(id);
    if (!request) throw new AppError('Approval request not found', 404);
    if (!['pending', 'partially_approved'].includes(request.status)) {
      throw new AppError(`Cannot approve request in status "${request.status}"`, 400);
    }
    if (!this.canApproveRequest(request, actor)) {
      throw new AppError('You are not an authorized approver for this level', 403);
    }

    const rule = request.ruleId ? approvalRepo.findRule(request.ruleId) : null;
    const allowSelf = rule?.allowSelfApproval === true;
    if (!allowSelf && request.requestedBy && request.requestedBy === actor.user.id) {
      const isOwner = actorRoleSlugs(actor).includes('owner_admin');
      if (!isOwner || request.level1RoleSlug !== 'owner_admin') {
        throw new AppError('Self-approval is not allowed for this rule', 400);
      }
    }

    const now = new Date().toISOString();
    let updated;
    if (request.currentLevel === 1 && request.requiredLevels > 1) {
      updated = approvalRepo.updateRequestStatus(id, {
        status: 'partially_approved',
        currentLevel: 2,
        approvedByL1: actor.user.id,
        approvedAtL1: now,
        comments: data?.comments || request.comments,
      });
    } else if (request.currentLevel === 1) {
      updated = approvalRepo.updateRequestStatus(id, {
        status: 'approved',
        approvedByL1: actor.user.id,
        approvedAtL1: now,
        comments: data?.comments || request.comments,
      });
    } else {
      updated = approvalRepo.updateRequestStatus(id, {
        status: 'approved',
        approvedByL2: actor.user.id,
        approvedAtL2: now,
        comments: data?.comments || request.comments,
      });
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'core',
      recordType: 'approval_request',
      recordId: id,
      previousValue: { status: request.status, level: request.currentLevel },
      newValue: { status: updated.status, level: updated.currentLevel },
      ...meta(req),
    });

    if (updated.status === 'approved') {
      await this.finalizeDomain(updated, actor, req);
    }
    return updated;
  }

  async reject(id, data, actor, req) {
    requirePerm(actor, 'core.approvals.approve');
    const request = approvalRepo.findRequest(id);
    if (!request) throw new AppError('Approval request not found', 404);
    if (!['pending', 'partially_approved'].includes(request.status)) {
      throw new AppError(`Cannot reject request in status "${request.status}"`, 400);
    }
    if (!this.canApproveRequest(request, actor)) {
      throw new AppError('You are not an authorized approver for this level', 403);
    }
    if (!data?.reason) throw new AppError('Rejection reason is required', 400);

    const updated = approvalRepo.updateRequestStatus(id, {
      status: 'rejected',
      rejectedBy: actor.user.id,
      rejectedAt: new Date().toISOString(),
      rejectionReason: data.reason,
      comments: data.comments || request.comments,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'reject',
      module: 'core',
      recordType: 'approval_request',
      recordId: id,
      previousValue: { status: request.status },
      newValue: { status: 'rejected', reason: data.reason },
      ...meta(req),
    });

    await this.rejectDomain(updated, actor, req);
    return updated;
  }

  async finalizeDomain(request, actor, req) {
    try {
      if (request.module === 'finance') {
        const { financeService } = await import('./finance.js');
        const txn = repos.financeTransactions.findById(request.transactionId);
        if (txn && ['pending_approval', 'submitted'].includes(txn.status)) {
          financeService.approveTransaction(request.transactionId, actor, req);
        }
      }
    } catch (err) {
      console.error('Approval finalizeDomain:', err.message);
    }
  }

  async rejectDomain(request, actor, req) {
    try {
      if (request.module === 'finance') {
        const { financeService } = await import('./finance.js');
        const txn = repos.financeTransactions.findById(request.transactionId);
        if (txn && ['pending_approval', 'submitted'].includes(txn.status)) {
          financeService.rejectTransaction(
            request.transactionId,
            { reason: request.rejectionReason },
            actor,
            req
          );
        }
      }
    } catch (err) {
      console.error('Approval rejectDomain:', err.message);
    }
  }
}

export const approvalService = new ApprovalService();
