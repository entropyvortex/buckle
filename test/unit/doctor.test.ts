import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runDoctor } from '../../src/cli/commands/doctor.js';
import { makeContext } from '../../src/cli/context.js';

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runDoctor', () => {
  it('returns a json envelope with checks[]', async () => {
    const ctx = makeContext({ json: true });
    await runDoctor(ctx);
    const out = (process.stdout.write as unknown as { mock: { calls: [string][] } }).mock.calls.flat().join('');
    expect(out).toContain('"checks"');
    expect(out).toContain('"overall"');
  });

  it('runs in text mode without throwing', async () => {
    const ctx = makeContext({});
    const code = await runDoctor(ctx);
    // Exit 0 (healthy/degraded) or 1 (broken). Both are valid; just no exception.
    expect([0, 1]).toContain(code);
  });
});
