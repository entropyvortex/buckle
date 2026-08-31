import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDevcontainer } from '../../src/generators/devcontainer.js';
import {
  isolateHomeMounts,
  isolatedMountSource,
  workspaceStateId,
} from '../../src/templates/isolate.js';
import type { Template } from '../../src/templates/schema.js';

describe('isolateHomeMounts', () => {
  const prev = process.env['BUCKLE_STATE_DIR'];

  afterEach(() => {
    if (prev === undefined) delete process.env['BUCKLE_STATE_DIR'];
    else process.env['BUCKLE_STATE_DIR'] = prev;
  });

  it('remaps claude and grok onto per-workspace paths and keeps gitconfig', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'buckle-iso-'));
    process.env['BUCKLE_STATE_DIR'] = await mkdtemp(join(tmpdir(), 'buckle-state-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      mounts: [
        { source: '${localEnv:HOME}/.claude', target: '/home/vscode/.claude', type: 'bind' },
        { source: '${localEnv:HOME}/.grok', target: '/home/vscode/.grok', type: 'bind' },
        { source: '${localEnv:HOME}/.gitconfig', target: '/home/vscode/.gitconfig', type: 'bind', readOnly: true },
      ],
    };
    const out = isolateHomeMounts(t, cwd);
    expect(out.mounts?.find((m) => m.target === '/home/vscode/.claude')?.source).toBe(
      isolatedMountSource(cwd, 'claude'),
    );
    expect(out.mounts?.find((m) => m.target === '/home/vscode/.grok')?.source).toBe(
      isolatedMountSource(cwd, 'grok'),
    );
    expect(out.mounts?.find((m) => m.target === '/home/vscode/.gitconfig')?.source).toBe(
      '${localEnv:HOME}/.gitconfig',
    );
  });

  it('workspace ids differ for two directories with the same basename', async () => {
    const a = await mkdtemp(join(tmpdir(), 'app-'));
    const b = await mkdtemp(join(tmpdir(), 'app-'));
    expect(workspaceStateId(a)).not.toBe(workspaceStateId(b));
  });
});

describe('buildDevcontainer isolate default', () => {
  it('remaps grok mounts by default', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'buckle-iso-dc-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: ['grok'],
    };
    const isolated = buildDevcontainer(t, 'proj', { cwd });
    expect(isolated.metadata?.['buckle.isolate']).toBe(true);
    expect(isolated.mounts?.some((m) => m.includes(isolatedMountSource(cwd, 'grok')))).toBe(true);
    expect(isolated.mounts?.some((m) => m.includes('${localEnv:HOME}/.grok'))).toBe(false);

    const shared = buildDevcontainer(t, 'proj', { isolate: false, cwd });
    expect(shared.metadata?.['buckle.isolate']).toBe(false);
    expect(shared.mounts?.some((m) => m.includes('${localEnv:HOME}/.grok'))).toBe(true);
  });
});
