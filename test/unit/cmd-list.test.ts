import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runList } from '../../src/cli/commands/list.js';
import { makeContext } from '../../src/cli/context.js';

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('runList', () => {
  it('emits json envelope when --json', async () => {
    const ctx = makeContext({ json: true }, '/tmp');
    const code = await runList(ctx);
    expect(code).toBe(0);
    const out = (process.stdout.write as unknown as { mock: { calls: [string][] } }).mock.calls.flat().join('');
    expect(out).toMatch(/"templates":/);
  });

  it('non-json returns 0 with text output', async () => {
    const ctx = makeContext({}, '/tmp');
    const code = await runList(ctx);
    expect(code).toBe(0);
  });

  it('installed-only filter works without throwing', async () => {
    const ctx = makeContext({ installedOnly: true }, '/tmp');
    expect(await runList(ctx)).toBe(0);
  });
});
