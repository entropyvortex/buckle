/** `buckle doctor` — environment and configuration sanity checks. */
import { join } from 'node:path';

import { execa } from 'execa';

import { DockerCli } from '../../docker/inspect.js';
import { hasDevcontainerCli } from '../../docker/devcontainer-cli.js';
import { exists } from '../../util/fs.js';
import { bucklePaths } from '../../util/paths.js';
import { styles } from '../../util/log.js';
import type { CliContext } from '../context.js';
import { emit, jsonOk } from '../json-out.js';

export interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function runDoctor(ctx: CliContext): Promise<number> {
  const checks: Check[] = [];

  const docker = new DockerCli({ soft: true });
  const dockerOk = await docker.ping();
  checks.push({
    name: 'docker.daemon',
    status: dockerOk ? 'pass' : 'fail',
    message: dockerOk ? 'docker daemon reachable' : 'docker daemon not reachable',
  });

  // Detect actual container runtime (Docker vs Podman via compat socket).
  // This directly addresses previous over-optimistic "just works" claims.
  if (dockerOk) {
    try {
      const ver = await execa('docker', ['--version'], { stdio: 'pipe', timeout: 3000 });
      const out = ver.stdout.toLowerCase();
      const isPodman = out.includes('podman');
      const isDocker = out.includes('docker');
      const label = isPodman ? 'podman (docker compat)' : isDocker ? 'docker' : 'unknown';
      checks.push({
        name: 'container.runtime',
        status: isPodman ? 'warn' : 'pass',
        message: `${label} — ${ver.stdout.trim()}`,
      });
    } catch {
      checks.push({
        name: 'container.runtime',
        status: 'warn',
        message: 'docker --version failed (unusual)',
      });
    }
  }

  const devOk = await hasDevcontainerCli();
  checks.push({
    name: 'devcontainer.cli',
    status: devOk ? 'pass' : 'warn',
    message: devOk
      ? '@devcontainers/cli is on PATH'
      : 'install @devcontainers/cli for full feature/lifecycle support: npm i -g @devcontainers/cli',
  });

  const paths = bucklePaths();
  for (const p of [paths.configRoot, paths.templatesRoot]) {
    const ok = await exists(p);
    checks.push({
      name: `path.${p.replace(paths.configRoot, '$config')}`,
      status: ok ? 'pass' : 'warn',
      message: ok ? `${p} exists` : `${p} does not exist (will be created on first use)`,
    });
  }

  const cwdDc = await exists(join(ctx.cwd, '.devcontainer/devcontainer.json'));
  checks.push({
    name: 'workspace.devcontainer',
    status: cwdDc ? 'pass' : 'warn',
    message: cwdDc ? '.devcontainer/devcontainer.json present' : 'no .devcontainer in this folder (run `buckle <template>`)',
  });

  // Surface unresolved git status (used to feed --git-init hint).
  const gitOk = await exists(join(ctx.cwd, '.git'));
  checks.push({
    name: 'workspace.git',
    status: gitOk ? 'pass' : 'warn',
    message: gitOk ? '.git/ present' : 'not a git repo (devcontainer mounts may behave unexpectedly)',
  });

  // Probe BuildKit availability.
  try {
    const r = await execa('docker', ['buildx', 'version'], { stdio: 'pipe', timeout: 3000 });
    checks.push({ name: 'docker.buildx', status: 'pass', message: r.stdout.split('\n')[0] ?? 'ok' });
  } catch {
    checks.push({ name: 'docker.buildx', status: 'warn', message: 'docker buildx not available' });
  }

  const overall = checks.some((c) => c.status === 'fail')
    ? 'broken'
    : checks.some((c) => c.status === 'warn')
      ? 'degraded'
      : 'healthy';

  if (ctx.flags.json) {
    emit(jsonOk({ checks, overall }, ctx.cwd));
    return overall === 'broken' ? 1 : 0;
  }
  for (const c of checks) {
    const tag =
      c.status === 'pass' ? styles.green('PASS') : c.status === 'warn' ? styles.yellow('WARN') : styles.red('FAIL');
    process.stdout.write(`  ${tag}  ${c.name.padEnd(28)} ${c.message}\n`);
  }
  process.stdout.write(`\noverall: ${overall}\n`);
  return overall === 'broken' ? 1 : 0;
}
