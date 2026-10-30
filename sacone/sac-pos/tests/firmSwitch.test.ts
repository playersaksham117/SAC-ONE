import { beforeEach, describe, expect, it, vi } from 'vitest';

// Built at runtime: a literal key-shaped string trips GitHub secret scanning.
const KEY_T = ['sk', 'live', 't'.repeat(32)].join('_');

const calls: string[] = [];
const device = {
  baseUrl: 'http://192.168.1.4:4000' as string | null,
  saved: [
    { id: 'dev-s', firm: 'SARTHI ENTERPRISES', deviceName: 'COUNTER SAC', warehouse: null, baseUrl: 'http://192.168.1.4:4000' },
    { id: 'dev-t', firm: 'TRIZON CORPORATION', deviceName: 'TRIZON WEB', warehouse: null, baseUrl: 'http://192.168.1.4:4000' },
  ],
  keys: { 'dev-t': KEY_T } as Record<string, string>,
  async savedKey(id: string) { return this.keys[id] ?? null; },
  async connect(url: string, key: string) { calls.push(`connect ${url} ${key === KEY_T ? 'T' : '?'}`); },
};
const ledger = { held: [] as unknown[], sales: [] as unknown[], clearForNewTerminal: () => calls.push('clear ledger') };
let pending = 0;

vi.mock('../src/api/client', () => ({ ApiError: class extends Error { status = 0; get isNetwork() { return true; } } }));
vi.mock('../src/store/device', () => ({ useDevice: { getState: () => device } }));
vi.mock('../src/store/ledger', () => ({ useLedger: { getState: () => ledger }, pendingCount: () => ({ pending, review: 0 }) }));
vi.mock('../src/store/catalog', () => ({ useCatalog: { getState: () => ({ customers: {}, reset: () => calls.push('reset catalog') }) } }));
vi.mock('../src/store/cart', () => ({ useCart: { getState: () => ({ clear: () => calls.push('clear cart') }) } }));
vi.mock('../src/store/session', () => ({ useSession: { getState: () => ({ forgetAll: () => calls.push('forget sign-ins') }) } }));
vi.mock('../src/sync/engine', () => ({ syncNow: async () => { calls.push('sync'); } }));

const { switchToSavedTerminal } = await import('../src/lib/pairing');

describe('firm choice at sign-in', () => {
  beforeEach(() => { calls.length = 0; pending = 0; });

  it('switches to the other firm with its own saved key and clears the first firm', async () => {
    await switchToSavedTerminal('dev-t');
    expect(calls).toEqual(['sync', 'connect http://192.168.1.4:4000 T', 'clear ledger', 'reset catalog', 'clear cart', 'forget sign-ins', 'sync']);
  });

  it('a firm whose key is not saved here is refused, nothing cleared', async () => {
    await expect(switchToSavedTerminal('dev-s')).rejects.toThrow(/not set up on this device/);
    expect(calls).not.toContain('clear ledger');
  });

  it('unsynced bills block the switch', async () => {
    pending = 2;
    await expect(switchToSavedTerminal('dev-t')).rejects.toThrow(/not synced/);
    expect(calls.some((c) => c.startsWith('connect'))).toBe(false);
  });
});
