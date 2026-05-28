/** `buckle uninstall <name>` — remove a previously installed template. */
import type { CliContext } from '../context.js';
import { uninstall } from '../install.js';
import { emit, jsonOk } from '../json-out.js';

export async function runUninstall(ctx: CliContext, args: { name: string }): Promise<number> {
  await uninstall(args.name, { logger: ctx.logger });
  if (ctx.flags.json) emit(jsonOk({ name: args.name, removed: true }, ctx.cwd));
  else ctx.logger.success(`removed "${args.name}"`);
  return 0;
}
