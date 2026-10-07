import { AppError } from '../core/http.js';
import { runWithFirm } from '../database/context.js';
import { authService } from '../services/index.js';

export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.headers['x-session-token'] || null;
}

/**
 * Sign-in check. Business data needs a chosen firm: the rest of the request then runs in that
 * firm's books and financial year. Shared screens (users, roles, the firm picker) pass
 * { firm: 'optional' }.
 */
export function authenticate(required = true, { firm = 'required' } = {}) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      if (required) {
        return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
      }
      req.actor = null;
      return next();
    }

    const session = authService.getSession(token);
    if (!session) {
      return next(new AppError('Invalid or expired session', 401, 'UNAUTHORIZED'));
    }

    req.token = token;
    req.actor = session;
    if (!session.firm) {
      if (firm === 'required') {
        return next(new AppError('Choose a firm and financial year first', 409, 'FIRM_NOT_SELECTED'));
      }
      return next();
    }
    return runWithFirm({ firmId: session.firm.id, financialYear: session.financialYear?.code }, () => next());
  };
}

export function requirePermission(permissionKey) {
  return (req, res, next) => {
    try {
      authService.checkPermission(req.actor.permissions, permissionKey);
      next();
    } catch (err) {
      next(err);
    }
  };
}
