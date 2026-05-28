import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeContext } from '../../src/cli/context.js';
import { renderTemplate } from '../../src/cli/render.js';

const FAKE_INSTALLED = '/nonexistent';

describe('e2e: render node template', () => {
  it('writes a valid devcontainer.json into a fresh dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-e2e-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    const r = await renderTemplate(ctx, {
      templateName: 'node',
      features: [],
      trust: true,
      yes: true,
    });
    expect(r.written).toBe(true);
    const dc = await readFile(join(dir, '.devcontainer/devcontainer.json'), 'utf8');
    const json = JSON.parse(dc.replace(/^\/\/.+\n/, ''));
    expect(json.image).toContain('javascript-node');
    expect(json.features).toBeDefined();
  });

  it('overlay --feature dod adds docker socket mount', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-e2e-'));
    const ctx = makeContext({ trust: true, yes: true, feature: ['dod'] }, dir);
    await renderTemplate(ctx, {
      templateName: 'node',
      features: ['dod'],
      trust: true,
      yes: true,
    });
    const dc = await readFile(join(dir, '.devcontainer/devcontainer.json'), 'utf8');
    expect(dc).toContain('/var/run/docker.sock');
  });

  it('renders claude-corp template', async () => {
    void FAKE_INSTALLED;
    const dir = await mkdtemp(join(tmpdir(), 'buckle-e2e-'));
    const ctx = makeContext({ trust: true, yes: true }, dir);
    await renderTemplate(ctx, {
      templateName: 'claude-corp',
      features: [],
      trust: true,
      yes: true,
    });
    const dc = await readFile(join(dir, '.devcontainer/devcontainer.json'), 'utf8');
    // claude-code feature now uses the official installer script (not the old npm package)
    expect(dc).toContain('https://claude.ai/install.sh');
  });
});
