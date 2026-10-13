import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../core/http.js';
import { addHours } from '../core/utils.js';
import { config } from '../config/index.js';
import { repos } from '../repositories/index.js';
import { getCoreDatabase } from '../database/connection.js';
import { currentFirmId, runWithFirm } from '../database/context.js';
import { firmService } from './firms.js';
import { ensureFirmRoles, FIRM_ADMIN, GROUP_OWNER } from '../database/firm-identity.js';

const userRepo = repos.users;
const sessionRepo = repos.sessions;
const companyRepo = repos.company;
const roleRepo = repos.roles;
const auditRepo = repos.auditLogs;

/** The group owner: above every firm. */
export const isGroupOwner = (user) => user?.roleSlug === GROUP_OWNER;
/** Full admin of the firm that is open: its Firm Admin, or the group owner. */
export const isFirmAdmin = (user) => user?.roleSlug === FIRM_ADMIN || isGroupOwner(user);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

function getRequestMeta(req) {
  return {
    ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

export class AuthService {
  async login(email, password, req, { firmId, financialYear } = {}) {
    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const userRow = userRepo.findByEmailWithPassword(email);
    if (!userRow || !userRow.is_active) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const valid = bcrypt.compareSync(password, userRow.password_hash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    sessionRepo.purgeExpired();
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = addHours(new Date(), config.sessionTtlHours).toISOString();

    sessionRepo.create({
      userId: userRow.id,
      token,
      expiresAt,
      ...getRequestMeta(req),
    });

    userRepo.updateLastLogin(userRow.id);

    auditRepo.create({
      userId: userRow.id,
      userName: userRow.full_name,
      action: 'login',
      module: 'core',
      recordType: 'session',
      recordId: userRow.id,
      newValue: { email: userRow.email },
      ...getRequestMeta(req),
    });

    const permissions = roleRepo.getPermissions(userRow.role_id).map((p) => p.permission_key);
    const sessionUser = { id: userRow.id, roleSlug: userRow.role_slug, firmId: userRow.firm_id || null };
    const firms = firmService.choices(sessionUser);
    if (!firms.length) {
      sessionRepo.deleteByToken(token);
      throw new AppError('No firm is assigned to this user. Ask the owner to give you access.', 403, 'NO_FIRM');
    }
    // Firm and financial year: as asked, or the only firm in its current year (ERP still shows the picker).
    let selection = null;
    if (firmId) selection = firmService.select(token, sessionUser, { firmId, financialYear });
    else if (firms.length === 1) selection = firmService.select(token, sessionUser, { firmId: firms[0].id });
    const company = selection ? runWithFirm({ firmId: selection.firm.id }, () => companyRepo.get()) : null;

    return {
      token,
      expiresAt,
      firms,
      firm: selection?.firm || null,
      financialYear: selection?.financialYear || null,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        phone: userRow.phone,
        roleId: userRow.role_id,
        roleName: userRow.role_name,
        roleSlug: userRow.role_slug,
        firmId: userRow.firm_id || null,
        isGroupOwner: isGroupOwner({ roleSlug: userRow.role_slug }),
        isActive: Boolean(userRow.is_active),
      },
      permissions,
      company,
    };
  }

  /** Any signed-in user changes their own password (the group owner is not in any Users list). */
  changePassword(actor, { currentPassword, newPassword } = {}, req) {
    const row = userRepo.findByEmailWithPassword(actor.user.email);
    if (!row || !bcrypt.compareSync(String(currentPassword || ''), row.password_hash)) {
      throw new AppError('Current password is wrong', 400, 'BAD_PASSWORD');
    }
    if (String(newPassword || '').length < 8) throw new AppError('New password must be at least 8 characters', 400);
    if (newPassword === currentPassword) throw new AppError('Choose a password different from the current one', 400);
    userRepo.update(row.id, { passwordHash: bcrypt.hashSync(newPassword, 10) });
    auditRepo.create({
      userId: row.id, userName: row.full_name, action: 'change_password', module: 'core',
      recordType: 'user', recordId: row.id, ...getRequestMeta(req),
    });
    return { success: true };
  }

  logout(token, req) {
    const session = sessionRepo.findByToken(token);
    if (session) {
      auditRepo.create({
        userId: session.user_id,
        userName: session.full_name,
        action: 'logout',
        module: 'core',
        recordType: 'session',
        recordId: session.user_id,
        ...getRequestMeta(req),
      });
    }
    sessionRepo.deleteByToken(token);
    return { success: true };
  }

  getSession(token) {
    sessionRepo.purgeExpired();
    const session = sessionRepo.findByToken(token);
    if (!session) return null;
    if (!session.is_active) return null;

    const permissions = roleRepo.getPermissions(session.role_id).map((p) => p.permission_key);
    const selection = firmService.sessionSelection(session);
    const company = selection ? runWithFirm({ firmId: selection.firm.id }, () => companyRepo.get()) : null;

    return {
      firm: selection ? { id: selection.firm.id, name: company?.businessName || selection.firm.name, isPrimary: selection.firm.isPrimary } : null,
      financialYear: selection?.financialYear || null,
      user: {
        id: session.user_id,
        email: session.email,
        fullName: session.full_name,
        roleId: session.role_id,
        roleName: session.role_name,
        roleSlug: session.role_slug,
        firmId: session.user_firm_id || null,
        isGroupOwner: isGroupOwner({ roleSlug: session.role_slug }),
        isActive: Boolean(session.is_active),
      },
      permissions,
      company,
      expiresAt: session.expires_at,
    };
  }

  checkPermission(userPermissions, permissionKey) {
    if (userPermissions.includes('*')) return;
    if (!userPermissions.includes(permissionKey)) {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
  }

  /** Pass if the actor has any of the listed permissions. */
  checkAnyPermission(userPermissions, permissionKeys = []) {
    if (userPermissions.includes('*')) return;
    const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
    if (keys.some((key) => userPermissions.includes(key))) return;
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
}

export class CompanyService {
  get() {
    return companyRepo.get();
  }

  update(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.company.edit');

    const previous = companyRepo.get();
    const updated = companyRepo.upsert(
      {
        ...data,
        isSetupComplete: Boolean(data.businessName),
      },
      actor.user.id
    );
    firmService.syncName(currentFirmId(), updated?.businessName);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: previous?.isSetupComplete ? 'update' : 'create',
      module: 'core',
      recordType: 'company',
      recordId: updated.id,
      previousValue: previous,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return updated;
  }
}

export class UserService {
  /** The firm whose users are being managed: the one open in this session. */
  #firm() {
    const firmId = currentFirmId();
    if (!firmId) throw new AppError('Choose a firm first', 409, 'FIRM_NOT_SELECTED');
    return firmId;
  }

  /** A user of the open firm; other firms' users and the group owner are not visible here. */
  #inFirm(id) {
    const user = userRepo.findById(id);
    if (!user || user.firmId !== this.#firm()) throw new AppError('User not found', 404);
    return user;
  }

  /** A role of the open firm that this actor may give out. */
  #assignableRole(roleId, actor) {
    const role = roleId ? roleRepo.findById(roleId) : null;
    if (!role || !role.isActive || role.firmId !== this.#firm()) throw new AppError('Invalid role', 400);
    if (role.slug === FIRM_ADMIN && !isFirmAdmin(actor.user)) {
      throw new AppError('Only the group owner or a firm admin can make someone a Firm Admin', 403, 'ADMIN_ONLY');
    }
    return role;
  }

  list(actor) {
    authService.checkPermission(actor.permissions, 'core.users.view');
    return userRepo.findAll({ includeInactive: true, firmId: this.#firm() });
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'core.users.view');
    return this.#inFirm(id);
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.create');
    const firmId = this.#firm();
    const role = this.#assignableRole(data.roleId, actor);
    return this.#createUser(data, role, firmId, actor, req);
  }

  /** Group owner: the first admin of a firm (Company & Firms), without opening that firm. */
  createFirmAdmin(firmId, data, actor, req) {
    if (!isGroupOwner(actor.user)) throw new AppError('Only the group owner creates firm admins', 403, 'OWNER_ONLY');
    const firm = firmService.detail(firmId);
    ensureFirmRoles(getCoreDatabase(), firm.id, actor.user.id);
    const role = roleRepo.findBySlug(FIRM_ADMIN, firm.id);
    if (!role?.isActive) throw new AppError('This firm has no active Firm Admin role', 400);
    return this.#createUser(data, role, firm.id, actor, req);
  }

  #createUser(data, role, firmId, actor, req) {
    const email = String(data.email || '').trim().toLowerCase();
    const fullName = String(data.fullName || '').trim();
    const { password, phone } = data;
    if (!email || !password || !fullName) {
      throw new AppError('Email, password, full name, and role are required', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email (it is the login ID)', 400);
    if (String(password).length < 8) throw new AppError('Password must be at least 8 characters', 400);
    if (userRepo.emailExists(email)) {
      throw new AppError('Email already exists', 409);
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = userRepo.create({
      email,
      passwordHash,
      fullName,
      phone,
      roleId: role.id,
      firmId,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'core',
      recordType: 'user',
      recordId: user.id,
      newValue: { ...user, password: '[REDACTED]' },
      ...getRequestMeta(req),
    });

    return user;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.edit');

    const existing = this.#inFirm(id);
    if (existing.roleSlug === FIRM_ADMIN && !isFirmAdmin(actor.user)) {
      throw new AppError('Only the group owner or a firm admin can change a Firm Admin', 403, 'ADMIN_ONLY');
    }

    const email = data.email !== undefined ? String(data.email).trim().toLowerCase() : undefined;
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Enter a valid email (it is the login ID)', 400);
    }
    if (email && userRepo.emailExists(email, id)) {
      throw new AppError('Email already exists', 409);
    }
    if (data.isActive === false && id === actor.user.id) {
      throw new AppError('You cannot deactivate your own account', 400);
    }
    if (data.password && String(data.password).length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    if (data.roleId && data.roleId !== existing.roleId) this.#assignableRole(data.roleId, actor);

    let passwordHash = null;
    if (data.password) {
      passwordHash = bcrypt.hashSync(data.password, 10);
    }

    const updated = userRepo.update(id, {
      email,
      fullName: data.fullName,
      phone: data.phone,
      roleId: data.roleId,
      isActive: data.isActive,
      passwordHash,
    });

    if (data.isActive === false) {
      sessionRepo.deleteByUserId(id);
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'user',
      recordId: id,
      previousValue: existing,
      newValue: { ...updated, password: data.password ? '[REDACTED]' : undefined },
      ...getRequestMeta(req),
    });

    return updated;
  }

  deactivate(id, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.edit');

    if (id === actor.user.id) {
      throw new AppError('You cannot deactivate your own account', 400);
    }
    return this.update(id, { isActive: false }, actor, req);
  }

  activate(id, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.edit');
    return this.update(id, { isActive: true }, actor, req);
  }
}

export class RoleService {
  #firm() {
    const firmId = currentFirmId();
    if (!firmId) throw new AppError('Choose a firm first', 409, 'FIRM_NOT_SELECTED');
    return firmId;
  }

  /** A role of the open firm (each firm has its own roles). */
  #inFirm(id) {
    const role = roleRepo.findById(id);
    if (!role || role.firmId !== this.#firm()) throw new AppError('Role not found', 404);
    return role;
  }

  list(actor) {
    authService.checkPermission(actor.permissions, 'core.roles.view');
    const roles = roleRepo.findAll({ includeInactive: true, firmId: this.#firm() });
    return roles.map((role) => ({
      ...role,
      permissionCount: roleRepo.getPermissions(role.id).length,
    }));
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'core.roles.view');
    const role = this.#inFirm(id);

    return {
      ...role,
      permissions: roleRepo.getPermissions(id),
    };
  }

  getPermissionTree(actor) {
    authService.checkPermission(actor.permissions, 'core.roles.view');
    return roleRepo.getPermissionTree();
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.roles.create');

    const { name, description, permissionIds = [] } = data;
    if (!name) throw new AppError('Role name is required', 400);

    const firmId = this.#firm();
    const slug = data.slug || slugify(name);
    if (slug === GROUP_OWNER) throw new AppError('That role name is reserved for the group owner', 400);
    if (roleRepo.slugExists(slug, null, firmId)) {
      throw new AppError('A role with this name already exists in this firm', 409);
    }

    const role = roleRepo.create({
      name,
      slug,
      description,
      isSystem: false,
      firmId,
      createdBy: actor.user.id,
    });

    roleRepo.setPermissions(role.id, permissionIds);

    const result = this.getById(role.id, actor);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'core',
      recordType: 'role',
      recordId: role.id,
      newValue: result,
      ...getRequestMeta(req),
    });

    return result;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.roles.edit');

    const existing = this.#inFirm(id);
    if (existing.slug === FIRM_ADMIN && !isFirmAdmin(actor.user)) {
      throw new AppError('Only the group owner or a firm admin can change the Firm Admin role', 403, 'ADMIN_ONLY');
    }

    // No lockout: the role you are signed in with, and Firm Admin, stay active and keep the
    // permissions needed to manage users and roles (so any mistake can be fixed).
    const guarded = existing.slug === FIRM_ADMIN || existing.id === actor.user.roleId;
    if (guarded && data.isActive === false) {
      throw new AppError(existing.slug === FIRM_ADMIN
        ? 'The Firm Admin role cannot be deactivated'
        : 'You cannot deactivate the role you are signed in with', 400);
    }
    if (guarded && Array.isArray(data.permissionIds)) {
      const keep = ['core.roles.view', 'core.roles.edit', 'core.users.view', 'core.users.edit'];
      const keys = new Set(roleRepo.permissionKeysForIds(data.permissionIds));
      const missing = keep.filter((k) => !keys.has(k));
      if (missing.length) {
        throw new AppError(`${existing.name} must keep ${missing.join(', ')} so users and roles can still be managed`, 400);
      }
    }

    const updated = roleRepo.update(id, {
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    });

    if (Array.isArray(data.permissionIds)) {
      roleRepo.setPermissions(id, data.permissionIds);
    }

    const result = this.getById(id, actor);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'role',
      recordId: id,
      previousValue: existing,
      newValue: result,
      ...getRequestMeta(req),
    });

    return result;
  }

  delete(id, actor, req) {
    authService.checkPermission(actor.permissions, 'core.roles.delete');

    const existing = this.#inFirm(id);

    try {
      roleRepo.delete(id);
    } catch (err) {
      throw new AppError(err.message, 400);
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'delete',
      module: 'core',
      recordType: 'role',
      recordId: id,
      previousValue: existing,
      ...getRequestMeta(req),
    });

    return { success: true };
  }
}

export class AuditService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'core.audit_log.view');
    return auditRepo.findAll(filters);
  }
}

export const authService = new AuthService();
export const companyService = new CompanyService();
export const userService = new UserService();
export const roleService = new RoleService();
export const auditService = new AuditService();
