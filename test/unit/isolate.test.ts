import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDevcontainer } from '../../src/generators/devcontainer.js';
import {
  HOST_AI_SOURCE,
  isolateHomeMounts,
  isolatedMountSource,
  resolveAiHomeMounts,
  stripHomeMounts,
  WORKSPACE_AI_SOURCE,
  workspaceStateId,
  workspaceStateRoot,
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

  it('returns the template unchanged when there are no mounts', () => {
    const t: Template = { version: '0.1.0', image: 'foo:1' };
    expect(isolateHomeMounts(t, '/tmp/x')).toBe(t);
    expect(stripHomeMounts(t)).toBe(t);
  });

  it('stripHomeMounts drops AI and gitconfig binds and leaves others', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      mounts: [
        { source: '${localEnv:HOME}/.claude', target: '/home/vscode/.claude', type: 'bind' },
        { source: '${localEnv:HOME}/.gitconfig', target: '/home/vscode/.gitconfig', type: 'bind' },
        { source: '/var/run/docker.sock', target: '/var/run/docker.sock', type: 'bind' },
      ],
    };
    const out = stripHomeMounts(t);
    expect(out.mounts).toEqual([
      { source: '/var/run/docker.sock', target: '/var/run/docker.sock', type: 'bind' },
    ]);
  });

  it('stripHomeMounts is a no-op when nothing matches', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      mounts: [{ source: '/a', target: '/b', type: 'bind' }],
    };
    expect(stripHomeMounts(t)).toBe(t);
  });

  it('workspaceStateRoot falls back to XDG data home', () => {
    const prev = process.env['BUCKLE_STATE_DIR'];
    delete process.env['BUCKLE_STATE_DIR'];
    try {
      expect(workspaceStateRoot().replace(/\\/g, '/')).toMatch(/buckle\/workspaces$/);
    } finally {
      if (prev === undefined) delete process.env['BUCKLE_STATE_DIR'];
      else process.env['BUCKLE_STATE_DIR'] = prev;
    }
  });

  it('resolves buckle:workspace sentinels onto per-workspace paths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'buckle-iso-sent-'));
    process.env['BUCKLE_STATE_DIR'] = await mkdtemp(join(tmpdir(), 'buckle-state-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      mounts: [
        { source: WORKSPACE_AI_SOURCE.claude, target: '/home/vscode/.claude', type: 'bind' },
        { source: WORKSPACE_AI_SOURCE.grok, target: '/home/vscode/.grok', type: 'bind' },
      ],
    };
    const isolated = resolveAiHomeMounts(t, cwd, true);
    expect(isolated.mounts?.map((m) => m.source)).toEqual([
      isolatedMountSource(cwd, 'claude'),
      isolatedMountSource(cwd, 'grok'),
    ]);
    const shared = resolveAiHomeMounts(t, cwd, false);
    expect(shared.mounts?.map((m) => m.source)).toEqual([HOST_AI_SOURCE.claude, HOST_AI_SOURCE.grok]);
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

  it('persists gh config per workspace by default', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'buckle-iso-dc-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: ['gh'],
    };
    const isolated = buildDevcontainer(t, 'proj', { cwd });
    expect(
      isolated.mounts?.some(
        (m) => m.includes(isolatedMountSource(cwd, 'gh')) && m.includes('target=/home/vscode/.config/gh'),
      ),
    ).toBe(true);

    const shared = buildDevcontainer(t, 'proj', { isolate: false, cwd });
    expect(shared.mounts?.some((m) => m.includes(HOST_AI_SOURCE.gh))).toBe(true);
  });

  it('never leaves buckle:workspace sentinels in generated json', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'buckle-iso-dc-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      mounts: [
        { source: WORKSPACE_AI_SOURCE.claude, target: '/home/vscode/.claude', type: 'bind' },
        { source: WORKSPACE_AI_SOURCE.grok, target: '/home/vscode/.grok', type: 'bind' },
      ],
    };
    const isolated = buildDevcontainer(t, 'proj', { cwd });
    expect(isolated.mounts?.join('\n')).not.toMatch(/buckle:workspace/);
    expect(isolated.mounts?.join('\n')).not.toMatch(/\$\{localEnv:HOME\}\/\.claude/);
    expect(isolated.mounts?.join('\n')).not.toMatch(/\$\{localEnv:HOME\}\/\.grok/);
  });
});

describe('builtin templates and features never bind host AI homes', () => {
  it('builtin yaml mount sources do not bind host ~/.claude or ~/.grok', () => {
    const builtin = join(dirname(fileURLToPath(import.meta.url)), '../../src/templates/builtin');
    const leak = /\$\{(?:localEnv:)?HOME\}\/\.(claude|grok)|~\/\.(claude|grok)/;
    for (const name of readdirSync(builtin)) {
      const yaml = join(builtin, name, 'template.yaml');
      const text = readFileSync(yaml, 'utf8');
      for (const line of text.split('\n')) {
        if (!/^\s+source:/.test(line)) continue;
        expect(line, `${name} mount binds host AI home: ${line.trim()}`).not.toMatch(leak);
      }
    }
  });
});
