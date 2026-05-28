/**
 * Commander-based CLI parser. Implements the spec'd command tree:
 *
 *   buckle [<template>]              # default: render template (no docker) OR launch TUI
 *   buckle up [<template>]
 *   buckle down
 *   buckle bash
 *   buckle rebuild
 *   buckle status
 *   buckle list
 *   buckle edit <template>
 *   buckle new <name> [--extend <parent>]
 *   buckle install <origin>
 *   buckle uninstall <name>
 *   buckle doctor
 *   buckle view <template>
 *
 * Global flags: --json, --verbose, --yes, --trust, --feature <name>[:arg] (repeatable), --isolate
 */
import { Command, Option } from 'commander';

import { runBash } from './commands/bash.js';
import { runDoctor } from './commands/doctor.js';
import { runDown } from './commands/down.js';
import { runEdit } from './commands/edit.js';
import { runInstall } from './commands/install.js';
import { runList } from './commands/list.js';
import { runLogs } from './commands/logs.js';
import { runNew } from './commands/new.js';
import { runRebuild } from './commands/rebuild.js';
import { runRender } from './commands/render.js';
import { runRestart } from './commands/restart.js';
import { runStatus } from './commands/status.js';
import { runUninstall } from './commands/uninstall.js';
import { runUp } from './commands/up.js';
import { runView } from './commands/view.js';
import { join } from 'node:path';

import { makeContext, type CliFlags } from './context.js';
import { templateExists } from '../templates/loader.js';
import { exists } from '../util/fs.js';

export interface RunResult {
  exitCode: number;
  /** True when the run was the "no-args, defer to TUI" path. */
  tui: boolean;
  /** When `tui` is true, this is the chosen template name (if specified). */
  tuiTemplate?: string;
  /** When launching TUI via `buckle up` with no template in a clean folder. */
  tuiIntent?: 'up';
}

function attachGlobals(cmd: Command): Command {
  return cmd
    .option('--json', 'machine-readable output mode')
    .option('--verbose', 'verbose logging')
    .option('--yes', 'do not prompt to confirm file writes')
    .option('--trust', 'trust template lifecycle commands without prompting')
    .option(
      '--feature <spec...>',
      'add a buckle convenience feature (repeatable). e.g. --feature dod --feature node:20',
    )
    .option('--user <user>', 'shell as this user when bashing into the container')
    .option('--rebuild', 'force rebuild on up')
    .option('--detach', 'do not attach a shell after up/rebuild')
    .option('--git-init', 'initialize a git repo in the workspace if there is none')
    .option('--installed-only', 'list installed (non-built-in) templates only')
    .option('--force', 'force overwrite on install')
    .option('--preview, --dry-run', 'show what would be written without changing the filesystem')
    .option('--isolate', 'skip bind-mounts + related containerEnv for host AI/home dirs (~/.claude, ~/.grok, ~/.gitconfig) — escape hatch for first-creation friction on some macOS arm64 setups');
}

function readGlobals(cmd: Command): CliFlags {
  const o = cmd.optsWithGlobals();
  const out: CliFlags = {
    json: Boolean(o['json']),
    verbose: Boolean(o['verbose']),
    yes: Boolean(o['yes']),
    trust: Boolean(o['trust']),
    feature: (o['feature'] as string[] | undefined) ?? [],
    rebuild: Boolean(o['rebuild']),
    detach: Boolean(o['detach']),
    gitInit: Boolean(o['gitInit']),
    installedOnly: Boolean(o['installedOnly']),
    force: Boolean(o['force']),
    preview: Boolean(o['preview']),
    isolate: Boolean(o['isolate']),
  };
  if (typeof o['user'] === 'string') out.user = o['user'];
  return out;
}

/**
 * Build the commander program. We return a "runner" that resolves the dispatch decision —
 * including the case where `buckle` is invoked with no recognized args and we should defer to
 * the TUI. (commander doesn't have a clean "default to subcommand if first arg looks like a
 * template" hook, so we do that detection manually before parse.)
 */
