import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatch } from '../../src/cli/parse.js';
import * as paths from '../../src/util/paths.js';

beforeEach(async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'buckle-parse-'));
  vi.spyOn(paths, 'bucklePaths').mockReturnValue({
    configRoot: tmp,
    templatesRoot: tmp,
    installedRoot: join(tmp, '_installed'),
    trustStore: join(tmp, 'trust.json'),
    configFile: join(tmp, 'config.yaml'),
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dispatch — template rewrite path', () => {
  it('rewrites `buckle ubuntu-base` to render', async () => {
    const r = await dispatch(['node', 'buckle', 'ubuntu-base', '--trust', '--yes', '--json']);
    expect(r.tui).toBe(false);
  });

  it('exits via subcommand `doctor` (json)', async () => {
    const r = await dispatch(['node', 'buckle', 'doctor', '--json']);
    expect(r.tui).toBe(false);
  });

  it('handles `--version`', async () => {
    // commander's --version exits the process by default; we run it via dispatch and expect
    // it to not throw and to mark non-tui.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      // swallow
      return undefined as never;
    }) as never);
    const r = await dispatch(['node', 'buckle', '--version']);
    expect(r.tui).toBe(false);
    exitSpy.mockRestore();
  });
});
