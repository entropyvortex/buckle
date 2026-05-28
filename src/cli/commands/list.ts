/** `buckle list` — built-in + user + installed templates. */
import { listCatalog } from '../../templates/loader.js';
import { styles } from '../../util/log.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export async function runList(ctx: CliContext): Promise<number> {
  const items = await listCatalog();
  const filtered = ctx.flags.installedOnly ? items.filter((i) => i.origin !== 'builtin') : items;

  if (ctx.flags.json) {
    emit(jsonOk({ templates: filtered }, ctx.cwd));
    return 0;
  }
  if (filtered.length === 0) {
    ctx.logger.info('no templates available; run `buckle install <origin>` or `buckle new <name>`.');
    return 0;
  }
  const widest = filtered.reduce((m, i) => Math.max(m, i.name.length), 0);
  for (const item of filtered) {
    const tag =
      item.origin === 'builtin'
        ? styles.gray('built-in')
        : item.origin === 'user'
          ? styles.cyan('user')
          : styles.green(`installed${item.installOrigin ? ` (${item.installOrigin.slice(0, 8)})` : ''}`);
    process.stdout.write(`  ${item.name.padEnd(widest)}  ${tag}  ${item.description ?? ''}\n`);
  }
  return 0;
}
