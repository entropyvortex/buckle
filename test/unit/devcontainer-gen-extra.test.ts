import { describe, expect, it } from 'vitest';

import { buildDevcontainer } from '../../src/generators/devcontainer.js';
import type { Template } from '../../src/templates/schema.js';

describe('buildDevcontainer additional branches', () => {
  it('emits forwardPorts and portsAttributes', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      forwardPorts: [3000, { port: 8080, label: 'api' }],
      portsAttributes: { '3000': { label: 'web' } },
      appPort: [3000, '8080'],
    };
    const dc = buildDevcontainer(t, 'proj');
    expect(dc.forwardPorts).toEqual([3000, { port: 8080 }]);
    expect(dc.portsAttributes).toEqual({ '3000': { label: 'web' } });
    expect(dc.appPort).toEqual([3000, '8080']);
  });

  it('passes through containerUser, workspaceMount, customizations', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      containerUser: 'root',
      workspaceMount: 'source=local,target=/ws',
      customizations: { vscode: { settings: { 'editor.formatOnSave': true } } },
    };
    const dc = buildDevcontainer(t, 'proj');
    expect(dc.containerUser).toBe('root');
    expect(dc.workspaceMount).toBe('source=local,target=/ws');
    expect(dc.customizations).toBeDefined();
  });

  it('emits all lifecycle hooks when set', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      lifecycle: {
        initialize: ['init'],
        onCreate: ['onc'],
        updateContent: ['upd'],
        postCreate: ['pc'],
        postStart: ['ps'],
        postAttach: ['pa'],
      },
    };
    const dc = buildDevcontainer(t, 'proj');
    expect(dc.initializeCommand).toEqual('init');
    expect(dc.onCreateCommand).toEqual('onc');
    expect(dc.updateContentCommand).toEqual('upd');
    expect(dc.postCreateCommand).toEqual('pc');
    expect(dc.postStartCommand).toEqual('ps');
    expect(dc.postAttachCommand).toEqual('pa');
  });

  it('flattens per-step user into a single joined string', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      remoteUser: 'vscode',
      lifecycle: {
        postCreate: [
          { command: 'curl -fsSL https://claude.ai/install.sh | bash', user: 'vscode' },
          { command: 'echo alias claude=... >> ~/.bashrc', user: 'vscode' },
        ],
      },
    };
    const dc = buildDevcontainer(t, 'proj');
    // Per-step `user:` is folded away — the whole hook runs as remoteUser.
    // The object-with-{command,user} form crashes @devcontainers/cli.
    expect(dc.postCreateCommand).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash && echo alias claude=... >> ~/.bashrc'
    );
  });

  it('mixes string steps and {command,user} steps without producing an object', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      remoteUser: 'vscode',
      lifecycle: {
        postCreate: [
          { command: 'curl -fsSL https://claude.ai/install.sh | bash', user: 'vscode' },
          'npm install -g some-tool',
          { command: 'echo done', user: 'vscode' },
        ],
      },
    };
    const dc = buildDevcontainer(t, 'proj');
    expect(typeof dc.postCreateCommand).toBe('string');
    expect(dc.postCreateCommand).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash && npm install -g some-tool && echo done'
    );
  });
});
