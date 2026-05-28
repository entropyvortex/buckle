/** `buckle down [--prune]` — stop & remove the workspace's container. */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export async function runDown(ctx: CliContext, args: { prune?: boolean } = {}): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  await driver.down({ ...(args.prune !== undefined ? { prune: args.prune } : {}) });
  if (ctx.flags.json) emit(jsonOk({ status: 'absent' }, ctx.cwd));
  else ctx.logger.success('container removed');
  return 0;
}
