import { execa } from 'execa';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { BuckleError, ErrorCode } from '../util/errors.js';
import { readTextOrUndefined } from '../util/fs.js';
import type { Logger } from '../util/log.js';
import * as devCli from './devcontainer-cli.js';
import { DockerCli, type ContainerInfo, type Status } from './inspect.js';
import { containerName, LABEL_LOCAL_FOLDER } from './naming.js';

/**
 * Public, high-level operations against a workspace-bound devcontainer. Layered:
 *   - Prefer `@devcontainers/cli` (handles features/lifecycle correctly).
 *   - Fall back to `docker` CLI for `bash`/`down`/`status` regardless.
 */

export interface DriverOptions {
  workspaceFolder: string;
  templateName: string;
  logger: Logger;
}

export interface UpResult {
  containerId: string;
  containerName: string;
}

export class Driver {
  private readonly docker = new DockerCli();

  constructor(private readonly opts: DriverOptions) {}

  async status(): Promise<{ status: Status; container?: ContainerInfo; name: string }> {
    await this.docker.assertUp();
    const abs = await realpath(this.opts.workspaceFolder);
    const found = await this.docker.findByWorkspace(abs);
    const name = containerName({
      cwd: abs,
      template: this.opts.templateName,
      inUse: found.map((f) => f.name),
    });
    if (found.length === 0) return { status: 'absent', name };
    // Prefer the first running, else the first non-broken, else the first.
    const running = found.find((f) => f.status === 'running');
    if (running) return { status: 'running', container: running, name: running.name };
    const built = found.find((f) => f.status === 'built');
    if (built) return { status: 'built', container: built, name: built.name };
    const dead = found.find((f) => f.status === 'dead');
    if (dead) return { status: 'dead', container: dead, name: dead.name };
    return { status: 'broken', container: found[0]!, name: found[0]!.name };
  }

  async up(opts: { rebuild?: boolean; quiet?: boolean } = {}): Promise<UpResult> {
    await this.docker.assertUp();

    // Robustness: a previous `devcontainer up` that died during the initial probe
    // (e.g. the old "sleep: not found" case) often leaves behind a dead/broken
    // container. devcontainer up will then try `docker start <zombie>` and fail.
    // Clean it up so the next attempt gets a fresh container.
    const before = await this.status();
    if (before.container && (before.status === 'dead' || before.status === 'broken')) {
      this.opts.logger.info(`cleaning up previous broken container ${before.container.name}...`);
      try {
        await execa('docker', ['rm', '-f', before.container.id], { stdio: 'pipe' });
      } catch {
        /* best effort */
      }
    }

    if (await devCli.hasDevcontainerCli()) {
      const r = await devCli.up({
        workspaceFolder: this.opts.workspaceFolder,
        ...(opts.rebuild ? { rebuild: true } : {}),
        ...(opts.quiet !== undefined ? { quiet: opts.quiet } : {}),
        logger: this.opts.logger,
      });
      const status = await this.status();
      return { containerId: r.containerId || (status.container?.id ?? ''), containerName: status.name };
    }
    throw new BuckleError(
      ErrorCode.E_UNSUPPORTED,
      'the @devcontainers/cli is not installed.',
      'install it: `npm install -g @devcontainers/cli` (it is the official tool that wires up features and lifecycle hooks)',
    );
  }

  async down(opts: { prune?: boolean } = {}): Promise<void> {
    await this.docker.assertUp();
    const s = await this.status();
    if (s.status === 'absent') {
      this.opts.logger.info('no container for this workspace; nothing to do.');
      return;
    }
    if (!s.container) return;
    this.opts.logger.info(`stopping ${s.container.name}…`);
    try {
      await execa('docker', ['rm', '-f', s.container.id], { stdio: 'pipe' });
    } catch (e) {
      throw new BuckleError(ErrorCode.E_INTERNAL, `failed to remove container: ${(e as Error).message}`);
    }
    if (opts.prune) {
      this.opts.logger.info('pruning dangling images & volumes…');
      try {
        await execa('docker', ['image', 'prune', '-f'], { stdio: 'pipe' });
        await execa('docker', ['volume', 'prune', '-f'], { stdio: 'pipe' });
      } catch (e) {
        this.opts.logger.warn(`prune failed: ${(e as Error).message}`);
      }
    }
  }

  async restart(): Promise<void> {
    await this.docker.assertUp();
    const s = await this.status();
    if (!s.container) {
      throw new BuckleError(ErrorCode.E_USER_ABORT, 'no container to restart; run `buckle up` first');
    }
    this.opts.logger.info(`restarting ${s.container.name}…`);
    try {
      await execa('docker', ['restart', s.container.id], { stdio: 'pipe' });
    } catch (e) {
      throw new BuckleError(ErrorCode.E_INTERNAL, `failed to restart container: ${(e as Error).message}`);
    }
  }

