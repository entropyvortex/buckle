import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkTrust, hookSurfaceHash, loadTrustStore, recordTrust, saveTrustStore } from '../../src/templates/trust.js';

describe('trust store', () => {
  it('returns empty store when missing', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'trust-')), 'trust.json');
    const s = await loadTrustStore(f);
    expect(s.entries).toEqual({});
    expect(s.version).toBe(1);
  });

  it('records and re-reads a trust entry', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'trust-')), 'trust.json');
    await recordTrust('hashA', 'surfA', f);
    const s = await loadTrustStore(f);
    expect(s.entries['hashA']?.hookHash).toBe('surfA');
    const dec = await checkTrust('hashA', 'surfA', f);
    expect(dec.trusted).toBe(true);
    expect(dec.changed).toBe(false);
  });

  it('marks changed when hook surface differs from stored', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'trust-')), 'trust.json');
    await recordTrust('hashA', 'surfA', f);
    const dec = await checkTrust('hashA', 'surfB', f);
    expect(dec.trusted).toBe(false);
    expect(dec.changed).toBe(true);
  });

  it('saveTrustStore round-trips', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'trust-')), 'trust.json');
    const store = { version: 1 as const, entries: { foo: { trustedAt: 'now', hookHash: 'h' } } };
    await saveTrustStore(store, f);
    expect((await loadTrustStore(f)).entries['foo']).toEqual(store.entries['foo']);
  });
});

describe('hookSurfaceHash', () => {
  it('is stable for equivalent inputs', () => {
    const a = hookSurfaceHash({ lifecycle: { postCreate: ['x'] } } as never);
    const b = hookSurfaceHash({ lifecycle: { postCreate: ['x'] } } as never);
    expect(a).toBe(b);
  });

  it('changes when commands change', () => {
    const a = hookSurfaceHash({ lifecycle: { postCreate: ['x'] } } as never);
    const b = hookSurfaceHash({ lifecycle: { postCreate: ['y'] } } as never);
    expect(a).not.toBe(b);
  });
});
