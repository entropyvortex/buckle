import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { Wizard } from '../../../src/tui/Wizard.js';
import type { TuiServices } from '../../../src/tui/dependencies.js';

describe('Wizard', () => {
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
