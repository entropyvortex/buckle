import { describe, expect, it } from 'vitest';

import { compileFeature, parseFeatureSpec } from '../../src/features/catalog.js';

describe('every catalog feature compiles', () => {
  const catalogNames = [
    'dod',
    'dind',
    'gh',
    'git-config',
    'aws',
    'gcloud',
    'kube',
    'terraform',
    'node',
    'python',
    'rust',
    'go',
    'java',
    'claude-code',
    'grok',
    'grok-build',
  ];

  for (const name of catalogNames) {
    it(`compiles "${name}" without error`, () => {
      const spec = parseFeatureSpec(name);
      const patch = compileFeature(spec);
      expect(patch).toBeDefined();
    });
  }

  it('compiles versioned variants', () => {
    expect(compileFeature(parseFeatureSpec('node:20'))).toBeDefined();
    expect(compileFeature(parseFeatureSpec('python:3.11'))).toBeDefined();
    expect(compileFeature(parseFeatureSpec('rust:1.75'))).toBeDefined();
    expect(compileFeature(parseFeatureSpec('go:1.22'))).toBeDefined();
    expect(compileFeature(parseFeatureSpec('java:21'))).toBeDefined();
  });

  it('throws on unknown name in compileFeature', () => {
    expect(() => compileFeature({ name: 'absolutely-not-real', raw: 'absolutely-not-real' })).toThrow();
  });
});
