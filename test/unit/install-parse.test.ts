import { describe, expect, it } from 'vitest';

import { parseOrigin } from '../../src/cli/install.js';

describe('parseOrigin', () => {
  it('parses gh:user/repo', () => {
    const p = parseOrigin('gh:foo/bar');
    expect(p.url).toBe('https://github.com/foo/bar.git');
    expect(p.path).toBeUndefined();
  });

  it('parses gh:user/repo/path', () => {
    const p = parseOrigin('gh:foo/bar/templates/node');
    expect(p.url).toBe('https://github.com/foo/bar.git');
    expect(p.path).toBe('templates/node');
  });

  it('parses gh:user/repo#ref', () => {
    const p = parseOrigin('gh:foo/bar#main');
    expect(p.ref).toBe('main');
  });

  it('parses gl:user/repo', () => {
    const p = parseOrigin('gl:foo/bar');
    expect(p.url).toBe('https://gitlab.com/foo/bar.git');
  });

  it('passes through https:// urls', () => {
    const p = parseOrigin('https://example.com/x.git#v1');
    expect(p.url).toBe('https://example.com/x.git');
    expect(p.ref).toBe('v1');
  });

  it('passes through file:// urls', () => {
    const p = parseOrigin('file:///abs/path');
    expect(p.url).toBe('file:///abs/path');
  });

  it('throws on unrecognized formats', () => {
    expect(() => parseOrigin('something-bad')).toThrow();
  });

  it('hashKey is stable across calls and varies with ref', () => {
    const a = parseOrigin('gh:foo/bar#v1').hashKey;
    const b = parseOrigin('gh:foo/bar#v1').hashKey;
    const c = parseOrigin('gh:foo/bar#v2').hashKey;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
