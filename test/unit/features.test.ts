import { describe, expect, it } from 'vitest';

import { compileFeature, isKnownFeature, listFeatures, parseFeatureSpec } from '../../src/features/catalog.js';
import { applyFeatures } from '../../src/features/compile.js';
import type { Template } from '../../src/templates/schema.js';

describe('parseFeatureSpec', () => {
  it('parses bare name', () => {
    expect(parseFeatureSpec('node')).toEqual({ name: 'node', raw: 'node' });
  });

  it('parses name:arg', () => {
    expect(parseFeatureSpec('node:20')).toEqual({ name: 'node', arg: '20', raw: 'node:20' });
  });

  it('parses name=arg', () => {
    expect(parseFeatureSpec('node=20')).toEqual({ name: 'node', arg: '20', raw: 'node=20' });
  });

  it('parses mcp:filesystem as a single name', () => {
    expect(parseFeatureSpec('mcp:filesystem')).toEqual({ name: 'mcp:filesystem', raw: 'mcp:filesystem' });
  });

  it('parses mcp:foo:1.2 → name=mcp:foo, arg=1.2', () => {
    expect(parseFeatureSpec('mcp:foo:1.2')).toEqual({ name: 'mcp:foo', arg: '1.2', raw: 'mcp:foo:1.2' });
  });

  it('passes through ghcr.io/ as a single name', () => {
    const r = parseFeatureSpec('ghcr.io/devcontainers/features/python:1');
    expect(r.name).toBe('ghcr.io/devcontainers/features/python:1');
  });

  it('throws on empty input', () => {
    expect(() => parseFeatureSpec('')).toThrow();
  });
});

describe('isKnownFeature', () => {
  it('accepts catalog names with and without args', () => {
    expect(isKnownFeature('dod')).toBe(true);
    expect(isKnownFeature('node:20')).toBe(true);
  });

  it('accepts mcp:* and ghcr.io/*', () => {
    expect(isKnownFeature('mcp:filesystem')).toBe(true);
    expect(isKnownFeature('ghcr.io/devcontainers/features/git:1')).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isKnownFeature('totally-fake-thing')).toBe(false);
  });
});

describe('compileFeature', () => {
  it('emits docker-outside-of-docker for dod', () => {
    const p = compileFeature(parseFeatureSpec('dod'));
    expect(p.nativeFeatures).toMatchObject({
      'ghcr.io/devcontainers/features/docker-outside-of-docker:1': { moby: true },
    });
    expect(p.mounts?.[0]?.source).toBe('/var/run/docker.sock');
  });

  it('emits node feature with version arg', () => {
    const p = compileFeature(parseFeatureSpec('node:20'));
    expect(p.nativeFeatures).toMatchObject({
      'ghcr.io/devcontainers/features/node:1': { version: '20' },
    });
  });

  it('mcp:* registers an install command', () => {
    const p = compileFeature(parseFeatureSpec('mcp:filesystem'));
    expect(p.lifecycle?.postCreate?.[0]).toContain('@modelcontextprotocol/server-filesystem');
  });

  it('passes ghcr.io/ through as a native feature', () => {
    const p = compileFeature(parseFeatureSpec('ghcr.io/x/y:1'));
    expect(p.nativeFeatures).toEqual({ 'ghcr.io/x/y:1': {} });
  });

  it('listFeatures returns the documented catalog', () => {
    const list = listFeatures();
    expect(list.some((f) => f.name === 'dod')).toBe(true);
    expect(list.some((f) => f.name.startsWith('mcp'))).toBe(true);
  });
});

describe('applyFeatures', () => {
  it('compiles convenience features into the template', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: ['dod', 'gh', 'node:20'],
    };
    const out = applyFeatures(t);
    expect(out.features).toEqual([]);
    expect(out.nativeFeatures).toMatchObject({
      'ghcr.io/devcontainers/features/docker-outside-of-docker:1': { moby: true },
      'ghcr.io/devcontainers/features/github-cli:1': {},
      'ghcr.io/devcontainers/features/node:1': { version: '20' },
    });
  });

  it('handles two-element [name, arg] tuples in features', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: [['python', '3.11']],
    };
    const out = applyFeatures(t);
    expect(out.nativeFeatures).toMatchObject({
      'ghcr.io/devcontainers/features/python:1': { version: '3.11' },
    });
  });

  it('throws on unknown feature', () => {
    const t: Template = { version: '0.1.0', image: 'foo:1', features: ['definitely-not-real'] };
    expect(() => applyFeatures(t)).toThrow();
  });

  it('returns input unchanged when no features', () => {
    const t: Template = { version: '0.1.0', image: 'foo:1' };
    expect(applyFeatures(t)).toBe(t);
  });

  it('grok feature installs via official script and mounts ~/.grok', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: ['grok'],
    };
    const out = applyFeatures(t);

    expect(out.lifecycle?.postCreate?.[0]).toContain('curl -fsSL https://x.ai/cli/install.sh | bash');
    expect(out.lifecycle?.postCreate?.[0]).toContain('curl -fsSL https://x.ai/cli/install.sh | bash');
    expect(out.mounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '${localEnv:HOME}/.grok',
          target: '/home/vscode/.grok',
        }),
      ])
    );
  });

  it('grok feature supports version pinning', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      features: ['grok:0.2.3'],
    };
    const out = applyFeatures(t);

    expect(out.lifecycle?.postCreate?.[0]).toContain('bash -s 0.2.3');
  });
});
