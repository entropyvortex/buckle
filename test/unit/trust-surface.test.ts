import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatTrustSurface, trustPreflight } from '../../src/cli/render.js';
import type { Template } from '../../src/templates/schema.js';
import * as paths from '../../src/util/paths.js';

describe('formatTrustSurface', () => {
  it('summarizes lifecycle, mounts, runArgs, and features', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      lifecycle: { postCreate: ['echo hi', { command: 'true', user: 'vscode' }] },
      mounts: [{ source: '/a', target: '/b', type: 'bind' }],
      runArgs: ['--init'],
      features: ['gh', ['node', '20']],
    };
    const lines = formatTrustSurface(t);
    expect(lines.some((l) => l.startsWith('postCreate:'))).toBe(true);
    expect(lines.some((l) => l.includes('/a → /b'))).toBe(true);
    expect(lines.some((l) => l.startsWith('runArgs:'))).toBe(true);
    expect(lines.some((l) => l.includes('gh'))).toBe(true);
  });

  it('reports an empty surface', () => {
    expect(formatTrustSurface({ version: '0.1.0', image: 'foo:1' })).toEqual([
      '(no lifecycle, mounts, runArgs, or features)',
    ]);
  });
});

describe('trustPreflight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats pure builtin templates as pre-trusted', async () => {
    const pre = await trustPreflight('ubuntu-base', []);
    expect(pre.trusted).toBe(true);
    expect(pre.surface).toEqual([]);
  });

  it('flags an unrecorded user template and returns its surface', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'buckle-pre-'));
    const tplDir = join(tmp, 'templates', 'custom');
    await mkdir(tplDir, { recursive: true });
    await writeFile(
      join(tplDir, 'template.yaml'),
      'version: 0.1.0\nimage: foo:1\nlifecycle:\n  postCreate:\n    - echo hi\n',
    );
    vi.spyOn(paths, 'bucklePaths').mockReturnValue({
      configRoot: tmp,
      templatesRoot: join(tmp, 'templates'),
      installedRoot: join(tmp, 'templates', '_installed'),
      trustStore: join(tmp, 'trust.json'),
      configFile: join(tmp, 'config.yaml'),
    });
    const pre = await trustPreflight('custom', []);
    expect(pre.trusted).toBe(false);
    expect(pre.changed).toBe(false);
    expect(pre.surface.some((l) => l.includes('echo hi'))).toBe(true);
  });
});
