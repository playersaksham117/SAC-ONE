/**
 * SACONE local-domain gateway: one entry point for every app on this PC.
 *
 *   http://erp.sacone.local    → ERP      (localhost:3000)   also http://sacone.local
 *   http://owner.sacone.local  → Owner    (localhost:3001)
 *   http://api.sacone.local    → API      (localhost:4000)   SAC-POS server URL
 *
 * Any other host (e.g. http://192.168.1.20 from a phone) opens the ERP.
 * Hostnames must resolve to this PC: run local-server/setup-hosts.ps1 as administrator.
 *
 * Settings (sacone-api/.env or environment): LOCAL_DOMAIN (sacone.local), GATEWAY_PORT (80).
 * Zero dependencies; proxies plain HTTP, Server-Sent Events and WebSockets (Next.js HMR).
 */

import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

function readApiEnv() {
  const file = path.join(here, '..', 'sacone-api', '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]));
}

const fileEnv = readApiEnv();
const setting = (key, fallback) => process.env[key] || fileEnv[key] || fallback;

const DOMAIN = setting('LOCAL_DOMAIN', 'sacone.local').toLowerCase();
const PORT = Number.parseInt(setting('GATEWAY_PORT', '80'), 10);
const APPS = {
  erp: { name: 'SACONE ERP', port: Number.parseInt(setting('ERP_PORT', '3000'), 10) },
  owner: { name: 'SACONE Owner', port: Number.parseInt(setting('OWNER_PORT', '3001'), 10) },
  api: { name: 'SACONE API', port: Number.parseInt(setting('PORT', '4000'), 10) },
};

function appFor(hostHeader = '') {
  const host = hostHeader.split(':')[0].toLowerCase();
  if (host === `api.${DOMAIN}`) return APPS.api;
  if (host === `owner.${DOMAIN}`) return APPS.owner;
  return APPS.erp;
}

function forwardedHeaders(req) {
  const prior = req.headers['x-forwarded-for'];
  const client = req.socket.remoteAddress || '';
  return {
    ...req.headers,
    'x-forwarded-for': prior ? `${prior}, ${client}` : client,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': 'http',
  };
}

function unavailable(res, app) {
  if (res.headersSent) return res.destroy();
  res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(`<!doctype html><meta charset="utf-8"><title>${app.name} is not running</title>
<body style="font-family:system-ui;max-width:520px;margin:15vh auto;padding:0 16px;color:#334155">
<h2>${app.name} is not running</h2>
<p>The gateway is up, but nothing answers on port ${app.port}. Start everything with
<code>start-all.bat</code> (or <code>npm run dev</code> in the sacone folder) and reload.</p>`);
}

const server = http.createServer((req, res) => {
  const app = appFor(req.headers.host);
  const upstream = http.request({
    host: '127.0.0.1',
    port: app.port,
    method: req.method,
    path: req.url,
    headers: forwardedHeaders(req),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.statusMessage, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => unavailable(res, app));
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});

// WebSockets (Next.js hot reload) and other upgrades: raw TCP passthrough.
server.on('upgrade', (req, socket, head) => {
  const app = appFor(req.headers.host);
  const upstream = net.connect(app.port, '127.0.0.1', () => {
    const headers = forwardedHeaders(req);
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [key, value] of Object.entries(headers)) {
      for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.requestTimeout = 0; // SSE streams and POS long-polls stay open
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    console.error(`Port ${PORT} is ${err.code === 'EADDRINUSE' ? 'already in use' : 'not allowed'}.`);
    console.error('Set GATEWAY_PORT=8080 in sacone-api/.env and use http://erp.' + DOMAIN + ':8080 instead.');
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const suffix = PORT === 80 ? '' : `:${PORT}`;
  console.log(`SACONE gateway on port ${PORT}`);
  console.log(`  ERP    http://erp.${DOMAIN}${suffix}   (also http://${DOMAIN}${suffix})`);
  console.log(`  Owner  http://owner.${DOMAIN}${suffix}`);
  console.log(`  API    http://api.${DOMAIN}${suffix}`);
});
