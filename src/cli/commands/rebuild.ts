/** `buckle rebuild` — down + force rebuild + up + bash. */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';

export async function runRebuild(ctx: CliContext): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  await driver.down();
  await driver.up({ rebuild: true, ...(ctx.flags.json ? { quiet: true } : {}) });
  if (ctx.flags.detach) return 0;
  const r = await driver.bash({ ...(ctx.flags.user ? { user: ctx.flags.user } : {}) });
  return r.exitCode;
}
