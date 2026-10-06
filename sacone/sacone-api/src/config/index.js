import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../core/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../../.env') });

const rawAppEnv = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
const APP_ENV = ['development', 'local', 'staging', 'production'].includes(rawAppEnv)
  ? (rawAppEnv === 'local' ? 'development' : rawAppEnv)
  : 'development';

function publicDocumentBase(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const url = new URL(value);
    const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && localhost)) return url.origin + url.pathname.replace(/\/+$/, '');
  } catch { /* invalid URL */ }
  console.warn('PUBLIC_DOCUMENT_BASE_URL ignored: it must be an https:// URL. Invoice links stay disabled.');
  return '';
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Logical environment: development | staging | production */
  appEnv: APP_ENV,
  /** Active persistence driver. Production remains sqlite until Mongo cutover. */
  databaseDriver: (process.env.DATABASE_DRIVER || 'sqlite').toLowerCase(),
  databasePath: process.env.DATABASE_PATH || './data/sacone.db',
  exportDir: process.env.EXPORT_DIR || './data/exports',
  /** MongoDB Atlas / local Mongo (JSON→Mongo importer / future driver). Optional until cutover. */
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'sacone',
  mongodbMaxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
  /** Safety gate — must be true for importer / mongo reset writes */
  mongodbWriteEnabled: process.env.MONGODB_WRITE_ENABLED === 'true' || process.env.MONGODB_WRITE_ENABLED === '1',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10),
  /** Optional JWT secret for future token auth; sessions remain primary today */
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  /** Comma-separated list; POS/mobile native apps send no Origin and are always allowed. */
  corsOrigins: [...new Set([
    ...(process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    // SACONE Owner web app (CEO Dashboard, Income & Expense) is always allowed.
    ...(process.env.OWNER_APP_ORIGIN || 'http://localhost:3001').split(','),
  ].map((o) => o.trim()).filter(Boolean))],
  /**
   * local = this PC is the server (SQLite + local domain + LAN clients).
   * cloud = linked to MongoDB / Supabase; only CORS_ORIGIN origins are trusted.
   */
  serverMode: (process.env.SERVER_MODE || 'local').toLowerCase() === 'cloud' ? 'cloud' : 'local',
  /** Local domain served by the gateway: erp.<domain>, owner.<domain>, api.<domain>. */
  localDomain: (process.env.LOCAL_DOMAIN || 'sacone.local').trim().toLowerCase(),
  /** Cloud link targets — used only by `npm run cloud:*` (see docs/CLOUD_LINK.md). */
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    dbUrl: process.env.SUPABASE_DB_URL || '',
  },
  /** Bind address — 0.0.0.0 lets POS terminals / phones on the LAN reach the API. */
  host: process.env.HOST || '0.0.0.0',
  /** Max JSON body (POS sync batches can be large). */
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '5mb',
  defaultAdmin: {
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@sacone.local',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
    name: process.env.DEFAULT_ADMIN_NAME || 'System Administrator',
  },
  /**
   * Public HTTPS origin of the ERP's /share page, e.g. https://erp.example.com. Customer-facing
   * invoice links are disabled until this is set; plain http is accepted only for localhost testing.
   */
  publicDocumentBaseUrl: publicDocumentBase(process.env.PUBLIC_DOCUMENT_BASE_URL),
  /** Lifetime of a shared invoice link (1–168 hours). */
  documentLinkTtlHours: Math.min(168, Math.max(1, parseInt(process.env.DOCUMENT_LINK_TTL_HOURS || '24', 10) || 24)),
  /** When true, inserts sample products/parties for local demos. Default: off (real data only). */
  seedDemoData: process.env.SEED_DEMO_DATA === 'true' || process.env.SEED_DEMO_DATA === '1',
};

const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
/** Tailscale: 100.64.0.0/10 addresses and MagicDNS names (*.ts.net). */
const TAILSCALE_IPV4 = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

/**
 * In local server mode, browsers on this PC or the shop LAN may use the API:
 * localhost, private IPs (phones opening http://192.168.x.x:3000), Tailscale and the local domain.
 */
export function isLocalNetworkOrigin(origin) {
  if (config.serverMode !== 'local') return false;
  let hostname;
  try {
    ({ hostname } = new URL(origin));
  } catch {
    return false;
  }
  const domain = config.localDomain;
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || PRIVATE_IPV4.test(hostname)
    || TAILSCALE_IPV4.test(hostname)
    || hostname.endsWith('.ts.net')
    || (Boolean(domain) && (hostname === domain || hostname.endsWith(`.${domain}`)));
}

export function isDevelopmentEnv() {
  return config.appEnv === 'development';
}

export function isProductionEnv() {
  return config.appEnv === 'production';
}

/**
 * Block automatic destructive database operations outside development.
 * Production/staging require an explicit admin procedure (FORCE_DB_RESET=CONFIRM_PRODUCTION_RESET).
 */
export function assertDestructiveDbAllowed(operation = 'database reset') {
  if (isDevelopmentEnv()) return true;

  const force = process.env.FORCE_DB_RESET === 'CONFIRM_PRODUCTION_RESET';
  if (isProductionEnv() || config.appEnv === 'staging') {
    if (!force) {
      throw new AppError(
        `Refusing ${operation}: APP_ENV=${config.appEnv}. Destructive resets are blocked outside development. ` +
          'Set APP_ENV=development for local resets, or use a documented admin migration procedure.',
        403,
        'DESTRUCTIVE_RESET_BLOCKED'
      );
    }
  }
  return true;
}
