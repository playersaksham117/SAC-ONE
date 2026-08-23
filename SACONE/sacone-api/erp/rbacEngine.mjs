import { randomUUID } from 'crypto'
import { getDb } from './db.mjs'

const TABLE_PERMISSION_MAP = {
  inventory_items: { create: 'products.create', update: 'products.edit', delete: 'products.delete', select: 'products.view' },
  stock_adjustments: { create: 'inventory.adjustment', update: 'inventory.adjustment', delete: 'inventory.adjustment', select: 'inventory.view' },
  warehouses: { create: 'warehouse.create', update: 'warehouse.edit', delete: 'warehouse.delete', select: 'warehouse.view' },
  storage_locations: { create: 'warehouse.create_cells', update: 'warehouse.edit', delete: 'warehouse.delete', select: 'warehouse.view' },
  suppliers: { create: 'suppliers.create', update: 'suppliers.edit', delete: 'suppliers.delete', select: 'suppliers.view' },
  customers: { create: 'customers.create', update: 'customers.edit', delete: 'customers.delete', select: 'customers.view' },
  purchase_orders: { create: 'purchases.create', update: 'purchases.edit', delete: 'purchases.cancel', select: 'purchases.view' },
  transactions: { create: 'inventory.adjustment', update: 'inventory.adjustment', delete: 'inventory.adjustment', select: 'inventory.view' },
  roles: { create: 'settings.role_management', update: 'settings.role_management', delete: 'settings.role_management', select: 'settings.role_management' },
  role_permissions: { create: 'settings.role_management', update: 'settings.role_management', delete: 'settings.role_management', select: 'settings.role_management' },
  users: { create: 'settings.user_management', update: 'settings.user_management', delete: 'settings.user_management', select: 'settings.user_management' },
  user_roles: { create: 'settings.user_management', update: 'settings.user_management', delete: 'settings.user_management', select: 'settings.user_management' },
  app_settings: { create: 'settings.company_settings', update: 'settings.company_settings', delete: 'settings.company_settings', select: 'settings.company_settings' },
}

const OP_MAP = { insert: 'create', update: 'update', delete: 'delete', upsert: 'update', select: 'select' }

export function getUserRoleCode(userId) {
  if (!userId) return null
  const db = getDb()
  const ur = db.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').get(userId)
  if (ur?.role_id) {
    const role = db.prepare('SELECT code FROM roles WHERE id = ?').get(ur.role_id)
    if (role) return role.code
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId)
  return user?.role ?? null
}

export function isAdminUser(userId) {
  return getUserRoleCode(userId) === 'admin'
}

