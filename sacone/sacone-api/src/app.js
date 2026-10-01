import express from 'express';
import cors from 'cors';
import { config, isLocalNetworkOrigin } from './config/index.js';
import { AppError, sendError } from './core/http.js';
import { ROUTES } from './routes/registry.js';
import { getDatabaseHealth } from './database/mongo.js';

/**
 * Build the Express application (no network listener) — used by the server
 * bootstrap in index.js and by integration scripts/tests.
 */
export function createApp() {
  const app = express();

  const allowedOrigins = config.corsOrigins;
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      // Native POS/mobile apps send no Origin header.
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new AppError(`Origin not allowed: ${origin}`, 403, 'CORS_BLOCKED'));
    },
  }));
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', async (_req, res) => {
    try {
      const dbHealth = await getDatabaseHealth();
      res.json({
        status: dbHealth.ok ? 'ok' : 'degraded',
        service: 'sacone-api',
        application: 'OK',
        database: dbHealth.ok ? 'CONNECTED' : 'ERROR',
        environment: config.appEnv,
        serverMode: config.serverMode,
        databaseDriver: config.databaseDriver,
        mongodbConfigured: dbHealth.mongodb?.configured || false,
        mongodbConnected: dbHealth.mongodb?.connected || false,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'error',
        service: 'sacone-api',
        application: 'OK',
        database: 'ERROR',
        environment: config.appEnv,
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  for (const [path, router] of ROUTES) {
    app.use(path, router);
  }

  app.use((_req, res) => {
    sendError(res, 'Not found', 404, 'NOT_FOUND');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return sendError(res, err.message, err.statusCode, err.code);
    }
    if (err?.type === 'entity.too.large') {
      return sendError(res, 'Request body too large — sync in smaller batches', 413, 'PAYLOAD_TOO_LARGE');
    }
    if (err?.type === 'entity.parse.failed') {
      return sendError(res, 'Malformed JSON body', 400, 'BAD_JSON');
    }
    console.error(err);
    return sendError(res, 'Internal server error', 500, 'INTERNAL_ERROR');
  });

  return app;
}
