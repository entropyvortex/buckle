import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, parseConfig } from '../../src/util/config.js';
import * as paths from '../../src/util/paths.js';

describe('parseConfig', () => {
  it('reads known keys', () => {
    const c = parseConfig('editor: code\ndefaultTemplate: node\nisolate: false\n');
    expect(c.editor).toBe('code');
    expect(c.defaultTemplate).toBe('node');
    expect(c.isolate).toBe(false);
  });

  it('returns empty on garbage', () => {
    expect(parseConfig(':::')).toEqual({});
    expect(parseConfig('[]')).toEqual({});
  });
});

describe('loadConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'buckle-cfg-'));
    vi.spyOn(paths, 'bucklePaths').mockReturnValue({
      configRoot: tmp,
      templatesRoot: tmp,
      installedRoot: join(tmp, '_installed'),
      trustStore: join(tmp, 'trust.json'),
      configFile: join(tmp, 'config.yaml'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty when missing', async () => {
    expect(await loadConfig()).toEqual({});
  });

  it('loads a written file', async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, 'config.yaml'), 'isolate: false\neditor: hx\n');
    const c = await loadConfig();
    expect(c.isolate).toBe(false);
    expect(c.editor).toBe('hx');
  });
});
