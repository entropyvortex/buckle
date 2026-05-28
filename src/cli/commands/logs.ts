/** `buckle logs [--follow] [--tail N]` — stream container logs. */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';

export async function runLogs(ctx: CliContext, args: { follow: boolean; tail?: number }): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  const opts: { follow?: boolean; tail?: number } = {};
  if (args.follow) opts.follow = true;
  if (typeof args.tail === 'number') opts.tail = args.tail;
  const r = await driver.logs(opts);
  return r.exitCode;
}
