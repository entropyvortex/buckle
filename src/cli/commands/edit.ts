/** `buckle edit <template>` — open user template in $EDITOR. */
import { spawn } from 'node:child_process';

import { findTemplate } from '../../templates/loader.js';
import { BuckleError, ErrorCode } from '../../util/errors.js';
import type { CliContext } from '../context.js';

export async function runEdit(ctx: CliContext, args: { template: string }): Promise<number> {
  const rec = await findTemplate(args.template);
  if (rec.origin === 'builtin') {
    throw new BuckleError(
      ErrorCode.E_PERMISSION,
      `template "${args.template}" is built-in and read-only`,
      `run "buckle view ${args.template}" to inspect, or "buckle new ${args.template} --extend ${args.template}" to create an editable copy`,
    );
  }
  const editor = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';
  return new Promise((resolveP) => {
    const proc = spawn(editor, [rec.path], { stdio: 'inherit' });
    proc.on('exit', (code) => resolveP(code ?? 0));
  });
}
