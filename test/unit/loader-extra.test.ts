import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { _existsForTest, loadCatalog } from '../../src/templates/loader.js';

describe('loader extra paths', () => {
  it('reads installed templates layout (origin-hash/template-name)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buckle-installed-'));
    const dir = join(root, 'somehash', 'mytpl');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'template.yaml'), 'image: foo:1\n');
    const cat = await loadCatalog({
      templatesRoot: '/nope',
      installedRoot: root,
      builtinDir: '/nope',
    });
    expect(cat.find((c) => c.name === 'mytpl')?.origin).toBe('installed');
  });

  it('skips entries starting with underscore', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buckle-installed-'));
    await mkdir(join(root, '_tmp', 'inner'), { recursive: true });
    await writeFile(join(root, '_tmp', 'inner', 'template.yaml'), 'image: foo:1\n');
    const cat = await loadCatalog({
      templatesRoot: root,
      installedRoot: '/nope',
      builtinDir: '/nope',
    });
    expect(cat.find((c) => c.name === '_tmp')).toBeUndefined();
  });

  it('_existsForTest reports a real path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buckle-installed-'));
    expect(await _existsForTest(root)).toBe(true);
    expect(await _existsForTest('/nope/' + Math.random())).toBe(false);
  });
});
