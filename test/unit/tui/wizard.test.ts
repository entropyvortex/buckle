import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { Wizard } from '../../../src/tui/Wizard.js';
import type { TuiServices } from '../../../src/tui/dependencies.js';

const stubContext = () =>
  ({
    cwd: '/tmp',
    flags: { isolate: true },
    logger: {
      info() {},
      warn() {},
      error() {},
      success() {},
      debug() {},
      line() {},
      raw() {},
    },
    config: {},
  }) as never;

describe('Wizard', () => {
  it('confirms trust in-TUI for an untrusted non-builtin template', async () => {
    const renderTemplate = vi.fn(async () => ({ plan: { files: [] } }) as never);
    const trustPreflight = vi.fn(async () => ({
      trusted: false,
      changed: false,
      surface: ['postCreate: echo hi'],
    }));
    const services: Partial<TuiServices> = {
      detectProject: async () => ({ suggestions: ['custom'], scores: [], polyglot: false }),
      listCatalog: async () => [{ name: 'custom', description: 'my template', origin: 'user' as const }],
      trustPreflight,
      renderTemplate,
      makeContext: stubContext,
    };

    const { lastFrame, stdin, unmount } = render(
      React.createElement(Wizard, { cwd: '/tmp/proj', services }),
    );
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r'); // pick-template: select "custom"
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r'); // pick-features: continue with none
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('y'); // review: confirm write
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/unverified executable surface/);
    expect(frame).toMatch(/postCreate: echo hi/);
    expect(renderTemplate).not.toHaveBeenCalled();

    stdin.write('y'); // trust & continue
    await new Promise((r) => setTimeout(r, 50));
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ templateName: 'custom', trust: true }),
    );
    unmount();
  });

  it('lists dual-agent templates from detection suggestions', async () => {
    const services: Partial<TuiServices> = {
      detectProject: async () => ({
        suggestions: ['ai-native', 'ubuntu-base'],
        scores: [],
        polyglot: false,
      }),
      listCatalog: async () => [
        {
          name: 'ai-native',
          description: 'Claude + Grok',
          origin: 'builtin' as const,
        },
        {
          name: 'ubuntu-base',
          description: 'Plain Ubuntu',
          origin: 'builtin' as const,
        },
      ],
      renderTemplate: vi.fn(),
      makeContext: () =>
        ({
          cwd: '/tmp',
          flags: { isolate: true },
          logger: {
            info() {},
            warn() {},
            error() {},
            success() {},
            debug() {},
            line() {},
            raw() {},
          },
          config: {},
        }) as never,
    };

    const { lastFrame, unmount } = render(
      React.createElement(Wizard, { cwd: '/tmp/proj', services }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/ai-native/);
    expect(frame).toMatch(/dual-agent/);
    unmount();
  });
});
