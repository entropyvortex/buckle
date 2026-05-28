/** `buckle bash` — exec a shell into the workspace's running container. */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';

export async function runBash(ctx: CliContext): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  const r = await driver.bash({ ...(ctx.flags.user ? { user: ctx.flags.user } : {}) });
  return r.exitCode;
}
