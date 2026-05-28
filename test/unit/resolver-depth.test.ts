import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolve } from '../../src/templates/resolver.js';

describe('resolver — deep chain', () => {
  it('errors when extends chain exceeds max depth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buckle-deep-'));
    // Build a chain of 12 templates: t0 ← t1 ← t2 ← ... ← t11.
    for (let i = 0; i < 12; i++) {
      await mkdir(join(root, `t${i}`), { recursive: true });
      const body = i === 0 ? `image: deep:${i}\n` : `extends: t${i - 1}\nimage: deep:${i}\n`;
      await writeFile(join(root, `t${i}`, 'template.yaml'), body);
    }
    await expect(
      resolve('t11', { templatesRoot: root, installedRoot: '/nope', builtinDir: '/nope' }),
    ).rejects.toThrow();
  });
});
