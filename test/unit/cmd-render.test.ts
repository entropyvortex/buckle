import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runRender } from '../../src/cli/commands/render.js';
import { makeContext } from '../../src/cli/context.js';
import * as paths from '../../src/util/paths.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'buckle-render-cmd-'));
  vi.spyOn(paths, 'bucklePaths').mockReturnValue({
    configRoot: tmpRoot,
    templatesRoot: tmpRoot,
    installedRoot: join(tmpRoot, '_installed'),
    trustStore: join(tmpRoot, 'trust.json'),
    configFile: join(tmpRoot, 'config.yaml'),
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runRender (cli/commands/render)', () => {
  it('writes devcontainer and exits 0 in text mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-render-dest-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    const code = await runRender(ctx, { template: 'ubuntu-base' });
    expect(code).toBe(0);
  });

  it('emits json envelope in json mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-render-dest-'));
    const ctx = makeContext({ trust: true, yes: true, json: true }, dir);
    const code = await runRender(ctx, { template: 'ubuntu-base' });
    expect(code).toBe(0);
    const writes = (process.stdout.write as unknown as { mock: { calls: [string][] } }).mock.calls.flat().join('');
    expect(writes).toContain('"hash"');
  });
});