export async function dispatch(argv: string[]): Promise<RunResult> {
  // Trim node + script.
  const args = argv.slice(2);
  const SUBS = new Set([
    'up',
    'down',
    'bash',
    'rebuild',
    'restart',
    'logs',
    'status',
    'list',
    'edit',
    'new',
    'install',
    'uninstall',
    'doctor',
    'view',
    'help',
    '--help',
    '-h',
    '--version',
    '-V',
  ]);

  // Empty args → TUI.
  if (args.length === 0) {
    return { exitCode: 0, tui: true };
  }

  // One-verb UX special case (approved design):
  // `buckle up` (no explicit template) in a folder with no .devcontainer/ should
  // launch the wizard with "up after render" intent instead of throwing a confusing error.
  // This makes the mental model ("no devcontainer → interactive setup") consistent
  // even when the user reaches for the `up` verb first.
  if (args[0] === 'up') {
    const hasExplicitTemplate = args.some((a, i) => i > 0 && a && !a.startsWith('-'));
    if (!hasExplicitTemplate) {
      const dcPath = join(process.cwd(), '.devcontainer', 'devcontainer.json');
      if (!(await exists(dcPath))) {
        return { exitCode: 0, tui: true, tuiIntent: 'up' };
      }
    }
  }
  // `buckle <template>` shorthand: if the first arg isn't a known subcommand or flag and a
  // template by that name exists, route it to the render command. Verbose mode logs the rewrite
  // so users grepping unexpected behavior have a trail.
  if (!SUBS.has(args[0]!) && !args[0]!.startsWith('-')) {
    if (await templateExists(args[0]!)) {
      if (args.includes('--verbose')) {
         
        console.error(`buckle: rewriting "${args[0]}" → "render ${args[0]}"`);
      }
      const newArgv = [argv[0]!, argv[1]!, 'render', ...args];
      return runProgram(newArgv);
    }
    // If it's unknown, let commander handle the error (will say "unknown command").
  }

  return runProgram(argv);
}

async function runProgram(argv: string[]): Promise<RunResult> {
  const program = new Command();
  program
    .name('buckle')
    .description('One verb for devcontainers — generate, build, up, and bash with user-wide templates.')
    .version('0.1.0', '-V, --version', 'print the buckle version');

  attachGlobals(program);

  let resultCode = 0;
  const finalize = (code: number) => {
    resultCode = code;
  };

  // Hidden default for the rewritten "buckle <template>" form.
  program
    .command('render <template>', { hidden: true })
    .description('write .devcontainer/ from a template (no docker)')
    .action(async (template: string, _opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runRender(ctx, { template }));
    });

  attachGlobals(
    program
      .command('up [template]')
      .description('build and start the workspace container; bash in unless --detach')
      .action(async (template: string | undefined, _opts: unknown, cmd: Command) => {
        const ctx = makeContext(readGlobals(cmd));
        const args: { template?: string } = {};
        if (template !== undefined) args.template = template;
        finalize(await runUp(ctx, args));
      }),
  );

  program
    .command('down')
    .description('stop and remove the workspace container')
    .option('--prune', 'also prune dangling images and volumes')
    .action(async (opts: { prune?: boolean }, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runDown(ctx, opts));
    });

  program
    .command('restart')
    .description('restart the workspace container in place (no rebuild)')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runRestart(ctx));
    });

  program
    .command('logs')
    .description('show container logs')
    .option('-f, --follow', 'stream logs')
    .option('--tail <n>', 'last N lines', (v) => Number(v))
    .action(async (opts: { follow?: boolean; tail?: number }, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      const args: { follow: boolean; tail?: number } = { follow: Boolean(opts.follow) };
      if (typeof opts.tail === 'number') args.tail = opts.tail;
      finalize(await runLogs(ctx, args));
    });

  program
    .command('bash')
    .description('exec a shell into the running workspace container')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runBash(ctx));
    });

  program
    .command('rebuild')
    .description('down + force rebuild + up + bash')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runRebuild(ctx));
    });

  program
    .command('status')
    .description('show the workspace container state')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runStatus(ctx));
    });

  program
    .command('list')
    .description('list available templates')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runList(ctx));
    });

  program
    .command('edit <template>')
    .description('open a user template in $EDITOR')
    .action(async (template: string, _opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runEdit(ctx, { template }));
    });

  program
    .command('view <template>')
    .description('print the generated devcontainer.json for a template (inspect built-ins with no side-effects)')
    .action(async (template: string, _opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runView(ctx, { template }));
    });

  program
    .command('new <name>')
    .description('scaffold a new user template')
    .addOption(new Option('--extend <parent>', 'inherit from an existing template').default('ubuntu-base'))
    .action(async (name: string, _opts: { extend?: string }, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runNew(ctx, { name, extend: _opts.extend ?? 'ubuntu-base' }));
    });

  program
    .command('install <origin>')
    .description('install a template from gh:user/repo, https://, file:// …')
    .action(async (origin: string, _opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runInstall(ctx, { origin }));
    });

  program
    .command('uninstall <name>')
    .description('remove a previously installed template')
    .action(async (name: string, _opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runUninstall(ctx, { name }));
    });

  program
    .command('doctor')
    .description('environment and configuration diagnostics')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = makeContext(readGlobals(cmd));
      finalize(await runDoctor(ctx));
    });

  await program.parseAsync(argv);
  return { exitCode: resultCode, tui: false };
}
