import { config } from './config/index.js';
import { createApp } from './app.js';
import { closeMongo } from './database/mongo.js';
import { closeDatabase } from './database/connection.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`SACONE API running on http://${config.host}:${config.port} [${config.appEnv}, ${config.serverMode} server]`);
  console.log(`  Database: ${config.databaseDriver} · real-time feed: /api/events · POS sync: /api/v1/sync`);
  if (config.serverMode === 'local') {
    console.log(`  Local domain: http://api.${config.localDomain} (run "npm run gateway"); LAN browsers allowed`);
  } else {
    console.log(`  CORS: ${config.corsOrigins.join(', ')}`);
  }
});

async function shutdown() {
  server.close();
  try { closeDatabase(); } catch { /* ignore */ }
  try { await closeMongo(); } catch { /* ignore */ }
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
