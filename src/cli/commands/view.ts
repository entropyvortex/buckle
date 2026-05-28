/** `buckle view <template>` — print resolved devcontainer.json for inspection (works on built-ins, no side effects). */
import { resolve as resolveTemplate } from '../../templates/resolver.js';
import type { Template } from '../../templates/schema.js';
import { buildDevcontainer, serializeDevcontainer } from '../../generators/devcontainer.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export interface ViewArgs {
  template: string;
}

export async function runView(ctx: CliContext, args: ViewArgs): Promise<number> {
  const overlay: Partial<Template> = {};
  if (ctx.flags.feature && ctx.flags.feature.length > 0) {
    overlay.features = ctx.flags.feature;
  }
  const resolved = await resolveTemplate(args.template, { overlay });
  // isolate is passed to build so that feature-expanded mounts (and env) are also filtered.
  const dc = buildDevcontainer(resolved.merged, 'view', {
    ...(ctx.flags.isolate ? { isolate: true } : {}),
  });
  if (ctx.flags.json) {
    emit(jsonOk({ template: args.template, devcontainer: dc }, ctx.cwd));
  } else {
    process.stdout.write(serializeDevcontainer(dc));
  }
  return 0;
}