export function getUserPermissions(userId) {
  if (!userId) return []
  if (isAdminUser(userId)) {
    const db = getDb()
    return db.prepare('SELECT code FROM permissions').all().map((r) => r.code)
  }
  const db = getDb()
  const ur = db.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').get(userId)
  let roleId = ur?.role_id
  if (!roleId) {
    const code = getUserRoleCode(userId)
    const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(code)
    roleId = role?.id
  }
  if (!roleId) return []
  return db
    .prepare(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ? AND rp.granted = true`
    )
    .all(roleId)
    .map((r) => r.code)
}

export function hasPermission(userId, permissionCode) {
  if (!permissionCode) return true
  if (isAdminUser(userId)) return true
  return getUserPermissions(userId).includes(permissionCode)
}

export function checkQueryPermission(userId, payload) {
  if (!userId) return { allowed: true }
  if (isAdminUser(userId)) return { allowed: true }

  const table = payload.table
  const op = OP_MAP[payload.op] || 'select'
  const map = TABLE_PERMISSION_MAP[table]
  if (!map) return { allowed: true }

  const perm = map[op]
  if (!perm) return { allowed: true }

  if (hasPermission(userId, perm)) return { allowed: true }
  return { allowed: false, error: `Permission denied: ${perm}` }
}

export function writeAuditLog({
  userId,
  action,
  module,
  entityType,
  entityId,
  oldValue,
  newValue,
  reason,
  approvalId,
  status,
  ipAddress,
  device,
}) {
  const db = getDb()
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, role_code, action, module, entity_type, entity_id, old_value, new_value, reason, approval_id, status, ip_address, device, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    userId ?? null,
    getUserRoleCode(userId),
    action,
    module ?? null,
    entityType ?? null,
    entityId ?? null,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    reason ?? null,
    approvalId ?? null,
    status ?? null,
    ipAddress ?? null,
    device ?? null,
    new Date().toISOString()
  )
}

function nextRequestNo() {
  const db = getDb()
  const count = db.prepare('SELECT COUNT(*) as c FROM approval_requests').get().c
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `APR-${date}-${String(count + 1).padStart(4, '0')}`
}

export function createApprovalRequest({
  type,
  requestedBy,
  operation,
  reason,
  warehouseId,
  referenceNo,
  notes,
  payload,
}) {
  const db = getDb()
  const id = randomUUID()
  const requestNo = nextRequestNo()
  const requesterRole = getUserRoleCode(requestedBy)

  db.prepare(
    `INSERT INTO approval_requests (id, request_no, type, status, requested_by, requester_role, operation, reason, warehouse_id, reference_no, notes, payload, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    requestNo,
    type,
    requestedBy,
    requesterRole,
    operation,
    reason ?? null,
    warehouseId ?? null,
    referenceNo ?? null,
    notes ?? null,
    payload ? JSON.stringify(payload) : null,
    new Date().toISOString(),
    new Date().toISOString()
  )

  db.prepare(
    `INSERT INTO approval_history (id, approval_id, action, actor_id, notes, created_at) VALUES (?, ?, 'submitted', ?, ?, ?)`
  ).run(randomUUID(), id, requestedBy, reason ?? 'Submitted for approval', new Date().toISOString())

  writeAuditLog({
    userId: requestedBy,
    action: 'approval_submitted',
    module: 'approvals',
    entityType: 'approval_requests',
    entityId: id,
    newValue: { type, requestNo },
    reason,
    status: 'pending',
  })

  return { id, request_no: requestNo }
}

export function processApproval({ approvalId, actorId, action, notes }) {
  if (!isAdminUser(actorId)) {
    throw new Error('Only Administrator can approve or reject requests')
  }

  const db = getDb()
  const req = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approvalId)
  if (!req) throw new Error('Approval request not found')
  if (req.status !== 'pending' && req.status !== 'info_requested') {
    throw new Error('Request is no longer pending')
  }

  const statusMap = { approve: 'approved', reject: 'rejected', info: 'info_requested' }
  const status = statusMap[action]
  if (!status) throw new Error('Invalid action')

  db.prepare(
    `UPDATE approval_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?, updated_at = ? WHERE id = ?`
  ).run(status, actorId, new Date().toISOString(), notes ?? null, new Date().toISOString(), approvalId)

  db.prepare(
    `INSERT INTO approval_history (id, approval_id, action, actor_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), approvalId, action, actorId, notes ?? null, new Date().toISOString())

  writeAuditLog({
    userId: actorId,
    action: `approval_${action}`,
    module: 'approvals',
    entityType: 'approval_requests',
    entityId: approvalId,
    newValue: { status },
    reason: notes,
    approvalId,
    status,
  })

  if (action === 'approve' && req.payload) {
    executeApprovedPayload(JSON.parse(req.payload), actorId)
  }

  return { status }
}

function executeApprovedPayload(payload, actorId) {
  const db = getDb()
  if (payload.table && payload.op === 'delete' && payload.id) {
    db.prepare(`DELETE FROM ${payload.table} WHERE id = ?`).run(payload.id)
    writeAuditLog({
      userId: actorId,
      action: 'approved_delete',
      module: payload.table,
      entityType: payload.table,
      entityId: payload.id,
      approvalId: payload.approvalId,
      status: 'approved',
    })
  }
  if (payload.table && payload.op === 'update' && payload.id && payload.body) {
    const keys = Object.keys(payload.body)
    const setSql = keys.map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE ${payload.table} SET ${setSql} WHERE id = ?`).run(...keys.map((k) => payload.body[k]), payload.id)
  }
}

export function listRoles() {
  const db = getDb()
  return db.prepare('SELECT * FROM roles ORDER BY name').all()
}

