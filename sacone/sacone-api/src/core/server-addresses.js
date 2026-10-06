import os from 'os';
import { config } from '../config/index.js';

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const TAILSCALE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const VIRTUAL = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|bluetooth/i;

/**
 * Addresses phones on the shop network (or Tailscale) can use to reach this API, best first:
 * Wi-Fi / Ethernet LAN addresses, then Tailscale. Virtual and link-local adapters are skipped.
 */
export function serverAddresses() {
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const kind = PRIVATE.test(entry.address) ? 'lan' : TAILSCALE.test(entry.address) || /tailscale/i.test(name) ? 'tailscale' : null;
      if (!kind) continue;
      found.push({ name, kind, ip: entry.address, url: `http://${entry.address}:${config.port}` });
    }
  }
  const rank = (a) => (a.kind === 'lan' ? (/wi-?fi|wlan|wireless/i.test(a.name) ? 0 : 1) : 2);
  return { port: config.port, addresses: found.sort((a, b) => rank(a) - rank(b)) };
}
