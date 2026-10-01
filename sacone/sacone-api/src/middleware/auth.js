import { AppError } from '../core/http.js';
import { authService } from '../services/index.js';

export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.headers['x-session-token'] || null;
}

export function authenticate(required = true) {
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
    next();
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
