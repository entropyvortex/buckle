/** `buckle restart` — restart the workspace container in place (no rebuild). */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export async function runRestart(ctx: CliContext): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  await driver.restart();
  if (ctx.flags.json) emit(jsonOk({ restarted: true }, ctx.cwd));
  else ctx.logger.success('container restarted');
  return 0;
}
