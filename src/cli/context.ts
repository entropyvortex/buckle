import { resolve as pathResolve } from 'node:path';

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
  isolate?: boolean;
}

export interface CliContext {
  cwd: string;
  flags: CliFlags;
  logger: Logger;
}

export function makeContext(flags: CliFlags, cwd?: string): CliContext {
  const logger = makeLogger({
    ...(flags.json !== undefined ? { json: flags.json } : {}),
    ...(flags.verbose !== undefined ? { verbose: flags.verbose } : {}),
  });
  return { cwd: pathResolve(cwd ?? process.cwd()), flags, logger };
}
