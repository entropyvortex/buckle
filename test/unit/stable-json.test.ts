import { describe, expect, it } from 'vitest';

import { hookSurfaceHash } from '../../src/templates/trust.js';
import { stableStringify } from '../../src/util/stable-json.js';

describe('stableStringify', () => {
  it('sorts object keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('hookSurfaceHash', () => {
  it('is independent of object key insertion order', () => {
    const a = hookSurfaceHash({
      mounts: [{ source: '/a', target: '/b', type: 'bind' }],
      runArgs: ['--init'],
    } as never);
    const b = hookSurfaceHash({
      runArgs: ['--init'],
      mounts: [{ source: '/a', target: '/b', type: 'bind' }],
    } as never);
    expect(a).toBe(b);
  });
});
