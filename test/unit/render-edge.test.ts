import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeContext } from '../../src/cli/context.js';
import { renderTemplate } from '../../src/cli/render.js';
import * as paths from '../../src/util/paths.js';

let trustRoot: string;

beforeEach(async () => {
  // Force the trust store to a private temp dir so we don't read the user's pre-existing entries.
  trustRoot = await mkdtemp(join(tmpdir(), 'buckle-trust-'));
  vi.spyOn(paths, 'bucklePaths').mockReturnValue({
    configRoot: trustRoot,
    templatesRoot: trustRoot,
    installedRoot: join(trustRoot, '_installed'),
    trustStore: join(trustRoot, 'trust.json'),
    configFile: join(trustRoot, 'config.yaml'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderTemplate edge cases', () => {
  it('errors on unknown template', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    await expect(
      renderTemplate(ctx, { templateName: 'no-such-template', features: [], trust: true, yes: true }),
    ).rejects.toThrow();
  });

  it('reports unchanged when re-rendering same template', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    const r1 = await renderTemplate(ctx, { templateName: 'ubuntu-base', features: [], trust: true, yes: true });
    expect(r1.written).toBe(true);
    const r2 = await renderTemplate(ctx, { templateName: 'ubuntu-base', features: [], trust: true, yes: true });
    expect(r2.written).toBe(false);
  });

  it('throws E_HASH_MISMATCH in non-interactive mode when not trusted (custom template)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));

    // Create a minimal custom user template with a lifecycle hook.
    const customName = 'non-interactive-untrusted';
    const customDir = join(trustRoot, customName);
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, 'template.yaml'), `
name: Non-Interactive Untrusted Test
version: 0.0.1
extends: ubuntu-base
lifecycle:
  postCreate:
    - echo "this requires trust in json mode"
`, 'utf8');

    const ctx = makeContext({ json: true, yes: true }, dir);
    await expect(
      renderTemplate(ctx, { templateName: customName, features: [], yes: true }),
    ).rejects.toThrow(/lifecycle|unverified/);
  });

  it('respects an existing devcontainer.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    await mkdir(join(dir, '.devcontainer'), { recursive: true });
    await writeFile(join(dir, '.devcontainer/devcontainer.json'), 'invalid');
    const ctx = makeContext({ trust: true, yes: true }, dir);
    const r = await renderTemplate(ctx, { templateName: 'ubuntu-base', features: [], trust: true, yes: true });
    expect(r.written).toBe(true);
  });
});
