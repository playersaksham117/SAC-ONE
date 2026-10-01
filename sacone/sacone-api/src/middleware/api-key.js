import { AppError } from '../core/http.js';
import { generateId } from '../core/utils.js';
import { repos } from '../repositories/index.js';
import { hashApiKey } from '../repositories/sqlite/webstore.js';

const apiKeyRepo = repos.apiKeys;
const logRepo = repos.apiRequestLogs;

export function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer sk_')) {
    return authHeader.slice(7).trim();
  }
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Authenticate web store requests via API key.
 * Attaches req.apiKeyActor = { id, name, scopes, keyPrefix }
 */
export function authenticateApiKey(requiredScopes = []) {
  return (req, res, next) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      return next(new AppError('API key required. Pass X-API-Key header.', 401, 'UNAUTHORIZED'));
    }

    const record = apiKeyRepo.findByHash(hashApiKey(rawKey));
    if (!record) {
      return next(new AppError('Invalid or revoked API key', 401, 'UNAUTHORIZED'));
    }

    const scopes = Array.isArray(record.scopes) ? record.scopes : [];
    for (const scope of requiredScopes) {
      if (!scopes.includes(scope) && !scopes.includes('*')) {
        return next(new AppError(`API key missing scope: ${scope}`, 403, 'FORBIDDEN'));
      }
    }

    apiKeyRepo.touchLastUsed(record.id);
    req.apiKeyActor = {
      id: record.id,
      name: record.name,
      scopes,
      keyPrefix: record.keyPrefix,
    };
    req.requestId = req.headers['x-request-id'] || generateId();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}

/** Log every webstore API response (success or error). */
export function logApiRequest(req, res, next) {
  const started = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    try {
      const statusCode = res.statusCode || 200;
      logRepo.create({
        apiKeyId: req.apiKeyActor?.id || null,
        requestId: req.requestId || generateId(),
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode,
        durationMs: Date.now() - started,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        errorCode: body?.success === false ? (body?.error?.code || null) : null,
      });
    } catch (err) {
      console.error('Failed to write API request log', err);
    }
    return originalJson(body);
  };

  next();
}
