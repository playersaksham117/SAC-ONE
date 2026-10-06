import { AppError } from './http.js';

/**
 * In-memory fixed-window rate limiter (single API process).
 * key(req) picks the bucket — the signed-in user when known, otherwise the client IP.
 */
export function rateLimit({ windowMs, max, name, key = (req) => req.actor?.user?.id || req.ip }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const bucket = `${name}:${key(req) || 'anonymous'}`;
    let entry = hits.get(bucket);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(bucket, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError('Too many requests — wait a moment and try again', 429, 'RATE_LIMITED'));
    }
    return next();
  };
}

/** Responses carrying invoices or customer data: never cached, never leak the URL as a referrer. */
export function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}
