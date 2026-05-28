import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runNew } from '../../src/cli/commands/new.js';
import { makeContext } from '../../src/cli/context.js';
import * as paths from '../../src/util/paths.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'buckle-new-test-'));
  vi.spyOn(paths, 'bucklePaths').mockReturnValue({
    configRoot: tmpRoot,
    templatesRoot: tmpRoot,
    installedRoot: join(tmpRoot, '_installed'),
    trustStore: join(tmpRoot, 'trust.json'),
    configFile: join(tmpRoot, 'config.yaml'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runNew', () => {
  it('writes a starter template.yaml', async () => {
    const ctx = makeContext({}, '/tmp');
    const code = await runNew(ctx, { name: 'mytemplate', extend: 'ubuntu-base' });
    expect(code).toBe(0);
    const text = await readFile(join(tmpRoot, 'mytemplate', 'template.yaml'), 'utf8');
    expect(text).toContain('name: mytemplate');
    expect(text).toContain('extends: ubuntu-base');
  });

  it('refuses an existing built-in name', async () => {
    const ctx = makeContext({}, '/tmp');
    await expect(runNew(ctx, { name: 'node', extend: 'ubuntu-base' })).rejects.toThrow();
  });
});
