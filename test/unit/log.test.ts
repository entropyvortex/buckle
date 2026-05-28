import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeLogger, styles } from '../../src/util/log.js';

describe('logger', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let outSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    errSpy.mockRestore();
    outSpy.mockRestore();
  });

  it('text logger writes to stderr for info/warn/error/success', () => {
    const log = makeLogger({});
    log.info('i');
    log.warn('w');
    log.error('e');
    log.success('s');
    expect(errSpy.mock.calls.length).toBe(4);
  });

  it('debug only emits when verbose is true', () => {
    const log = makeLogger({});
    log.debug('hidden');
    expect(errSpy).not.toHaveBeenCalled();
    const log2 = makeLogger({ verbose: true });
    log2.debug('shown');
    expect(errSpy).toHaveBeenCalled();
  });

  it('silent suppresses non-error output', () => {
    const log = makeLogger({ silent: true });
    log.info('i');
    log.success('s');
    log.error('e');
    expect(errSpy.mock.calls.length).toBe(1);
  });

  it('json mode swallows non-error output, surfaces error', () => {
    const log = makeLogger({ json: true });
    log.info('i');
    log.success('s');
    const writeStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    log.error('e');
    expect(writeStderr).toHaveBeenCalled();
    writeStderr.mockRestore();
  });

  it('styles helpers return strings', () => {
    expect(typeof styles.bold('x')).toBe('string');
    expect(typeof styles.dim('x')).toBe('string');
    expect(typeof styles.cyan('x')).toBe('string');
    expect(typeof styles.green('x')).toBe('string');
    expect(typeof styles.yellow('x')).toBe('string');
    expect(typeof styles.red('x')).toBe('string');
    expect(typeof styles.gray('x')).toBe('string');
  });
});
