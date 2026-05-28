import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectProject } from '../../src/templates/autodetect.js';

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'buckle-detect-'));
  for (const [path, contents] of Object.entries(files)) {
    const abs = join(root, path);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, contents);
  }
  return root;
}

describe('detectProject', () => {
  it('falls back to ubuntu-base in an empty directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-empty-'));
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('ubuntu-base');
  });

  it('detects node from package-lock.json', async () => {
    const dir = await fixture({
      'package.json': '{}',
      'package-lock.json': '{}',
    });
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('node');
  });

  it('detects python from poetry.lock', async () => {
    const dir = await fixture({ 'pyproject.toml': '', 'poetry.lock': '' });
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('python');
  });

  it('detects go from go.mod', async () => {
    const dir = await fixture({ 'go.mod': 'module x' });
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('go');
  });

  it('detects rust from Cargo.toml + Cargo.lock', async () => {
    const dir = await fixture({ 'Cargo.toml': '', 'Cargo.lock': '' });
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('rust');
  });

  it('returns polyglot when two languages tie ≥3', async () => {
    const dir = await fixture({
      'package.json': '{}',
      'package-lock.json': '{}',
      'pyproject.toml': '',
      'poetry.lock': '',
    });
    const r = await detectProject(dir);
    expect(r.polyglot).toBe(true);
    expect(r.suggestions[0]).toBe('polyglot');
  });

  it('uses Dockerfile FROM as a tiebreaker', async () => {
    const dir = await fixture({
      Dockerfile: 'FROM python:3.12',
    });
    const r = await detectProject(dir);
    expect(r.suggestions[0]).toBe('python');
  });
});
