'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBase, getToken } from './api';

/**
 * Real-time data. One stream per browser tab reads GET /api/events (Server-Sent Events)
 * and fans change notices out to the screens that are mounted. The API publishes a
 * notice after every committed write, so every screen shows what the database holds now.
 */

/** Device heartbeats and sync bookkeeping: only screens that ask for them by name refresh. */
const QUIET_TABLES = new Set(['pos_devices', 'pos_sync_inbox', 'audit_logs']);
const RETRY_MS = 3000;

const listeners = new Set();
const statusListeners = new Set();
let status = 'offline';
let controller = null;

function setStatus(next) {
  status = next;
  statusListeners.forEach((fn) => fn(next));
}

function emit(change) {
  listeners.forEach((fn) => fn(change));
}

function handleBlock(block, state) {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (event === 'ready') {
    // After a dropped connection, refresh everything: changes may have been missed.
    if (state.wasConnected) emit({ tables: [], all: true });
    state.wasConnected = true;
    setStatus('live');
  } else if (event === 'change') {
    try { emit(JSON.parse(data)); } catch { /* ignore malformed */ }
  }
  // 'expired': the server closes the stream; the loop reconnects with the current token.
}

async function run(signal) {
  const state = { wasConnected: false };
  while (!signal.aborted) {
    const token = getToken();
    if (!token) break;
    try {
      const res = await fetch(`${getApiBase()}/api/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal,
      });
      if (res.status === 401) break;
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value.replace(/\r/g, '');
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          handleBlock(buffer.slice(0, end), state);
          buffer = buffer.slice(end + 2);
        }
      }
    } catch {
      if (signal.aborted) break;
    }
    setStatus('reconnecting');
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  if (!signal.aborted) setStatus('offline');
  controller = null;
}

function ensureConnected() {
  if (controller || typeof window === 'undefined' || !getToken()) return;
  controller = new AbortController();
  run(controller.signal);
}

function subscribe(fn) {
  listeners.add(fn);
  ensureConnected();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && !statusListeners.size && controller) {
      controller.abort();
      controller = null;
      setStatus('offline');
    }
  };
}

/**
 * Re-run `refresh` whenever data changes on the server.
 *   tables: only refresh for writes to these tables (default: any table except QUIET_TABLES)
 * Changes are debounced, and deferred while the tab is hidden.
 */
export function useLiveRefresh(refresh, { tables = null, delay = 400 } = {}) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  const tableKey = tables ? tables.join(',') : '';

  useEffect(() => {
    const wanted = tableKey ? new Set(tableKey.split(',')) : null;
    let timer = null;
    let stale = false;

    const run = () => {
      if (document.visibilityState === 'hidden') {
        stale = true;
        return;
      }
      stale = false;
      refreshRef.current?.();
    };
    const off = subscribe((change) => {
      const relevant = change.all || change.tables.some((t) => (wanted ? wanted.has(t) : !QUIET_TABLES.has(t)));
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    });
    const onVisible = () => { if (stale && document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      off();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tableKey, delay]);
}

/** 'live' | 'reconnecting' | 'offline' — for the header indicator. */
export function useLiveStatus() {
  const [value, setValue] = useState(status);
  useEffect(() => {
    statusListeners.add(setValue);
    setValue(status);
    ensureConnected();
    return () => { statusListeners.delete(setValue); };
  }, []);
  return value;
}

/** Small "Live" pill for the app header (`dark` for dark headers). */
export function LiveIndicator({ dark = false }) {
  const value = useLiveStatus();
  const styles = {
    live: ['bg-emerald-500', 'Live'],
    reconnecting: ['bg-amber-500 animate-pulse', 'Reconnecting'],
    offline: ['bg-slate-400', 'Offline'],
  }[value];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
        dark ? 'text-slate-300 ring-1 ring-white/15' : 'border border-slate-200 bg-white text-slate-600'
      }`}
      title="Real-time updates from the SACONE server"
    >
      <span className={`h-2 w-2 rounded-full ${styles[0]}`} />
      {styles[1]}
    </span>
  );
}