export function getRolePermissions(roleId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT p.*, COALESCE(rp.granted, 0) as granted FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?
       ORDER BY p.module, p.action`
    )
    .all(roleId)
}

export function updateRolePermissions(roleId, permissionCodes, actorId) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can change permissions')

  const db = getDb()
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('Role not found')
  if (role.code === 'admin') throw new Error('Administrator permissions cannot be modified')

  const allPerms = db.prepare('SELECT id, code FROM permissions').all()
  const codeSet = new Set(permissionCodes)

  const tx = db.transaction(() => {
    for (const perm of allPerms) {
      db.prepare(
        `INSERT INTO role_permissions (role_id, permission_id, granted) VALUES (?, ?, ?)
         ON CONFLICT(role_id, permission_id) DO UPDATE SET granted = excluded.granted`
      ).run(roleId, perm.id, codeSet.has(perm.code) ? 1 : 0)
    }
  })
  tx()

  writeAuditLog({
    userId: actorId,
    action: 'role_permissions_updated',
    module: 'settings',
    entityType: 'roles',
    entityId: roleId,
    newValue: { permissionCodes },
  })
}

export function createRole({ name, code, description, actorId }) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can create roles')
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO roles (id, code, name, description, is_system, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
  ).run(id, code, name, description ?? null, new Date().toISOString(), new Date().toISOString())
  writeAuditLog({ userId: actorId, action: 'role_created', module: 'settings', entityType: 'roles', entityId: id, newValue: { name, code } })
  return { id, code, name }
}

export function updateRole(roleId, { name, description, is_active }, actorId) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can edit roles')
  const db = getDb()
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('Role not found')
  if (role.code === 'admin' && is_active === false) throw new Error('Cannot disable Administrator role')

  db.prepare(
    `UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`
  ).run(name ?? null, description ?? null, is_active ?? null, new Date().toISOString(), roleId)

  writeAuditLog({ userId: actorId, action: 'role_updated', module: 'settings', entityType: 'roles', entityId: roleId, newValue: { name, is_active } })
}

export function deleteRole(roleId, actorId) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can delete roles')
  const db = getDb()
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('Role not found')
  if (role.is_system) throw new Error('System roles cannot be deleted')

  const assigned = db.prepare('SELECT COUNT(*) as c FROM user_roles WHERE role_id = ?').get(roleId).c
  if (assigned > 0) throw new Error('Role is assigned to users')

  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId)
  db.prepare('DELETE FROM roles WHERE id = ?').run(roleId)
  writeAuditLog({ userId: actorId, action: 'role_deleted', module: 'settings', entityType: 'roles', entityId: roleId })
}

export function duplicateRole(roleId, actorId) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can duplicate roles')
  const db = getDb()
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('Role not found')

  const newId = randomUUID()
  const newCode = `${role.code}_copy_${Date.now().toString(36)}`
  db.prepare(
    `INSERT INTO roles (id, code, name, description, is_system, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
  ).run(newId, newCode, `${role.name} (Copy)`, role.description, new Date().toISOString(), new Date().toISOString())

  db.prepare(
    `INSERT INTO role_permissions (role_id, permission_id, granted)
     SELECT ?, permission_id, granted FROM role_permissions WHERE role_id = ?`
  ).run(newId, roleId)

  writeAuditLog({ userId: actorId, action: 'role_duplicated', module: 'settings', entityType: 'roles', entityId: newId, newValue: { from: roleId } })
  return { id: newId, code: newCode }
}

export function assignUserRole(userId, roleId, actorId) {
  if (!isAdminUser(actorId)) throw new Error('Only Administrator can assign roles')
  const db = getDb()
  const role = db.prepare('SELECT code FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('Role not found')

  db.prepare(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET role_id = excluded.role_id, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at`
  ).run(userId, roleId, actorId, new Date().toISOString())

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role.code, userId)
  writeAuditLog({ userId: actorId, action: 'role_assigned', module: 'settings', entityType: 'users', entityId: userId, newValue: { roleId, roleCode: role.code } })
}

export function listApprovals(status) {
  const db = getDb()
  if (status) {
    return db
      .prepare(
        `SELECT ar.*, u.display_name as requester_name, w.name as warehouse_name
         FROM approval_requests ar
         LEFT JOIN users u ON u.id = ar.requested_by
         LEFT JOIN warehouses w ON w.id = ar.warehouse_id
         WHERE ar.status = ?
         ORDER BY ar.created_at DESC`
      )
      .all(status)
  }
  return db
    .prepare(
      `SELECT ar.*, u.display_name as requester_name, w.name as warehouse_name
       FROM approval_requests ar
       LEFT JOIN users u ON u.id = ar.requested_by
       LEFT JOIN warehouses w ON w.id = ar.warehouse_id
       ORDER BY ar.created_at DESC LIMIT 200`
    )
    .all()
}

export function listAuditLogs(limit = 100) {
  const db = getDb()
  return db
    .prepare(
      `SELECT al.*, u.display_name as user_name FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT ?`
    )
    .all(limit)
}

export { TABLE_PERMISSION_MAP }
