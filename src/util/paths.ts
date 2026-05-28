import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve a base directory honoring XDG with sensible fallbacks. */
function xdgBase(envVar: string, fallback: string): string {
  const v = process.env[envVar];
  if (v && v.length > 0) return v;
  return join(homedir(), fallback);
}

export function configHome(): string {
  return xdgBase('XDG_CONFIG_HOME', '.config');
}

export function dataHome(): string {
  return xdgBase('XDG_DATA_HOME', '.local/share');
}

export function cacheHome(): string {
  return xdgBase('XDG_CACHE_HOME', '.cache');
}

export interface BucklePaths {
  /** Root of buckle's user-wide config (templates, trust, settings). */
  configRoot: string;
  /** User-authored templates live here. */
  templatesRoot: string;
  /** Templates pulled in via `buckle install` live here. */
  installedRoot: string;
  /** Trust-store file (resolved-hash → trusted-on date). */
  trustStore: string;
  /** Per-user `config.yaml`. */
  configFile: string;
}

export function bucklePaths(): BucklePaths {
  const configRoot = join(configHome(), 'buckle');
  const templatesRoot = join(configRoot, 'templates');
  const installedRoot = join(templatesRoot, '_installed');
  return {
    configRoot,
    templatesRoot,
    installedRoot,
    trustStore: join(configRoot, 'trust.json'),
    configFile: join(configRoot, 'config.yaml'),
  };
}
