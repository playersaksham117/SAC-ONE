import { describe, expect, it } from 'vitest';
import { buildPairingLink, pairingFromParams, parsePairingCode } from '../src/domain/pairing';

// Built at runtime: a literal key-shaped string trips GitHub secret scanning.
const KEY = ['sk', 'live', 'x'.repeat(32)].join('_');

describe('pairing QR', () => {
  it('round-trips key, several server URLs, device name and firm', () => {
    const link = buildPairingLink({
      urls: ['http://192.168.1.5:4000', 'http://100.101.102.103:4000'],
      key: KEY,
      deviceName: 'Counter 1 & 2',
      firm: 'Sharma Traders, Jalandhar',
    });
    expect(link.startsWith('sacpos://connect?')).toBe(true);
    expect(parsePairingCode(link)).toEqual({
      urls: ['http://192.168.1.5:4000', 'http://100.101.102.103:4000'],
      key: KEY,
      deviceName: 'Counter 1 & 2',
      firm: 'Sharma Traders, Jalandhar',
    });
  });

  it('parses the exact string the ERP builds', () => {
    const erp = `sacpos://connect?k=${KEY}&u=${encodeURIComponent('http://192.168.1.5:4000')}&n=${encodeURIComponent('Counter 1')}`;
    const p = parsePairingCode(erp);
    expect(p.urls).toEqual(['http://192.168.1.5:4000']);
    expect(p.deviceName).toBe('Counter 1');
    expect(p.firm).toBeNull();
  });

  it('rejects other QR codes and broken ones with a clear message', () => {
    expect(() => parsePairingCode('8901234567890')).toThrow(/not a SAC-POS connection code/);
    expect(() => parsePairingCode('https://example.com/?k=x')).toThrow(/not a SAC-POS/);
    expect(() => parsePairingCode('sacpos://connect')).toThrow(/incomplete/);
    expect(() => parsePairingCode(`sacpos://connect?u=${encodeURIComponent('http://1.2.3.4:4000')}`)).toThrow(/no valid device key/);
    expect(() => parsePairingCode(`sacpos://connect?k=${KEY}&u=ftp%3A%2F%2Fx`)).toThrow(/no server address/);
    expect(() => parsePairingCode(`sacpos://connect?k=${KEY}&u=%E0%A4%A`)).toThrow();
  });

  it('drops bad and duplicate URLs, trims trailing slashes, caps the list', () => {
    const p = pairingFromParams({
      k: KEY,
      u: 'http://a:4000/,javascript:alert(1),http://a:4000,https://b.example,http://c:1,http://d:1,http://e:1,http://f:1,http://g:1',
    });
    expect(p.urls[0]).toBe('http://a:4000');
    expect(p.urls).not.toContain('javascript:alert(1)');
    expect(new Set(p.urls).size).toBe(p.urls.length);
    expect(p.urls.length).toBeLessThanOrEqual(6);
  });

  it('strips control characters from the names it shows', () => {
    const p = pairingFromParams({ k: KEY, u: 'http://a:4000', n: 'Till\n1\u0007', f: '' });
    expect(p.deviceName).toBe('Till 1');
    expect(p.firm).toBeNull();
  });
});
