import { describe, expect, it } from 'vitest';

import { renderDockerfile } from '../../src/generators/dockerfile.js';
import type { Template } from '../../src/templates/schema.js';

describe('renderDockerfile', () => {
  it('emits FROM and USER lines', () => {
    const t: Template = { version: '0.1.0', build: { dockerfile: 'Dockerfile' }, remoteUser: 'vscode' };
    const out = renderDockerfile(t, 'mcr.io/base:ubuntu');
    expect(out).toContain('FROM mcr.io/base:ubuntu');
    expect(out).toContain('USER vscode');
  });

  it('emits ARG lines for build.args', () => {
    const t: Template = {
      version: '0.1.0',
      build: { dockerfile: 'Dockerfile', args: { NODE_VERSION: '20' } },
    };
    const out = renderDockerfile(t, 'foo:1');
    expect(out).toContain('ARG NODE_VERSION=20');
  });

  it('comments the multi-stage target when present', () => {
    const t: Template = {
      version: '0.1.0',
      build: { dockerfile: 'Dockerfile', target: 'dev' },
    };
    const out = renderDockerfile(t, 'foo:1');
    expect(out).toContain('Multi-stage build target: dev');
  });
});
