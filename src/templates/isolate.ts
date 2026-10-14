import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

import { slugOrFallback } from '../util/slug.js';
import { dataHome } from '../util/paths.js';
import type { Template } from './schema.js';

export type IsolatedKind = 'claude' | 'grok' | 'gh';

/** Agent config dirs remapped to per-workspace host paths when isolation is on. */
export const AI_HOME_TARGETS: Readonly<Record<string, IsolatedKind>> = {
  '/home/vscode/.claude': 'claude',
  '/home/vscode/.grok': 'grok',
  '/home/vscode/.config/gh': 'gh',
};

/**
 * Sentinel sources used in templates and convenience features.
 * These are not host paths and must be resolved at generate time — copying a
 * template without running buckle cannot bind the developer's ~/.claude or ~/.grok.
 */
export const WORKSPACE_AI_SOURCE: Readonly<Record<IsolatedKind, string>> = {
  claude: 'buckle:workspace/claude',
  grok: 'buckle:workspace/grok',
  gh: 'buckle:workspace/gh',
};

/** Host-home binds. Only emitted when `--share-home` / `isolate: false`. */
export const HOST_AI_SOURCE: Readonly<Record<IsolatedKind, string>> = {
  claude: '${localEnv:HOME}/.claude',
  grok: '${localEnv:HOME}/.grok',
  gh: '${localEnv:HOME}/.config/gh',
};

/** Host git identity — kept even in isolate mode (not skills/config). */
export const GITCONFIG_TARGET = '/home/vscode/.gitconfig';

const KINDS: readonly IsolatedKind[] = ['claude', 'grok', 'gh'];

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

function kindFromSource(source: string): IsolatedKind | undefined {
  for (const kind of KINDS) {
    if (source === WORKSPACE_AI_SOURCE[kind] || source === HOST_AI_SOURCE[kind]) return kind;
  }
  // Already a per-workspace bind — leave kind detection to the target.
  if (source.includes('/buckle/workspaces/')) return undefined;
  if (/(?:\$\{(?:localEnv:)?HOME\}|~)\/\.claude$/.test(source) || /\/\.claude$/.test(source)) {
    return 'claude';
  }
  if (/(?:\$\{(?:localEnv:)?HOME\}|~)\/\.grok$/.test(source) || /\/\.grok$/.test(source)) {
    return 'grok';
  }
  if (/\/\.config\/gh$/.test(source)) {
    return 'gh';
  }
  return undefined;
}

export function aiHomeKindForMount(source: string, target: string): IsolatedKind | undefined {
  return AI_HOME_TARGETS[target] ?? kindFromSource(source);
}

function desiredSource(cwd: string, kind: IsolatedKind, isolate: boolean): string {
  return isolate ? isolatedMountSource(cwd, kind) : HOST_AI_SOURCE[kind];
}

/**
 * Resolve AI home bind-mounts.
 *
 * Templates and the grok / gh features declare `buckle:workspace/{claude,grok,gh}` (never
 * host ~/.claude / ~/.grok / ~/.config/gh). Generate-time resolution maps those:
 *   - isolate (default) → $XDG_DATA_HOME/buckle/workspaces/<id>/{claude,grok,gh}
 *   - --share-home      → ${localEnv:HOME}/.claude, ${localEnv:HOME}/.grok, ${localEnv:HOME}/.config/gh
 *
 * gh is persisted so a rebuild does not force a fresh `gh auth login`: each login mints a
 * new OAuth token, and GitHub revokes the oldest once a user/app/scope has more than 10.
 *
 * Legacy templates that still bind host home are remapped the same way, so a missed
 * sentinel still cannot leak agent state when isolation is on.
 *
 * gitconfig stays on the host (identity, not agent state).
 */
export function resolveAiHomeMounts(t: Template, cwd: string, isolate: boolean): Template {
  if (!t.mounts || t.mounts.length === 0) return t;
  let changed = false;
  const mounts = t.mounts.map((m) => {
    const kind = aiHomeKindForMount(m.source, m.target);
    if (!kind) return m;
    const source = desiredSource(cwd, kind, isolate);
    if (m.source === source && (m.type ?? 'bind') === 'bind') return m;
    changed = true;
    return { ...m, source, type: 'bind' as const };
  });
  return changed ? { ...t, mounts } : t;
}

/** Isolate-mode wrapper: remap AI homes onto per-workspace paths. */
export function isolateHomeMounts(t: Template, cwd: string): Template {
  return resolveAiHomeMounts(t, cwd, true);
}

/** Drop well-known host-home mounts entirely (legacy `--isolate` strip). Kept for tests. */
export function stripHomeMounts(t: Template): Template {
  if (!t.mounts || t.mounts.length === 0) return t;
  const drop = new Set([...Object.keys(AI_HOME_TARGETS), GITCONFIG_TARGET]);
  const filtered = t.mounts.filter((m) => !drop.has(m.target));
  if (filtered.length === t.mounts.length) return t;
  return { ...t, mounts: filtered };
}
