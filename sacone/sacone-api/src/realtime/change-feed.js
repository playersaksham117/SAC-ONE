/**
 * Real-time change feed.
 *
 * Every INSERT / UPDATE / DELETE that goes through the shared SQLite connection is
 * recorded here (see database/connection.js). Writes made in the same tick are
 * coalesced into one event: { seq, tables, firms, at }. `firms` lists the firms whose books
 * changed; '*' means shared data (users, roles, the firm list) that concerns every firm.
 *
 * Consumers:
 *   - GET /api/events          Server-Sent Events for the ERP and Owner web apps
 *   - GET /api/v1/sync/changes long-poll for SAC-POS phones (no EventSource in React Native)
 *
 * Only real writes publish, so page reloads (GETs) can never cause a refresh loop.
 */

import { EventEmitter } from 'events';

/** Bookkeeping tables that change on reads/logins and must not wake clients. */
const SILENT_TABLES = new Set([
  'sessions',
  'api_request_logs',
  'schema_migrations',
  'migration_logs',
  'migration_checkpoints',
  'export_logs',
  'email_send_log',
  'document_share_log',
]);

const WRITE_SQL = /^\s*(?:WITH\b[\s\S]*?\)\s*)?(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`[]?(\w+)/i;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const RECENT_LIMIT = 200;

let seq = 0;
let lastEvent = null;
let pending = null;
let pendingFirms = null;
const recent = [];

/** Table written by a statement, or null for reads / DDL. */
export function writeTargetOf(sql) {
  const match = WRITE_SQL.exec(sql);
  return match ? match[1].toLowerCase() : null;
}

export function recordWrite(table, firm = '*') {
  if (!table || SILENT_TABLES.has(table)) return;
  if (!pending) {
    pending = new Set();
    pendingFirms = new Set();
    setImmediate(flush);
  }
  pending.add(table);
  pendingFirms.add(firm);
}

/** Does this event concern `firmId`? (Always true without a firm, e.g. older clients.) */
export function concernsFirm(event, firmId) {
  return !firmId || !event.firms || event.firms.includes('*') || event.firms.includes(firmId);
}

function flush() {
  const tables = [...pending].sort();
  const firms = [...pendingFirms].sort();
  pending = null;
  pendingFirms = null;
  seq += 1;
  lastEvent = { seq, tables, firms, at: new Date().toISOString() };
  recent.push(lastEvent);
  if (recent.length > RECENT_LIMIT) recent.shift();
  emitter.emit('change', lastEvent);
}

export function currentSeq() {
  return seq;
}

export function lastChange() {
  return lastEvent;
}

/** Subscribe to change events. Returns an unsubscribe function. */
export function onChange(listener) {
  emitter.on('change', listener);
  return () => emitter.off('change', listener);
}

/**
 * Resolve with the first change event after `since` that touches one of `tables`
 * (a Set; any table when omitted), or null after `timeoutMs`.
 * A `since` the feed cannot vouch for (server restarted, or older than the recent
 * buffer) resolves at once with a `reset` event so the client does a full sync.
 */
export function waitForChange({ since = seq, tables = null, firmId = null, timeoutMs = 25_000 } = {}) {
  const relevant = (event) => concernsFirm(event, firmId) && (!tables || event.tables.some((t) => tables.has(t)));
  const oldestKnown = recent.length ? recent[0].seq - 1 : seq;
  if (since > seq || since < oldestKnown) {
    return Promise.resolve({ seq, tables: [], at: new Date().toISOString(), reset: true });
  }
  const missed = recent.find((event) => event.seq > since && relevant(event));
  if (missed) return Promise.resolve(missed);

  return new Promise((resolve) => {
    let off = null;
    const timer = setTimeout(() => { off?.(); resolve(null); }, timeoutMs);
    off = onChange((event) => {
      if (!relevant(event)) return;
      clearTimeout(timer);
      off();
      resolve(event);
    });
  });
}
