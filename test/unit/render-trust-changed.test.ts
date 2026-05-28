import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeContext } from '../../src/cli/context.js';
import { renderTemplate } from '../../src/cli/render.js';
import { recordTrust } from '../../src/templates/trust.js';
import * as paths from '../../src/util/paths.js';

let trustRoot: string;

beforeEach(async () => {
  trustRoot = await mkdtemp(join(tmpdir(), 'buckle-trust-changed-'));
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

describe('renderTemplate trust paths', () => {
  it('errors with "changed" wording when surface differs (for custom templates)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    // Create a minimal custom user template with lifecycle hooks so it goes through the trust gate.
    const customName = 'my-trust-test';
    const customDir = join(trustRoot, customName); // user templates live under the mocked templatesRoot
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, 'template.yaml'), `
name: My Trust Test
version: 0.0.1
extends: ubuntu-base
lifecycle:
  postCreate:
    - echo "custom hook for trust test"
`, 'utf8');

    // Pre-record a trust entry with a wrong surface hash to trigger the "changed" branch.
    const ctx1 = makeContext({ trust: true, yes: true }, dir);
    const r1 = await renderTemplate(ctx1, { templateName: customName, features: [], trust: true, yes: true });
    expect(r1.written).toBe(true);

    // Tamper trust: re-record with a fake hookHash so subsequent run sees "changed".
    await recordTrust(r1.hash, 'fake-surface-hash');

    const ctx2 = makeContext({ json: true, yes: true }, dir);
    await expect(
      renderTemplate(ctx2, { templateName: customName, features: [], yes: true }),
    ).rejects.toThrow(/changed/);
  });

  it('--trust skips the check entirely', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    const r = await renderTemplate(ctx, { templateName: 'node', features: [], trust: true, yes: true });
    expect(r.trusted).toBe(true);
  });

  it('pure built-in templates no longer require --trust (auto-trusted)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-r-'));
    const ctx = makeContext({ yes: true }, dir); // deliberately no trust flag
    const r = await renderTemplate(ctx, { templateName: 'ai-native', features: [], yes: true });
    expect(r.trusted).toBe(true);
    expect(r.written).toBe(true);
  });
});
