/**
 * `buckle install <origin>` implementation. Supports:
 *   - gh:user/repo[/path][#ref]
 *   - gl:user/repo[/path][#ref]
 *   - https://example.com/path/to/repo.git[#ref]
 *   - file:///abs/path
 *
 * Templates are stored under `~/.config/buckle/templates/_installed/<origin-hash>/<template-name>/`.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';

import { BuckleError, ErrorCode } from '../util/errors.js';
import { exists } from '../util/fs.js';
import type { Logger } from '../util/log.js';
import { bucklePaths } from '../util/paths.js';

export interface ParsedOrigin {
  kind: 'git';
  url: string;
  ref?: string;
  path?: string;
  hashKey: string;
}

export function parseOrigin(input: string): ParsedOrigin {
  // Strip trailing slash.
  const raw = input.replace(/\/+$/, '');
  let ref: string | undefined;
  let urlPart = raw;
  const hashIdx = raw.indexOf('#');
  if (hashIdx >= 0) {
    ref = raw.slice(hashIdx + 1);
    urlPart = raw.slice(0, hashIdx);
  }

  let url: string;
  let path: string | undefined;
  if (urlPart.startsWith('gh:')) {
    const rest = urlPart.slice('gh:'.length);
    const slash3 = rest.indexOf('/', rest.indexOf('/') + 1);
    if (slash3 >= 0) {
      url = `https://github.com/${rest.slice(0, slash3)}.git`;
      path = rest.slice(slash3 + 1);
    } else {
      url = `https://github.com/${rest}.git`;
    }
  } else if (urlPart.startsWith('gl:')) {
    const rest = urlPart.slice('gl:'.length);
    const slash3 = rest.indexOf('/', rest.indexOf('/') + 1);
    if (slash3 >= 0) {
      url = `https://gitlab.com/${rest.slice(0, slash3)}.git`;
      path = rest.slice(slash3 + 1);
    } else {
      url = `https://gitlab.com/${rest}.git`;
    }
  } else if (urlPart.startsWith('https://') || urlPart.startsWith('http://') || urlPart.startsWith('git@') || urlPart.startsWith('ssh://')) {
    url = urlPart;
  } else if (urlPart.startsWith('file://')) {
    url = urlPart;
  } else {
    throw new BuckleError(
      ErrorCode.E_INSTALL_FAILED,
      `unrecognized origin format: ${input}`,
      'use gh:user/repo, gl:user/repo, https://…/foo.git, or file:///path',
    );
  }
  const hashKey = createHash('sha256')
    .update([url, ref ?? '', path ?? ''].join('|'))
    .digest('hex')
    .slice(0, 16);
  const out: ParsedOrigin = { kind: 'git', url, hashKey };
  if (ref !== undefined) out.ref = ref;
  if (path !== undefined) out.path = path;
  return out;
}

export interface InstallResult {
  origin: ParsedOrigin;
  installedPath: string;
  templateName: string;
}

export async function install(
  input: string,
  opts: { logger: Logger; force?: boolean } = { logger: { info() {}, warn() {}, error() {}, success() {}, debug() {}, line() {}, raw() {} } as unknown as Logger },
): Promise<InstallResult> {
  const origin = parseOrigin(input);
  const dest = join(bucklePaths().installedRoot, origin.hashKey);
  if ((await exists(dest)) && !opts.force) {
    opts.logger.info(`origin already installed at ${dest}`);
  } else {
    if (await exists(dest)) await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    if (origin.url.startsWith('file://')) {
      const src = origin.url.slice('file://'.length);
      await execa('cp', ['-R', src + '/.', dest]);
    } else {
      const cloneArgs = ['clone', '--depth', '1'];
      if (origin.ref) cloneArgs.push('--branch', origin.ref);
      cloneArgs.push(origin.url, dest);
      try {
        await execa('git', cloneArgs, { stdio: 'pipe', timeout: 120_000 });
      } catch (e) {
        throw new BuckleError(
          ErrorCode.E_INSTALL_FAILED,
          `git clone failed for ${origin.url}: ${(e as Error).message}`,
        );
      }
    }
  }
  // Locate a template.yaml under (path or root).
  const baseDir = origin.path ? join(dest, origin.path) : dest;
  const tplYaml = join(baseDir, 'template.yaml');
  if (!(await exists(tplYaml))) {
    throw new BuckleError(
      ErrorCode.E_INSTALL_FAILED,
      `no template.yaml found at ${baseDir}`,
      'point the origin at a directory that contains a template.yaml',
    );
  }
  // Schema-validate before we accept the install — we want install-time errors, not first-up.
  const { validateFile } = await import('../templates/loader.js');
  await validateFile(tplYaml);
  const templateName = (origin.path ? origin.path.split('/').pop() : input.split('/').pop()) ?? 'installed';
  return { origin, installedPath: baseDir, templateName };
}

export async function uninstall(name: string, _opts: { logger: Logger }): Promise<void> {
  const root = bucklePaths().installedRoot;
  if (!(await exists(root))) {
    throw new BuckleError(ErrorCode.E_TEMPLATE_NOT_FOUND, `installed template "${name}" not found`);
  }
  // Find any installed dir whose subdir matches `name`; remove it.
  const { readdir, rm: rmFn } = await import('node:fs/promises');
  for (const ent of await readdir(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const sub = join(root, ent.name);
    for (const t of await readdir(sub, { withFileTypes: true })) {
      if (t.isDirectory() && t.name === name) {
        await rmFn(join(sub, t.name), { recursive: true, force: true });
        return;
      }
    }
  }
  throw new BuckleError(ErrorCode.E_TEMPLATE_NOT_FOUND, `installed template "${name}" not found`);
}
