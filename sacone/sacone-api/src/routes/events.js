import { Router } from 'express';
import { AppError } from '../core/http.js';
import { extractToken } from '../middleware/auth.js';
import { authService } from '../services/index.js';
import { currentSeq, onChange } from '../realtime/change-feed.js';

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/events — Server-Sent Events stream of data changes for the web apps.
 * Authenticated like every other route (Authorization: Bearer <session token>);
 * the web apps read it with fetch() streaming, so the token never goes in a URL.
 *
 *   event: ready   data: { seq }
 *   event: change  data: { seq, tables: ['products', ...], at }
 *   event: expired (session ended — the client should re-login)
 */
export const eventsRouter = Router();

eventsRouter.get('/', (req, res, next) => {
  const token = extractToken(req);
  if (!token || !authService.getSession(token)) {
    return next(new AppError('Invalid or expired session', 401, 'UNAUTHORIZED'));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.write('retry: 3000\n\n');
  send('ready', { seq: currentSeq() });

  const unsubscribe = onChange((change) => send('change', change));
  const heartbeat = setInterval(() => {
    if (!authService.getSession(token)) {
      send('expired', {});
      res.end();
      return;
    }
    res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
  return undefined;
});