  async logs(opts: { follow?: boolean; tail?: number } = {}): Promise<{ exitCode: number }> {
    await this.docker.assertUp();
    const s = await this.status();
    if (!s.container) {
      throw new BuckleError(ErrorCode.E_USER_ABORT, 'no container; run `buckle up` first');
    }
    const args = ['logs', '--timestamps'];
    if (opts.follow) args.push('--follow');
    if (typeof opts.tail === 'number') args.push('--tail', String(opts.tail));
    args.push(s.container.id);
    try {
      const proc = await execa('docker', args, { stdio: 'inherit', timeout: 0 });
      return { exitCode: proc.exitCode ?? 0 };
    } catch (e) {
      const ee = e as { exitCode?: number };
      return { exitCode: ee.exitCode ?? 1 };
    }
  }

  async bash(opts: { user?: string } = {}): Promise<{ exitCode: number }> {
    await this.docker.assertUp();
    const s = await this.status();
    if (s.status !== 'running') {
      throw new BuckleError(
        ErrorCode.E_USER_ABORT,
        `container is ${s.status}; nothing to attach to`,
        'run `buckle up` first',
      );
    }
    const id = s.container!.id;
    const shell = process.env['BUCKLE_SHELL'] ?? '/bin/bash';
    // Try preferred shells in order. We call `which` cheaply via docker exec.
    const order = [process.env['BUCKLE_SHELL'], '/bin/zsh', '/bin/bash', '/bin/sh'].filter(
      (s2): s2 is string => Boolean(s2),
    );
    let chosen = shell;
    for (const candidate of order) {
      try {
        await execa('docker', ['exec', id, 'test', '-x', candidate], { stdio: 'pipe' });
        chosen = candidate;
        break;
      } catch {
        continue;
      }
    }
    const args = ['exec', '-it'];
    const dcPath = join(this.opts.workspaceFolder, '.devcontainer', 'devcontainer.json');
    const text = await readTextOrUndefined(dcPath);

    let effectiveUser = opts.user;
    let effectiveWorkdir: string | undefined;

    if (text) {
      try {
        const dc = JSON.parse(text) as { remoteUser?: string; workspaceFolder?: string };
        if (!effectiveUser && typeof dc.remoteUser === 'string' && dc.remoteUser.length > 0) {
          effectiveUser = dc.remoteUser;
        }
        if (typeof dc.workspaceFolder === 'string' && dc.workspaceFolder.length > 0) {
          effectiveWorkdir = dc.workspaceFolder;
        }
      } catch {
        /* ignore parse errors */
      }
    }

    // Fallbacks if not declared in the devcontainer.json.
    // Most buckle templates (via ubuntu-base + common-utils) intend the "vscode" user.
    if (!effectiveUser) effectiveUser = 'vscode';

    if (!effectiveWorkdir) {
      // Try to discover the actual project directory under /workspaces.
      // This helps a lot when people have old/stale devcontainer.json files
      // that still say workspaceFolder: /workspaces.
      try {
        const { stdout } = await execa(
          'docker',
          ['exec', id, 'sh', '-c', 'ls -1 /workspaces 2>/dev/null | head -1'],
          { stdio: 'pipe' }
        );
        const subdir = stdout.trim();
        effectiveWorkdir = subdir ? `/workspaces/${subdir}` : '/workspaces';
      } catch {
        effectiveWorkdir = '/workspaces';
      }
    }

    if (effectiveUser) args.push('-u', effectiveUser);
    if (effectiveWorkdir) args.push('-w', effectiveWorkdir);
    args.push(id, chosen);
    try {
      const proc = await execa('docker', args, { stdio: 'inherit', timeout: 0 });
      return { exitCode: proc.exitCode ?? 0 };
    } catch (e) {
      const ee = e as { exitCode?: number };
      return { exitCode: ee.exitCode ?? 1 };
    }
  }

  /** For `buckle bash` when the user wants to skip docker exec and use devcontainer exec. */
  async devExec(command: string[], opts: { user?: string } = {}): Promise<{ exitCode: number }> {
    await this.docker.assertUp();
    if (!(await devCli.hasDevcontainerCli())) {
      throw new BuckleError(ErrorCode.E_UNSUPPORTED, 'devcontainer CLI is not installed.');
    }
    return devCli.execIn({
      workspaceFolder: this.opts.workspaceFolder,
      command,
      ...(opts.user !== undefined ? { user: opts.user } : {}),
      interactive: true,
      logger: this.opts.logger,
    });
  }

  workspaceLabel(): string {
    return LABEL_LOCAL_FOLDER;
  }
}
