import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bucklePaths, cacheHome, configHome, dataHome } from '../../src/util/paths.js';

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
});

describe('paths', () => {
  beforeEach(() => {
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['XDG_DATA_HOME'];
    delete process.env['XDG_CACHE_HOME'];
  });

  it('configHome falls back to ~/.config', () => {
    expect(configHome()).toMatch(/\.config$/);
  });

  it('respects XDG_CONFIG_HOME when set', () => {
    process.env['XDG_CONFIG_HOME'] = '/tmp/xdg';
    expect(configHome()).toBe('/tmp/xdg');
  });

  it('dataHome and cacheHome have sensible fallbacks', () => {
    expect(dataHome()).toMatch(/\.local\/share$/);
    expect(cacheHome()).toMatch(/\.cache$/);
  });

  it('bucklePaths layout includes templates/_installed and trust/config files', () => {
    const p = bucklePaths();
    expect(p.configRoot.endsWith('/buckle')).toBe(true);
    expect(p.templatesRoot.endsWith('/buckle/templates')).toBe(true);
    expect(p.installedRoot.endsWith('/buckle/templates/_installed')).toBe(true);
    expect(p.trustStore.endsWith('/buckle/trust.json')).toBe(true);
    expect(p.configFile.endsWith('/buckle/config.yaml')).toBe(true);
  });
});
