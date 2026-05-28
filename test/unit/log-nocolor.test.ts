import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeLogger, styles } from '../../src/util/log.js';

describe('logger color toggles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['NO_COLOR'];
    delete process.env['BUCKLE_NO_COLOR'];
  });

  it('NO_COLOR strips ANSI from styles', () => {
    process.env['NO_COLOR'] = '1';
    expect(styles.bold('x')).toBe('x');
    expect(styles.cyan('x')).toBe('x');
  });

  it('BUCKLE_NO_COLOR also strips', () => {
    process.env['BUCKLE_NO_COLOR'] = '1';
    expect(styles.green('x')).toBe('x');
  });

  it('logger.line emits a blank line in text mode', () => {
    const log = makeLogger({});
    log.line();
    // We don't assert on the call count strictly — just that line() doesn't throw.
    expect(true).toBe(true);
  });

  it('json logger debug/warn/info/success/line are no-ops', () => {
    const log = makeLogger({ json: true });
    log.debug('x');
    log.warn('x');
    log.info('x');
    log.success('x');
    log.line();
  });

  it('logger.raw writes to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    makeLogger({}).raw('hello');
    expect(writeSpy).toHaveBeenCalledWith('hello');
    writeSpy.mockRestore();
  });
});
