import { describe, expect, it } from 'vitest';

import { jsonErr, jsonOk } from '../../src/cli/json-out.js';

describe('json-out', () => {
  it('jsonOk wraps data with timestamp and workspace', () => {
    const env = jsonOk({ x: 1 }, '/work');
    expect(env.ok).toBe(true);
    expect(env.workspace).toBe('/work');
    expect(env.data).toEqual({ x: 1 });
    expect(typeof env.timestamp).toBe('string');
  });

  it('jsonErr surfaces code, message, hint', () => {
    const env = jsonErr('E_INTERNAL', 'oops', 'try again', '/work');
    expect(env.ok).toBe(false);
    expect(env.error).toEqual({ code: 'E_INTERNAL', message: 'oops', hint: 'try again' });
  });

  it('jsonErr omits hint when not provided', () => {
    const env = jsonErr('E_INTERNAL', 'oops');
    expect(env.error?.hint).toBeUndefined();
  });
});
