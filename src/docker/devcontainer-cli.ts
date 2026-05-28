import { execa, type ExecaError } from 'execa';

import { BuckleError, ErrorCode } from '../util/errors.js';
import type { Logger } from '../util/log.js';

/** Detect whether `@devcontainers/cli` is callable on PATH. */
export async function hasDevcontainerCli(): Promise<boolean> {
  try {
    await execa('devcontainer', ['--version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export interface UpOptions {
  workspaceFolder: string;
  rebuild?: boolean;
  /** Pass-through additional CLI args. */
  extraArgs?: string[];
  logger: Logger;
  /** When true, fully buffer output (for --json / machine consumers). */
  quiet?: boolean;
}

export async function up(opts: UpOptions): Promise<{ containerId: string }> {
  const args = ['up', '--workspace-folder', opts.workspaceFolder];
  if (opts.rebuild) args.push('--remove-existing-container', '--build-no-cache');
  if (opts.extraArgs) args.push(...opts.extraArgs);

  const isQuiet = opts.quiet === true;

  if (!isQuiet && opts.logger) {
    // Give a little heads-up so the user knows the (potentially long) work has begun.
    opts.logger.info('starting dev container (first build can take a minute or two)...');
  }

  // Always capture stdout + stderr so we can produce good error messages.
  // In non-quiet (interactive) mode we also forward stderr live for progress feedback.
  const child = execa('devcontainer', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000,
    reject: false, // we handle non-zero exit ourselves for better diagnostics
    all: true,     // .all contains interleaved stdout+stderr (very useful on failure)
  });

  // Live-stream human-readable progress to the user while also keeping the data for errors.
  if (!isQuiet) {
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    // We intentionally do NOT forward stdout live here — it mostly contains JSON
    // machine events. The final outcome JSON is parsed after the process ends.
  }

  const result = await child;

  if (result.exitCode !== 0) {
    // Always surface the real output from @devcontainers/cli + docker + features + lifecycle.
    // This is the #1 thing users need when a build / up fails.
    const output = (result.all ?? result.stderr ?? result.stdout ?? '').toString().trim();

    if (output) {
      // Separate it visually so the diagnostic output stands out clearly.
      process.stderr.write('\n');
      process.stderr.write(output);
      process.stderr.write('\n\n');
    }

    // Detect the common "container started but then immediately died during setup" class of failures.
    const looksLikeStartupFailure =
      /Shell server terminated/i.test(output) ||
      /An error occurred setting up the container/i.test(output) ||
      /container .* is not running/i.test(output);

    let hint = output
      ? 'see the devcontainer / docker output above for the root cause'
      : 'no output was captured from the devcontainer CLI — try running `devcontainer up` manually in this folder for more details';

    if (output.includes('a.join is not a function')) {
      hint +=
        '\n\nThis is a long-standing bug in @devcontainers/cli (still present in 0.87.0) when\n' +
        '`postCreateCommand` (or other lifecycle hooks) is an object with values shaped like\n' +
        '`{ command, user }`. That nested shape is not part of the devcontainer JSON spec for\n' +
        'named-object hooks, and upgrading the CLI does not fix it.\n\n' +
        'Buckle no longer emits that shape, so this error usually means .devcontainer/devcontainer.json\n' +
        'was hand-edited or written by another tool. Re-render to overwrite with buckle\'s output:\n' +
        '  buckle up <template> --rebuild\n\n' +
        'If you need per-user execution, set `remoteUser: vscode` at the top level (already the\n' +
        'default in every built-in template) and let the whole hook run as that user.';
    } else if (looksLikeStartupFailure) {
      hint +=
        '\n\nThis is usually caused by a bad cached features image layer.\n' +
        'Try:  buckle up <template> --rebuild     (forces a clean no-cache build)\n' +
        'As a last resort for macOS arm64 + AI mounts on first creation, try --isolate:\n' +
        '  buckle up <template> --trust --rebuild --isolate';
    }

    throw new BuckleError(
      ErrorCode.E_BUILD_FAILED,
      `devcontainer up failed (exit code ${result.exitCode})`,
      hint,
    );
  }

  // Success path: the CLI emits JSON lines on stdout. Find the last one that reports a containerId.
  const lastJson = (result.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse()
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((j): j is Record<string, unknown> => j !== null && j['containerId'] !== undefined);

  const containerId = (lastJson?.['containerId'] as string | undefined) ?? '';
  if (!containerId) {
    opts.logger.warn('devcontainer up did not report a containerId; the container may still be running.');
  }
  return { containerId };
}

export interface ExecOptions {
  workspaceFolder: string;
  command: string[];
  user?: string;
  /** Stream stdio interactively (TTY). */
  interactive?: boolean;
  logger: Logger;
}

export async function execIn(opts: ExecOptions): Promise<{ exitCode: number }> {
  const args = ['exec', '--workspace-folder', opts.workspaceFolder];
  if (opts.user) args.push('--user', opts.user);
  args.push(...opts.command);
  try {
    const proc = await execa('devcontainer', args, {
      stdio: opts.interactive ? 'inherit' : 'pipe',
      timeout: 0,
    });
    return { exitCode: proc.exitCode ?? 0 };
  } catch (e) {
    const ee = e as ExecaError;
    if (typeof ee.exitCode === 'number') return { exitCode: ee.exitCode };
    throw new BuckleError(ErrorCode.E_INTERNAL, `devcontainer exec failed: ${ee.message}`);
  }
}
