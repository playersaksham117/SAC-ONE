import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../core/http.js';
import { addHours } from '../core/utils.js';
import { config } from '../config/index.js';
import { repos } from '../repositories/index.js';
import { getDatabase } from '../database/connection.js';

const userRepo = repos.users;
const sessionRepo = repos.sessions;
const companyRepo = repos.company;
const roleRepo = repos.roles;
const auditRepo = repos.auditLogs;

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
  async login(email, password, req) {
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
    const company = companyRepo.get();

    return {
      token,
      expiresAt,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        phone: userRow.phone,
        roleId: userRow.role_id,
        roleName: userRow.role_name,
        roleSlug: userRow.role_slug,
        isActive: Boolean(userRow.is_active),
      },
      permissions,
      company,
    };
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
    const company = companyRepo.get();

    return {
      user: {
        id: session.user_id,
        email: session.email,
        fullName: session.full_name,
        roleId: session.role_id,
        roleName: session.role_name,
        roleSlug: session.role_slug,
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
  list(actor) {
    authService.checkPermission(actor.permissions, 'core.users.view');
    return userRepo.findAll({ includeInactive: true });
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'core.users.view');
    const user = userRepo.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.create');

    const { email, password, fullName, phone, roleId } = data;
    if (!email || !password || !fullName || !roleId) {
      throw new AppError('Email, password, full name, and role are required', 400);
    }

    if (userRepo.emailExists(email)) {
      throw new AppError('Email already exists', 409);
    }

    const role = roleRepo.findById(roleId);
    if (!role || !role.isActive) {
      throw new AppError('Invalid role', 400);
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = userRepo.create({
      email,
      passwordHash,
      fullName,
      phone,
      roleId,
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

    const existing = userRepo.findById(id);
    if (!existing) throw new AppError('User not found', 404);

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

    if (data.roleId) {
      const role = roleRepo.findById(data.roleId);
      if (!role || !role.isActive) {
        throw new AppError('Invalid role', 400);
      }
    }

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

    const target = userRepo.findById(id);
    if (target?.roleSlug === 'owner_admin') {
      const activeOwners = getDatabase().prepare(`
        SELECT COUNT(*) as c FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.slug = 'owner_admin' AND u.is_active = 1
      `).get().c;
      if (activeOwners <= 1) {
        throw new AppError('Cannot deactivate the last Owner/Admin account', 400);
      }
    }

    return this.update(id, { isActive: false }, actor, req);
  }

  activate(id, actor, req) {
    authService.checkPermission(actor.permissions, 'core.users.edit');
    return this.update(id, { isActive: true }, actor, req);
  }
}

export class RoleService {
  list(actor) {
    authService.checkPermission(actor.permissions, 'core.roles.view');
    const roles = roleRepo.findAll({ includeInactive: true });
    return roles.map((role) => ({
      ...role,
      permissionCount: roleRepo.getPermissions(role.id).length,
    }));
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'core.roles.view');
    const role = roleRepo.findById(id);
    if (!role) throw new AppError('Role not found', 404);

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

    const slug = data.slug || slugify(name);
    if (roleRepo.slugExists(slug)) {
      throw new AppError('Role slug already exists', 409);
    }

    const role = roleRepo.create({
      name,
      slug,
      description,
      isSystem: false,
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

    const existing = roleRepo.findById(id);
    if (!existing) throw new AppError('Role not found', 404);

    // No lockout: the role you are signed in with, and Owner/Admin, stay active and keep the
    // permissions needed to manage users and roles (so any mistake can be fixed).
    const guarded = existing.slug === 'owner_admin' || existing.id === actor.user.roleId;
    if (guarded && data.isActive === false) {
      throw new AppError(existing.slug === 'owner_admin'
        ? 'The Owner/Admin role cannot be deactivated'
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

    const existing = roleRepo.findById(id);
    if (!existing) throw new AppError('Role not found', 404);

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
