import {
  getUserPermissions,
  listRoles,
  getRolePermissions,
  updateRolePermissions,
  createRole,
  updateRole,
  deleteRole,
  duplicateRole,
  assignUserRole,
  listApprovals,
  processApproval,
  createApprovalRequest,
  listAuditLogs,
  isAdminUser,
} from './rbacEngine.mjs'

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function getUserId(req) {
  return req.headers['x-user-id'] || req.headers['X-User-Id'] || null
}

export function handleRbacHttp(req, res, body, path, method, fullUrl = path) {
  const userId = getUserId(req)

  try {
    // GET /api/rbac/permissions/me
    if (path === '/api/rbac/permissions/me' && method === 'GET') {
      const permissions = getUserPermissions(userId)
      return send(res, 200, { permissions, isAdmin: isAdminUser(userId) })
    }

    // GET /api/rbac/roles
    if (path === '/api/rbac/roles' && method === 'GET') {
      if (!isAdminUser(userId)) return send(res, 403, { error: 'Administrator only' })
      return send(res, 200, { roles: listRoles() })
    }

    // POST /api/rbac/roles
    if (path === '/api/rbac/roles' && method === 'POST') {
      const role = createRole({ ...body, actorId: userId })
      return send(res, 201, role)
    }

    // GET /api/rbac/roles/:id/permissions
    const permMatch = path.match(/^\/api\/rbac\/roles\/([^/]+)\/permissions$/)
    if (permMatch && method === 'GET') {
      if (!isAdminUser(userId)) return send(res, 403, { error: 'Administrator only' })
      return send(res, 200, { permissions: getRolePermissions(permMatch[1]) })
    }

    // PUT /api/rbac/roles/:id/permissions
    if (permMatch && method === 'PUT') {
      updateRolePermissions(permMatch[1], body.permissionCodes || [], userId)
      return send(res, 200, { ok: true })
    }

    // POST /api/rbac/roles/:id/duplicate
    const dupMatch = path.match(/^\/api\/rbac\/roles\/([^/]+)\/duplicate$/)
    if (dupMatch && method === 'POST') {
      const role = duplicateRole(dupMatch[1], userId)
      return send(res, 201, role)
    }

    // PUT /api/rbac/roles/:id
    const roleMatch = path.match(/^\/api\/rbac\/roles\/([^/]+)$/)
    if (roleMatch && method === 'PUT') {
      updateRole(roleMatch[1], body, userId)
      return send(res, 200, { ok: true })
    }

    // DELETE /api/rbac/roles/:id
    if (roleMatch && method === 'DELETE') {
      deleteRole(roleMatch[1], userId)
      return send(res, 200, { ok: true })
    }

    // POST /api/rbac/users/:id/role
    const assignMatch = path.match(/^\/api\/rbac\/users\/([^/]+)\/role$/)
    if (assignMatch && method === 'POST') {
      assignUserRole(assignMatch[1], body.roleId, userId)
      return send(res, 200, { ok: true })
    }

    // GET /api/rbac/approvals?status=pending
    if (path.startsWith('/api/rbac/approvals') && method === 'GET') {
      const url = new URL(fullUrl, 'http://local')
      const status = url.searchParams.get('status') || undefined
      return send(res, 200, { approvals: listApprovals(status) })
    }

    // POST /api/rbac/approvals
    if (path === '/api/rbac/approvals' && method === 'POST') {
      const result = createApprovalRequest({ ...body, requestedBy: userId })
      return send(res, 201, result)
    }

    // POST /api/rbac/approvals/:id/:action
    const approvalActionMatch = path.match(/^\/api\/rbac\/approvals\/([^/]+)\/(approve|reject|info)$/)
    if (approvalActionMatch && method === 'POST') {
      const result = processApproval({
        approvalId: approvalActionMatch[1],
        actorId: userId,
        action: approvalActionMatch[2] === 'info' ? 'info' : approvalActionMatch[2],
        notes: body.notes,
      })
      return send(res, 200, result)
    }

    // GET /api/rbac/audit
    if (path === '/api/rbac/audit' && method === 'GET') {
      if (!isAdminUser(userId)) return send(res, 403, { error: 'Administrator only' })
      return send(res, 200, { logs: listAuditLogs() })
    }

    send(res, 404, { error: 'Not found' })
  } catch (error) {
    send(res, 400, { error: error.message || 'RBAC error' })
  }
}
