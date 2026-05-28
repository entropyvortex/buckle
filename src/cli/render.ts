/**
 * Internal rendering pipeline shared by `buckle <template>`, `buckle up`, etc.
 * Resolves a template, applies CLI overlays, plans/applies file writes, and runs the trust
 * prompt when needed.
 */
import { basename } from 'node:path';

import { resolve as resolveTemplate } from '../templates/resolver.js';
import type { Template } from '../templates/schema.js';
import { checkTrust, hookSurfaceHash, recordTrust } from '../templates/trust.js';
import { applyPlan, plan, renderDiff, summarizePlan, type RenderPlan } from '../generators/writer.js';
import { BuckleError, ErrorCode } from '../util/errors.js';
import type { CliContext } from './context.js';

export interface RenderArgs {
  templateName: string;
  /** Apply CLI feature overlays. */
  features: string[];
  /** Skip trust prompt — used for `--trust` and the in-TUI confirm.
   *  For pure built-in templates this is no longer required (they are auto-trusted). */
  trust?: boolean;
  /** Skip diff confirmation — used for `--yes` and the in-TUI confirm. */
  yes?: boolean;
}

export interface RenderOutcome {
  template: Template;
  hash: string;
  plan: RenderPlan;
  written: boolean;
  trusted: boolean;
}

export async function renderTemplate(ctx: CliContext, args: RenderArgs): Promise<RenderOutcome> {
  const overlay: Partial<Template> = {};
  if (args.features.length > 0) {
    overlay.features = args.features;
  }
  const resolved = await resolveTemplate(args.templateName, { overlay });
  const hash = resolved.hash;
  const surface = hookSurfaceHash(resolved.merged);

  // Built-in templates (purely from the buckle package, no user/installed extends)
  // are considered pre-trusted. This removes annoying --trust friction for the
  // common happy path (`buckle up ai-native`, `buckle up claude-corp`, etc.)
  // while still protecting users from arbitrary lifecycle hooks in their own
  // templates or installed ones.
  const isPureBuiltin = resolved.chainOrigins.length > 0 &&
    resolved.chainOrigins.every((o) => o === 'builtin');

  // Trust gate: only prompt for non-builtin templates (user or installed).
  // Overlays (--feature etc.) are still subject to the surface hash check
  // when the base template is not purely builtin.
  let trusted = args.trust === true || isPureBuiltin;

  if (!trusted) {
    const decision = await checkTrust(hash, surface);
    if (!decision.trusted) {
      // For non-interactive contexts, surface a clear error.
      if (process.stdin.isTTY !== true || ctx.flags.json) {
        throw new BuckleError(
          ErrorCode.E_HASH_MISMATCH,
          decision.changed
            ? `template "${args.templateName}" lifecycle hooks have changed since you last trusted it`
            : `template "${args.templateName}" has unverified lifecycle hooks; review them before running`,
          're-run with --trust after reviewing the template, or run interactively to be prompted',
        );
      }
      // Interactive: print the surface and ask.
      ctx.logger.warn(
        `Template "${args.templateName}" wants to run lifecycle commands on first use. Run "buckle view ${args.templateName}" to inspect, or pass --trust to accept.`,
      );
      throw new BuckleError(
        ErrorCode.E_USER_ABORT,
        'aborted: template not trusted',
        'pass --trust on the next run to accept the lifecycle commands',
      );
    }
    trusted = true;
  }

  // Only persist trust entries for templates that actually went through the gate
  // (i.e. custom ones). Builtins don't need to pollute the trust store.
  if (!isPureBuiltin) {
    await recordTrust(hash, surface);
  }

  // Pass --isolate through; stripping of home mounts happens after feature expansion inside
  // buildDevcontainer (so both template-declared and feature-injected mounts are removed).
  const projectName = basename(ctx.cwd);
  const p = await plan(resolved.merged, {
    cwd: ctx.cwd,
    projectName,
    ...(ctx.flags.isolate ? { isolate: true } : {}),
  });
  const summary = summarizePlan(p);
  for (const s of summary) {
    ctx.logger.info(`${s.status.padEnd(9)} ${s.path.replace(ctx.cwd + '/', '')}`);
  }

  // Surface compose / multi-service guardrails when present.
  if (p.warnings && p.warnings.length > 0) {
    for (const w of p.warnings) {
      ctx.logger.warn(`warn: ${w}`);
    }
  }

  // Templates may declare per-step `user:` on lifecycle steps, but @devcontainers/cli
  // doesn't support that nested shape and crashes with "a.join is not a function".
  // We emit a flat joined string for every lifecycle hook; the entire hook runs as
  // `remoteUser` (vscode in every built-in template). Surface a one-line note so
  // template authors aren't surprised that the user: hint isn't honored per-step.
  const hasUserStep = Object.values(resolved.merged.lifecycle ?? {}).some(
    (arr) => Array.isArray(arr) && arr.some((s) => s && typeof s === 'object' && 'user' in s && s.user)
  );
  if (hasUserStep) {
    ctx.logger.info(
      'note: per-step `user:` on lifecycle steps is ignored — the hook runs as `remoteUser`.'
    );
  }

  let written = false;
  const anyChange = p.files.some((f) => f.changed);
  if (anyChange) {
    if (ctx.flags.preview) {
      ctx.logger.raw(renderDiff(p));
      return { template: resolved.merged, hash, plan: p, written: false, trusted };
    }
    if (!args.yes && process.stdin.isTTY === true && !ctx.flags.json) {
      // Best-effort interactive confirmation. In headless contexts (--yes / non-TTY),
      // we proceed without prompting.
      const confirmed = await confirm(`Apply changes to .devcontainer/ in ${ctx.cwd}? [y/N] `);
      if (!confirmed) {
        throw new BuckleError(ErrorCode.E_USER_ABORT, 'aborted by user');
      }
    }
    await applyPlan(p);
    written = true;
  } else {
    ctx.logger.info('no changes; .devcontainer is up to date.');
  }

  return { template: resolved.merged, hash, plan: p, written, trusted };
}

async function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolveP) => {
    process.stderr.write(prompt);
    const onData = (chunk: Buffer) => {
      const ans = chunk.toString().trim().toLowerCase();
      process.stdin.off('data', onData);
      resolveP(ans === 'y' || ans === 'yes');
    };
    process.stdin.once('data', onData);
  });
}
