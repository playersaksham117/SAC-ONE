/**
 * SAC-POS web: serves the browser build (`npm run web:build` → dist/) on a counter PC, laptop or
 * tablet on the shop network. Pair it like a phone (ERP → POS Devices & Sync → Register device),
 * then staff sign in with Login ID + PIN. Port: POS_WEB_PORT (default 3002).
 *   npm run web:build && npm run web:serve
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number.parseInt(process.env.POS_WEB_PORT || '3002', 10);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('SAC-POS web is not built yet. Run: npm run web:build');
  process.exit(1);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path));
  const inside = file.startsWith(ROOT);
  // real files (bundles, fonts, images); every other path is an app screen → index.html
  const target = inside && existsSync(file) && statSync(file).isFile() ? file : join(ROOT, 'index.html');
  const isIndex = target.endsWith('index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(target)] || 'application/octet-stream',
    // hashed bundles never change; the page itself always re-checks so updates show at once
    'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(target).pipe(res);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // web:build replaces dist in place; the copy already running serves the new build
    console.log(`SAC-POS web is already running on port ${PORT}; it now serves the new build. Nothing else to do.`);
    process.exit(0);
  }
  throw err;
}).listen(PORT, '0.0.0.0', () => {
  console.log(`SAC-POS web on http://localhost:${PORT} (and this PC's LAN address, port ${PORT})`);
});
