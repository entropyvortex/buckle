import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { deepMerge, resolve, REPLACE_SENTINEL, templateHash } from '../../src/templates/resolver.js';
import { BuckleError } from '../../src/util/errors.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'templates');

const BUILTINS_OFF = '/nonexistent/builtins-off';
const FAKE_INSTALLED = '/nonexistent/installed';

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const r = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } });
    expect(r).toEqual({ a: { x: 1, y: 3, z: 4 } });
  });

  it('appends arrays by default', () => {
    expect(deepMerge([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('!replace sentinel replaces the array', () => {
    expect(deepMerge([1, 2, 3], [REPLACE_SENTINEL, 9])).toEqual([9]);
  });

  it('returns next when scalar overrides', () => {
    expect(deepMerge('a', 'b')).toBe('b');
    expect(deepMerge(1, 'b')).toBe('b');
  });
});

describe('resolve', () => {
  it('resolves a single non-extending template', async () => {
    const r = await resolve('parent', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    expect(r.merged.image).toBe('parent-image:1');
    expect(r.chain).toEqual(['parent']);
  });

  it('resolves child + parent inheritance', async () => {
    const r = await resolve('child', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    expect(r.chain).toEqual(['parent', 'child']);
    // child's `image` overrides parent's
    expect(r.merged.image).toBe('child-image:1');
    // env merged
    expect(r.merged.env).toEqual({ PARENT_VAR: 'parent', CHILD_VAR: 'child' });
    // features appended
    expect(r.merged.features).toEqual(['gh', 'gh', 'dod']);
    // postCreate appended
    expect(r.merged.lifecycle?.postCreate).toEqual(['echo parent', 'echo child']);
    // customizations.vscode.extensions appended (deep)
    const ext = (r.merged.customizations as { vscode: { extensions: string[] } }).vscode.extensions;
    expect(ext).toEqual(['parent.ext', 'child.ext']);
  });

  it('!replace overrides parent hooks', async () => {
    const r = await resolve('replace-child', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    expect(r.merged.lifecycle?.postCreate).toEqual(['echo only-child']);
  });

  it('detects inheritance cycles', async () => {
    await expect(resolve('cycle-a', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED })).rejects.toBeInstanceOf(
      BuckleError,
    );
  });

  it('errors on multiple sources', async () => {
    await expect(
      resolve('multi-source', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED }),
    ).rejects.toBeInstanceOf(BuckleError);
  });

  it('handles diamond inheritance with array MRO', async () => {
    const r = await resolve('diamond', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    // diamond-base appears once; left + right both extend it; chain de-dupes by record path.
    expect(r.chain[0]).toBe('diamond-base');
    expect(r.chain.includes('diamond-left')).toBe(true);
    expect(r.chain.includes('diamond-right')).toBe(true);
    expect(r.merged.env).toEqual({ L: '1', R: '1', D: '1' });
  });

  it('templateHash is deterministic', async () => {
    const a = await resolve('parent', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    const b = await resolve('parent', { templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    expect(a.hash).toBe(b.hash);
    expect(templateHash(a.merged)).toBe(a.hash);
  });

  it('overlay applies last and may add features', async () => {
    const r = await resolve('parent', {
      templatesRoot: FIXTURES,
      installedRoot: FAKE_INSTALLED,
      overlay: { features: ['dod'] },
    });
    expect(r.merged.features).toEqual(['gh', 'dod']);
  });

  it('overlay errors if it introduces a source mutex violation', async () => {
    await expect(
      resolve('parent', {
        templatesRoot: FIXTURES,
        installedRoot: FAKE_INSTALLED,
        overlay: { build: { dockerfile: 'Dockerfile' } },
      }),
    ).rejects.toBeInstanceOf(BuckleError);
  });

  it('rejects an invalid overlay shape', async () => {
    await expect(
      resolve('parent', {
        templatesRoot: FIXTURES,
        installedRoot: FAKE_INSTALLED,
        overlay: { image: 5 as unknown as string },
      }),
    ).rejects.toBeInstanceOf(BuckleError);
  });
});

describe('resolver — builtin avoidance', () => {
  it('explodes loudly when builtinDir is wrong', async () => {
    await expect(
      resolve('node', { builtinDir: BUILTINS_OFF, templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED }),
    ).rejects.toBeInstanceOf(BuckleError);
  });
});
