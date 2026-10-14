import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatch } from '../../src/cli/parse.js';
import * as paths from '../../src/util/paths.js';

/**
 * End-to-end CLI resolution of the isolate setting:
 * flag (--isolate / --no-isolate / --share-home) → config.yaml `isolate` → default on.
 * Guards the regression where readGlobals always forwarded a concrete boolean,
 * making `isolate: false` in config.yaml dead on every CLI path.
 */

let tmp: string;
let stdoutChunks: string[];

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'buckle-isocfg-'));
  vi.spyOn(paths, 'bucklePaths').mockReturnValue({
    configRoot: tmp,
    templatesRoot: tmp,
    installedRoot: join(tmp, '_installed'),
    trustStore: join(tmp, 'trust.json'),
    configFile: join(tmp, 'config.yaml'),
  });
  stdoutChunks = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((s: string | Uint8Array) => {
    stdoutChunks.push(typeof s === 'string' ? s : String(s));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function isolateCheckMessage(): string {
  const payload = stdoutChunks.join('');
  const parsed = JSON.parse(payload.slice(payload.indexOf('{'))) as {
    data: { checks: { name: string; message: string }[] };
  };
  const check = parsed.data.checks.find((c) => c.name === 'ai.isolate');
  expect(check).toBeDefined();
  return check!.message;
}

describe('isolate resolution across CLI → config', () => {
  it('defaults to per-workspace isolation', async () => {
    await dispatch(['node', 'buckle', 'doctor', '--json']);
    expect(isolateCheckMessage()).toMatch(/per-workspace agent state/);
  });

  it('honors `isolate: false` from config.yaml', async () => {
    await writeFile(join(tmp, 'config.yaml'), 'isolate: false\n');
    await dispatch(['node', 'buckle', 'doctor', '--json']);
    expect(isolateCheckMessage()).toMatch(/sharing host/);
  });

  it('--isolate overrides `isolate: false` from config.yaml', async () => {
    await writeFile(join(tmp, 'config.yaml'), 'isolate: false\n');
    await dispatch(['node', 'buckle', 'doctor', '--json', '--isolate']);
    expect(isolateCheckMessage()).toMatch(/per-workspace agent state/);
  });

  it('--share-home overrides the default', async () => {
    await dispatch(['node', 'buckle', 'doctor', '--json', '--share-home']);
    expect(isolateCheckMessage()).toMatch(/sharing host/);
  });

  it('--no-isolate behaves like --share-home', async () => {
    await dispatch(['node', 'buckle', 'doctor', '--json', '--no-isolate']);
    expect(isolateCheckMessage()).toMatch(/sharing host/);
  });
});
