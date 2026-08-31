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
});
