/** `buckle <template>` — write .devcontainer files, no docker. */
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';
import { renderTemplate } from '../render.js';

export interface RenderArgs {
  template: string;
}

export async function runRender(ctx: CliContext, args: RenderArgs): Promise<number> {
  const out = await renderTemplate(ctx, {
    templateName: args.template,
    features: ctx.flags.feature ?? [],
    ...(ctx.flags.trust !== undefined ? { trust: ctx.flags.trust } : {}),
    ...(ctx.flags.yes !== undefined ? { yes: ctx.flags.yes } : {}),
  });
  if (ctx.flags.json) {
    emit(
      jsonOk(
        {
          template: args.template,
          hash: out.hash,
          written: out.written,
          files: out.plan.files.map((f) => ({
            path: f.path,
            existed: f.existed,
            changed: f.changed,
          })),
        },
        ctx.cwd,
      ),
    );
  } else {
    ctx.logger.success(out.written ? 'wrote .devcontainer/' : 'nothing to do');
  }
  return 0;
}
