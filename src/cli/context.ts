import { resolve as pathResolve } from 'node:path';

import { loadConfigSync, type BuckleConfig } from '../util/config.js';
import { makeLogger, type Logger } from '../util/log.js';

export interface CliFlags {
  json?: boolean;
  verbose?: boolean;
  yes?: boolean;
  trust?: boolean;
  feature?: string[];
  rebuild?: boolean;
  detach?: boolean;
  user?: string;
  gitInit?: boolean;
  installedOnly?: boolean;
  force?: boolean;
  preview?: boolean;
  /**
   * When true (the default), AI agent skills/config live in a per-workspace
   * directory instead of the host ~/.claude and ~/.grok.
   * `--share-home` / `--no-isolate` sets this to false.
   */
  isolate?: boolean;
  /** Bind-mount host ~/.claude, ~/.grok, ~/.gitconfig. Inverse of isolate. */
  shareHome?: boolean;
}

export interface CliContext {
  cwd: string;
  flags: CliFlags;
  logger: Logger;
  config: BuckleConfig;
}

function resolveIsolate(flags: CliFlags, config: BuckleConfig): boolean {
  if (flags.shareHome === true) return false;
  if (flags.isolate === false) return false;
  if (flags.isolate === true) return true;
  if (config.isolate === false) return false;
  return true;
}

export function makeContext(flags: CliFlags, cwd?: string): CliContext {
  const config = loadConfigSync();
  const isolate = resolveIsolate(flags, config);
  const merged: CliFlags = { ...flags, isolate, shareHome: !isolate };
  const logger = makeLogger({
    ...(merged.json !== undefined ? { json: merged.json } : {}),
    ...(merged.verbose !== undefined ? { verbose: merged.verbose } : {}),
  });
  return { cwd: pathResolve(cwd ?? process.cwd()), flags: merged, logger, config };
}
