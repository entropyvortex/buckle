import { describe, expect, it } from 'vitest';

import { containerName } from '../../src/docker/naming.js';

describe('containerName', () => {
  it('builds buckle.<cwd>.<template>', () => {
    expect(containerName({ cwd: '/home/me/proj', template: 'node' })).toBe('buckle.proj.node');
  });

  it('appends _2 on collision', () => {
    expect(
      containerName({ cwd: '/home/me/proj', template: 'node', inUse: ['buckle.proj.node'] }),
    ).toBe('buckle.proj.node_2');
    expect(
      containerName({
        cwd: '/home/me/proj',
        template: 'node',
        inUse: ['buckle.proj.node', 'buckle.proj.node_2'],
      }),
    ).toBe('buckle.proj.node_3');
  });

  it('falls back to "tmp" when basename is unsluggable', () => {
    expect(containerName({ cwd: '/!!!', template: 'node' })).toBe('buckle.tmp.node');
  });

  it('truncates each segment to 32 chars', () => {
    const long = '/home/me/' + 'x'.repeat(80);
    const out = containerName({ cwd: long, template: 'node' });
    const segments = out.split('.');
    expect(segments[1]?.length).toBeLessThanOrEqual(32);
  });
});
