import { describe, expect, it } from 'vitest';

import { formatTrustSurface } from '../../src/cli/render.js';
import type { Template } from '../../src/templates/schema.js';

describe('formatTrustSurface', () => {
  it('summarizes lifecycle, mounts, runArgs, and features', () => {
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      lifecycle: { postCreate: ['echo hi', { command: 'true', user: 'vscode' }] },
      mounts: [{ source: '/a', target: '/b', type: 'bind' }],
      runArgs: ['--init'],
      features: ['gh', ['node', '20']],
    };
    const lines = formatTrustSurface(t);
    expect(lines.some((l) => l.startsWith('postCreate:'))).toBe(true);
    expect(lines.some((l) => l.includes('/a → /b'))).toBe(true);
    expect(lines.some((l) => l.startsWith('runArgs:'))).toBe(true);
    expect(lines.some((l) => l.includes('gh'))).toBe(true);
  });

  it('reports an empty surface', () => {
    expect(formatTrustSurface({ version: '0.1.0', image: 'foo:1' })).toEqual([
      '(no lifecycle, mounts, runArgs, or features)',
    ]);
  });
});
