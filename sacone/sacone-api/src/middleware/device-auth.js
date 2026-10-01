import { AppError } from '../core/http.js';
import { generateId } from '../core/utils.js';
import { extractApiKey } from './api-key.js';
import { authenticateDeviceKey } from '../services/pos-sync.js';

/**
 * Authenticate a POS terminal.
 * Headers: X-API-Key (or Authorization: Bearer <key>), optional X-Device-Id.
 * The first X-Device-Id seen is bound to the key, so a leaked key cannot be
 * used from a second terminal without rotating it in ERP.
 * Attaches req.device.
 */
export function authenticateDevice() {
  return (req, res, next) => {
    try {
      const rawKey = extractApiKey(req) || bearer(req);
      if (!rawKey) {
        return next(new AppError('Device sync key required (X-API-Key header)', 401, 'UNAUTHORIZED'));
      }
      const fingerprint = String(req.headers['x-device-id'] || '').trim() || null;
      const device = authenticateDeviceKey(rawKey, fingerprint);
      if (!device) {
        return next(new AppError('Invalid or revoked device sync key', 401, 'UNAUTHORIZED'));
      }
      req.device = device;
      req.requestId = req.headers['x-request-id'] || generateId();
      res.setHeader('X-Request-Id', req.requestId);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function bearer(req) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
}
