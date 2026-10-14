import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { StatusPanel } from '../../../src/tui/StatusPanel.js';
import type { TuiServices } from '../../../src/tui/dependencies.js';
import type { Driver } from '../../../src/docker/driver.js';

describe('StatusPanel', () => {
  it('shows the reconfigure keybinding', async () => {
    const driver = {
      status: vi.fn(async () => ({ status: 'absent' as const, name: 'buckle.tmp.unknown' })),
    };

    const services: Partial<TuiServices> = {
      createDriver: () => driver as unknown as Driver,
    };

    const { lastFrame, unmount } = render(
      React.createElement(StatusPanel, { cwd: '/tmp/proj', services }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/reconfigure/);
    expect(frame).toMatch(/c reconfigure/);
    unmount();
  });

  it('confirms trust in-TUI before reconfiguring to an untrusted template', async () => {
    const driver = {
      status: vi.fn(async () => ({ status: 'absent' as const, name: 'buckle.tmp.unknown' })),
    };
    const renderTemplate = vi.fn(async () => ({ plan: { files: [] } }) as never);
    const services: Partial<TuiServices> = {
      createDriver: () => driver as unknown as Driver,
      listCatalog: async () => [{ name: 'custom', description: 'my template', origin: 'user' as const }],
      trustPreflight: vi.fn(async () => ({
        trusted: false,
        changed: false,
        surface: ['postCreate: echo hi'],
      })),
      renderTemplate,
      makeContext: () =>
        ({
          cwd: '/tmp',
          flags: {},
          logger: { info() {}, warn() {}, error() {}, success() {}, debug() {}, line() {}, raw() {} },
          config: {},
        }) as never,
    };

    const { lastFrame, stdin, unmount } = render(
      React.createElement(StatusPanel, { cwd: '/tmp/proj', services }),
    );
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('c'); // open reconfigure
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r'); // select "custom"
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/unverified executable surface/);
    expect(renderTemplate).not.toHaveBeenCalled();

    stdin.write('y'); // trust & continue
    await new Promise((r) => setTimeout(r, 50));
    expect(renderTemplate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ templateName: 'custom', trust: true }),
    );
    unmount();
  });
});
