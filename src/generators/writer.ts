import { join } from 'node:path';

import type { Template } from '../templates/schema.js';
import { exists, readText, writeTextAtomic } from '../util/fs.js';
import { renderCompose } from './compose.js';
import { buildDevcontainer, serializeDevcontainer } from './devcontainer.js';
import { renderDockerfile } from './dockerfile.js';

export interface RenderPlan {
  files: { path: string; contents: string; existed: boolean; changed: boolean }[];
  /** Non-fatal guidance surfaced to the user during render (e.g. compose + dind warnings). */
  warnings?: string[] | undefined;
}

export interface RenderOptions {
  cwd: string;
  /** Project name (used for the devcontainer `name` if the template doesn't set one). */
  projectName: string;
  /** Default base image when generating a fresh Dockerfile. */
  defaultBaseImage?: string;
  /** Isolation flag: drop host home mounts (and related env) for first-creation troubleshooting. */
  isolate?: boolean;
}

/**
 * Compute what would be written for the given merged template. Pure with respect to FS state
 * we read for "existed/changed" classification — but never writes.
 */
export async function plan(t: Template, opts: RenderOptions): Promise<RenderPlan> {
  const dcDir = join(opts.cwd, '.devcontainer');
  const files: RenderPlan['files'] = [];

  const dc = buildDevcontainer(t, opts.projectName, {
    ...(opts.isolate ? { isolate: true } : {}),
  });
  const dcJson = serializeDevcontainer(dc);
  const dcPath = join(dcDir, 'devcontainer.json');
  files.push(await classify(dcPath, dcJson));

  if (t.build) {
    const dockerfilePath = join(dcDir, t.build.dockerfile);
    if (!(await exists(dockerfilePath))) {
      const baseImage = t.image ?? opts.defaultBaseImage ?? 'mcr.microsoft.com/devcontainers/base:ubuntu';
      const contents = renderDockerfile(t, baseImage);
      files.push(await classify(dockerfilePath, contents));
    }
  }

  if (t.compose) {
    const composePath = join(dcDir, t.compose.file);
    if (!(await exists(composePath))) {
      files.push(await classify(composePath, renderCompose(t)));
    }
  }

  // Compose guardrails — surfaced to the user so they understand the trade-offs.
  const warnings: string[] = [];
  if (t.compose) {
    const features = (t.features ?? []).map((f) => (typeof f === 'string' ? f : f[0]));
    if (features.includes('dind')) {
      warnings.push('compose + dind: docker-in-docker runs inside the primary service container. Multi-service setups may need privileged service definitions in your compose file.');
    }
    if (features.includes('dod')) {
      warnings.push('compose + dod: docker-outside-of-docker mounts the host socket. Only the primary service will see it unless you duplicate the mount in your compose file.');
    }
    if (t.remoteUser && t.containerUser && t.remoteUser !== t.containerUser) {
      warnings.push('compose: remoteUser and containerUser differ — compose will use the resolved user for the service.');
    }
  }

  return { files, warnings: warnings.length > 0 ? warnings : undefined };
}

async function classify(path: string, next: string): Promise<RenderPlan['files'][number]> {
  if (!(await exists(path))) return { path, contents: next, existed: false, changed: true };
  const cur = await readText(path);
  return { path, contents: next, existed: true, changed: cur !== next };
}

export async function applyPlan(p: RenderPlan): Promise<void> {
  for (const f of p.files) {
    if (!f.changed) continue;
    await writeTextAtomic(f.path, f.contents);
  }
}

/** Compact human-readable diff for the CLI/TUI: counts lines added/removed per file. */
export function summarizePlan(p: RenderPlan): { path: string; status: 'created' | 'updated' | 'unchanged' }[] {
  return p.files.map((f) => ({
    path: f.path,
    status: !f.existed ? 'created' : f.changed ? 'updated' : 'unchanged',
  }));
}

/**
 * Render a unified-ish diff for a plan, suitable for `--preview`. Omits unchanged files.
 * Includes any guardrail warnings at the top when present.
 */
export function renderDiff(p: RenderPlan): string {
  const out: string[] = [];
  if (p.warnings && p.warnings.length > 0) {
    out.push('# Warnings from buckle:');
    for (const w of p.warnings) out.push(`#  - ${w}`);
    out.push('');
  }
  for (const f of p.files) {
    if (!f.changed) continue;
    out.push(`--- ${f.path} ${f.existed ? '(updated)' : '(created)'}`);
    const next = f.contents.split('\n');
    for (const line of next) out.push(`+ ${line}`);
    out.push('');
  }
  return out.join('\n');
}
