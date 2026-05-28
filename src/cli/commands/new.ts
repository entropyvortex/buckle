/** `buckle new <name> [--extend <parent>]` — scaffold a starter user template. */
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';

import { templateExists } from '../../templates/loader.js';
import { BuckleError, ErrorCode } from '../../util/errors.js';
import { exists, writeTextAtomic } from '../../util/fs.js';
import { bucklePaths } from '../../util/paths.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export interface NewArgs {
  name: string;
  extend?: string;
}

export async function runNew(ctx: CliContext, args: NewArgs): Promise<number> {
  if (await templateExists(args.name)) {
    throw new BuckleError(
      ErrorCode.E_TEMPLATE_CONFLICT,
      `a template named "${args.name}" already exists`,
      `run "buckle edit ${args.name}" to change it`,
    );
  }
  const root = bucklePaths().templatesRoot;
  const dest = join(root, args.name, 'template.yaml');
  if (await exists(dest)) {
    throw new BuckleError(ErrorCode.E_TEMPLATE_CONFLICT, `${dest} already exists`);
  }
  const starter: Record<string, unknown> = {
    name: args.name,
    description: `Custom template ${args.name}`,
    version: '0.1.0',
    extends: args.extend ?? 'ubuntu-base',
    features: ['gh'],
    lifecycle: {
      postCreate: ['echo "hello from ' + args.name + '"'],
    },
  };
  const text =
    `# Buckle template: ${args.name}\n# See https://github.com/buckle-dev/buckle for the schema.\n\n` +
    yamlStringify(starter);
  await writeTextAtomic(dest, text);
  if (ctx.flags.json) emit(jsonOk({ name: args.name, path: dest }, ctx.cwd));
  else ctx.logger.success(`created ${dest}`);
  return 0;
}
