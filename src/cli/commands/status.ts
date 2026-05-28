/** `buckle status` — summarize the workspace's container. */
import { Driver } from '../../docker/driver.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export async function runStatus(ctx: CliContext): Promise<number> {
  const driver = new Driver({ workspaceFolder: ctx.cwd, templateName: 'unknown', logger: ctx.logger });
  const s = await driver.status();
  if (ctx.flags.json) {
    emit(jsonOk({ status: s.status, name: s.name, container: s.container ?? null }, ctx.cwd));
    return 0;
  }
  ctx.logger.info(`status:    ${s.status}`);
  ctx.logger.info(`name:      ${s.name}`);
  if (s.container) {
    ctx.logger.info(`image:     ${s.container.image}`);
    ctx.logger.info(`ports:     ${s.container.ports.map((p) => `${p.host ?? '?'}->${p.container}/${p.protocol}`).join(', ')}`);
  }
  return 0;
}
