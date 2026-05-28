import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { install, parseOrigin, uninstall } from '../../src/cli/install.js';
import { makeLogger } from '../../src/util/log.js';
import * as paths from '../../src/util/paths.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'buckle-install-test-'));
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

describe('install via file://', () => {
  it('copies a template directory and reports installedPath', async () => {
    const src = await mkdtemp(join(tmpdir(), 'buckle-install-src-'));
    await mkdir(join(src, 'mytpl'), { recursive: true });
    await writeFile(join(src, 'mytpl', 'template.yaml'), 'name: mytpl\nimage: foo:1\n');
    const r = await install(`file://${src}/mytpl`, { logger: makeLogger({ silent: true }) });
    expect(r.templateName).toBe('mytpl');
    expect(r.installedPath).toContain(parseOrigin(`file://${src}/mytpl`).hashKey);
  });

  it('errors when no template.yaml is present', async () => {
    const src = await mkdtemp(join(tmpdir(), 'buckle-install-src-'));
    await expect(install(`file://${src}`, { logger: makeLogger({ silent: true }) })).rejects.toThrow();
  });
});

describe('uninstall', () => {
  it('removes an installed template', async () => {
    const installedRoot = join(tmpRoot, '_installed');
    await mkdir(join(installedRoot, 'somehash', 'mytpl'), { recursive: true });
    await writeFile(join(installedRoot, 'somehash', 'mytpl', 'template.yaml'), 'name: mytpl\nimage: foo:1\n');
    await uninstall('mytpl', { logger: makeLogger({ silent: true }) });
  });

  it('errors when name is not installed', async () => {
    const installedRoot = join(tmpRoot, '_installed');
    await mkdir(installedRoot, { recursive: true });
    await expect(uninstall('not-there', { logger: makeLogger({ silent: true }) })).rejects.toThrow();
  });
});
