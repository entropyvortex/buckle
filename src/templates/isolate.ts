import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

import { slugOrFallback } from '../util/slug.js';
import { dataHome } from '../util/paths.js';
import type { Template } from './schema.js';

/** Agent config dirs remapped to per-workspace host paths when isolation is on. */
export const AI_HOME_TARGETS: Readonly<Record<string, 'claude' | 'grok'>> = {
  '/home/vscode/.claude': 'claude',
  '/home/vscode/.grok': 'grok',
};

/** Host git identity — kept even in isolate mode (not skills/config). */
export const GITCONFIG_TARGET = '/home/vscode/.gitconfig';

export type IsolatedKind = 'claude' | 'grok';

/**
 * Stable per-workspace directory under XDG data home.
 * Basename + path hash so two checkouts named "app" do not collide.
 */
export function workspaceStateId(cwd: string): string {
  const base = slugOrFallback(basename(cwd), 'workspace', 24);
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

export function workspaceStateRoot(): string {
  if (process.env['BUCKLE_STATE_DIR'] && process.env['BUCKLE_STATE_DIR'].length > 0) {
    return process.env['BUCKLE_STATE_DIR'];
  }
  return join(dataHome(), 'buckle', 'workspaces');
}

export function workspaceStateDir(cwd: string): string {
  return join(workspaceStateRoot(), workspaceStateId(cwd));
}

export function isolatedMountSource(cwd: string, kind: IsolatedKind): string {
  return join(workspaceStateDir(cwd), kind);
}

/**
 * Rewrite AI home bind-mounts so each workspace gets its own skills/config
 * instead of sharing the developer's ~/.claude and ~/.grok.
 *
 * gitconfig stays on the host (identity, not agent state).
 */
export function isolateHomeMounts(t: Template, cwd: string): Template {
  if (!t.mounts || t.mounts.length === 0) return t;
  const mounts = t.mounts.map((m) => {
    const kind = AI_HOME_TARGETS[m.target];
    if (!kind) return m;
    return { ...m, source: isolatedMountSource(cwd, kind), type: 'bind' as const };
  });
  return { ...t, mounts };
}

/** Drop well-known host-home mounts entirely (legacy `--isolate` strip). Kept for tests. */
export function stripHomeMounts(t: Template): Template {
  if (!t.mounts || t.mounts.length === 0) return t;
  const drop = new Set([...Object.keys(AI_HOME_TARGETS), GITCONFIG_TARGET]);
  const filtered = t.mounts.filter((m) => !drop.has(m.target));
  if (filtered.length === t.mounts.length) return t;
  return { ...t, mounts: filtered };
}
