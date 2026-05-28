/** `buckle install <origin>` — fetch a template from git/file. */
import type { CliContext } from '../context.js';
import { install } from '../install.js';
import { emit, jsonOk } from '../json-out.js';

export async function runInstall(ctx: CliContext, args: { origin: string }): Promise<number> {
  const r = await install(args.origin, {
    logger: ctx.logger,
    ...(ctx.flags.force !== undefined ? { force: ctx.flags.force } : {}),
  });
  if (ctx.flags.json) emit(jsonOk(r, ctx.cwd));
  else ctx.logger.success(`installed "${r.templateName}" from ${args.origin}`);
  return 0;
}
