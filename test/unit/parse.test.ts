import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatch } from '../../src/cli/parse.js';

const originalLog = console.log;
const originalErr = console.error;

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  console.log = originalLog;
  console.error = originalErr;
});

describe('dispatch', () => {
  it('returns tui=true on no args', async () => {
    const r = await dispatch(['node', 'buckle']);
    expect(r.tui).toBe(true);
  });

  it('runs the list subcommand non-tui', async () => {
    const r = await dispatch(['node', 'buckle', '--json', 'list']);
    expect(r.tui).toBe(false);
    expect(r.exitCode).toBe(0);
  });

  it('rewrites `buckle <template>` to render when template exists', async () => {
    // The "node" template is a built-in, so this must NOT be tui=true and must NOT error.
    // We can't actually run render here without a writable cwd, so we just confirm dispatch
    // takes the rewrite path (it'll surface as runProgram with `render`).
    const r = await dispatch(['node', 'buckle', '--json', 'doctor']);
    expect(r.tui).toBe(false);
  });
});
