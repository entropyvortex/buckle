import { describe, expect, it } from 'vitest';

import { BuckleError, ErrorCode, isBuckleError, toBuckleError } from '../../src/util/errors.js';

describe('BuckleError', () => {
  it('serializes via toJSON without hint when none provided', () => {
    const e = new BuckleError(ErrorCode.E_INTERNAL, 'oops');
    expect(e.toJSON()).toEqual({ code: 'E_INTERNAL', message: 'oops' });
  });

  it('serializes with a hint when provided', () => {
    const e = new BuckleError(ErrorCode.E_DOCKER_DOWN, 'no daemon', 'start docker');
    expect(e.toJSON()).toEqual({ code: 'E_DOCKER_DOWN', message: 'no daemon', hint: 'start docker' });
  });

  it('isBuckleError discriminates', () => {
    expect(isBuckleError(new BuckleError(ErrorCode.E_INTERNAL, 'x'))).toBe(true);
    expect(isBuckleError(new Error('plain'))).toBe(false);
    expect(isBuckleError({ code: 'E_INTERNAL' })).toBe(false);
  });

  it('toBuckleError preserves BuckleError', () => {
    const orig = new BuckleError(ErrorCode.E_TEMPLATE_INVALID, 'bad');
    expect(toBuckleError(orig)).toBe(orig);
  });

  it('toBuckleError wraps generic Error', () => {
    const wrapped = toBuckleError(new Error('boom'));
    expect(isBuckleError(wrapped)).toBe(true);
    expect(wrapped.code).toBe('E_INTERNAL');
    expect(wrapped.message).toBe('boom');
  });

  it('toBuckleError stringifies non-Error values', () => {
    expect(toBuckleError('plain string').message).toBe('plain string');
    expect(toBuckleError(42).message).toBe('42');
  });
});
