import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findTemplate, listCatalog, loadCatalog, templateExists, validateFile } from '../../src/templates/loader.js';
import { BuckleError } from '../../src/util/errors.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'templates');
const FAKE_INSTALLED = '/nonexistent/installed/path';

describe('loader', () => {
  it('discovers built-in templates', async () => {
    const cat = await loadCatalog({ templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED });
    const names = cat.map((c) => c.name);
    for (const expected of ['ubuntu-base', 'node', 'python', 'go', 'rust', 'bun', 'deno', 'polyglot', 'claude-corp']) {
      expect(names).toContain(expected);
    }
    for (const c of cat) expect(c.origin).toBe('builtin');
  });

  it('discovers user templates via templatesRoot', async () => {
    const cat = await loadCatalog({ templatesRoot: FIXTURES, installedRoot: FAKE_INSTALLED });
    const names = cat.map((c) => c.name);
    expect(names).toContain('parent');
    expect(names).toContain('child');
  });

  it('user templates win over builtins on name collision', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'buckle-loader-'));
    await mkdir(join(tmp, 'node'), { recursive: true });
    await writeFile(join(tmp, 'node', 'template.yaml'), 'name: shadowed\nimage: shadow:1\n');
    const cat = await loadCatalog({ templatesRoot: tmp, installedRoot: FAKE_INSTALLED });
    const node = cat.find((c) => c.name === 'node');
    expect(node?.origin).toBe('user');
  });

  it('templateExists is true for builtins', async () => {
    expect(await templateExists('node', { templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED })).toBe(true);
    expect(await templateExists('does-not-exist', { templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED })).toBe(false);
  });

  it('findTemplate throws BuckleError when missing', async () => {
    await expect(
      findTemplate('totally-fake', { templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED }),
    ).rejects.toBeInstanceOf(BuckleError);
  });

  it('listCatalog returns the metadata view', async () => {
    const items = await listCatalog({ templatesRoot: FAKE_INSTALLED, installedRoot: FAKE_INSTALLED });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(typeof it.name).toBe('string');
      expect(['builtin', 'user', 'installed']).toContain(it.origin);
    }
  });

  it('validateFile errors when the file is missing', async () => {
    await expect(validateFile('/no/such/template.yaml')).rejects.toBeInstanceOf(BuckleError);
  });

  it('rejects invalid YAML on load', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'buckle-loader-bad-'));
    await mkdir(join(tmp, 'broken'), { recursive: true });
    await writeFile(join(tmp, 'broken', 'template.yaml'), 'image: [not\nclosed');
    await expect(
      loadCatalog({ templatesRoot: tmp, installedRoot: FAKE_INSTALLED, builtinDir: '/nope' }),
    ).rejects.toBeInstanceOf(BuckleError);
  });

  it('rejects schema-invalid templates', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'buckle-loader-bad2-'));
    await mkdir(join(tmp, 'badschema'), { recursive: true });
    await writeFile(join(tmp, 'badschema', 'template.yaml'), 'unknownKey: 5\n');
    await expect(
      loadCatalog({ templatesRoot: tmp, installedRoot: FAKE_INSTALLED, builtinDir: '/nope' }),
    ).rejects.toBeInstanceOf(BuckleError);
  });
});
