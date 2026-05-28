import { applyFeatures } from '../features/compile.js';
import type { LifecycleStep, Template } from '../templates/schema.js';
import { REPLACE_SENTINEL } from '../templates/resolver.js';

/** Home-persisted paths that features and ai-native templates mount from the host for convenience (used by --isolate). */
const HOME_PERSIST_TARGETS = new Set([
  '/home/vscode/.claude',
  '/home/vscode/.grok',
  '/home/vscode/.gitconfig',
]);

/**
 * Strip the well-known host-home bind mounts (used for --isolate).
 * Safe to call on merged template before or after feature expansion.
 */
export function stripHomeMounts(t: Template): Template {
  if (!t.mounts || t.mounts.length === 0) return t;
  const filtered = t.mounts.filter((m) => !HOME_PERSIST_TARGETS.has(m.target));
  if (filtered.length === t.mounts.length) return t;
  return { ...t, mounts: filtered };
}

/**
 * Devcontainer.json shape we emit. We use a permissive type — the spec keeps growing — but
 * we control the keys we set.
 */
export interface Devcontainer {
  name?: string;
  image?: string;
  build?: { dockerfile: string; context?: string; args?: Record<string, string>; target?: string };
  dockerComposeFile?: string;
  service?: string;
  runServices?: string[];
  shutdownAction?: string;
  features?: Record<string, unknown>;
  forwardPorts?: (number | { port: number })[];
  appPort?: number | string | (number | string)[];
  portsAttributes?: Record<string, unknown>;
  mounts?: string[];
  containerEnv?: Record<string, string>;
  remoteEnv?: Record<string, string>;
  runArgs?: string[];
  customizations?: Record<string, unknown>;
  remoteUser?: string;
  containerUser?: string;
  workspaceFolder?: string;
  workspaceMount?: string;
  // Lifecycle commands accept string (shell) | string[] | object form per spec.
  // We prefer a single string (joined with &&) for reliability with complex commands
  // containing sudo, pipes, etc.
  initializeCommand?: string | string[] | Record<string, unknown>;
  onCreateCommand?: string | string[] | Record<string, unknown>;
  updateContentCommand?: string | string[] | Record<string, unknown>;
  postCreateCommand?: string | string[] | Record<string, unknown>;
  postStartCommand?: string | string[] | Record<string, unknown>;
  postAttachCommand?: string | string[] | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

type LifecycleInput = LifecycleStep[] | undefined;

// Lifecycle hooks are emitted as a single flat string joined with `&&`. Steps that
// declare a per-step `user:` have it folded away — the entire hook runs as the
// template's `remoteUser` (vscode in every buckle built-in). The richer object-form
// with embedded `{ command, user }` is not part of the devcontainer JSON spec for
// named-object hooks and crashes @devcontainers/cli with "a.join is not a function".
function buildLifecycleSection(steps: LifecycleInput): string | undefined {
  if (!steps || steps.length === 0) return undefined;
  const commands: string[] = [];
  for (const s of steps) {
    if (typeof s === 'string') {
      if (s === REPLACE_SENTINEL) continue;
      commands.push(s);
    } else if (s.command) {
      commands.push(s.command);
    }
  }
  const joined = commands.join(' && ');
  return joined.length > 0 ? joined : undefined;
}

function mountToString(m: NonNullable<Template['mounts']>[number]): string {
  // Devcontainer.json accepts a "long-syntax" object OR a string; we emit string because more
  // tooling supports it consistently across versions.
  const parts = [`source=${m.source}`, `target=${m.target}`, `type=${m.type ?? 'bind'}`];
  if (m.readOnly) parts.push('readonly');
  if (m.consistency) parts.push(`consistency=${m.consistency}`);
  return parts.join(',');
}

function ports(t: Template): (number | { port: number })[] | undefined {
  if (!t.forwardPorts || t.forwardPorts.length === 0) return undefined;
  return t.forwardPorts.map((p) => (typeof p === 'number' ? p : { port: p.port }));
}

export interface BuildDevcontainerOptions {
  /**
   * When true, omit the well-known host home bind mounts **and** the associated
   * containerEnv entries (CLAUDE_CONFIG_DIR) for full isolation.
   * This can still be useful on first creation on macOS arm64 if the bind mounts
   * themselves cause early startup friction with the devcontainers/base image.
   */
  isolate?: boolean;
}

/**
 * Compile a fully-merged Template into a Devcontainer record. Pure: no I/O.
 */
export function buildDevcontainer(
  input: Template,
  projectName: string,
  opts: BuildDevcontainerOptions = {},
): Devcontainer {
  // Apply convenience-features → nativeFeatures + hooks/mounts/env.
  let t = applyFeatures(input);
  if (opts.isolate) {
    t = stripHomeMounts(t);

    // Drop the AI config env var for full isolation (the grok PATH prefix that used
    // to be injected is no longer present; this also cleans up old generated files).
    if (t.env) {
      delete t.env['CLAUDE_CONFIG_DIR'];
      const pathVal = t.env['PATH'];
      if (typeof pathVal === 'string' && pathVal.includes('/home/vscode/.grok/bin')) {
        delete t.env['PATH'];
      }
    }
  }
  const dc: Devcontainer = {
    name: t.name ?? projectName,
  };

  // Source mutex was validated in the resolver — we trust at most one is present.
  if (t.image) dc.image = t.image;
  if (t.build) {
    const build: Devcontainer['build'] = { dockerfile: t.build.dockerfile };
    if (t.build.context !== undefined) build!.context = t.build.context;
    if (t.build.args !== undefined) build!.args = t.build.args;
    if (t.build.target !== undefined) build!.target = t.build.target;
    dc.build = build;
  }
  if (t.compose) {
    dc.dockerComposeFile = t.compose.file;
    dc.service = t.compose.service;
    if (t.compose.runServices) dc.runServices = t.compose.runServices;
    if (t.compose.shutdownAction) dc.shutdownAction = t.compose.shutdownAction;
  }

  if (t.nativeFeatures && Object.keys(t.nativeFeatures).length > 0) {
    dc.features = t.nativeFeatures as Record<string, unknown>;
  }

  const fp = ports(t);
  if (fp) dc.forwardPorts = fp;
  if (t.appPort !== undefined) dc.appPort = t.appPort;
  if (t.portsAttributes) dc.portsAttributes = t.portsAttributes;

  if (t.mounts && t.mounts.length > 0) {
    // Dedup mounts by `target` (later wins) — features and templates can both wire the same path.
    const byTarget = new Map<string, NonNullable<Template['mounts']>[number]>();
    for (const m of t.mounts) byTarget.set(m.target, m);
    dc.mounts = [...byTarget.values()].map(mountToString);
  }
  if (t.env && Object.keys(t.env).length > 0) {
    // Deterministic env order (sorted keys) so the emitted JSON diffs cleanly between runs.
    const sorted: Record<string, string> = {};
    for (const k of Object.keys(t.env).sort()) sorted[k] = t.env[k]!;
    dc.containerEnv = sorted;
  }
  if (t.runArgs && t.runArgs.length > 0) dc.runArgs = t.runArgs;
  if (t.customizations) dc.customizations = t.customizations;
  if (t.remoteUser) dc.remoteUser = t.remoteUser;
  if (t.containerUser) dc.containerUser = t.containerUser;
  if (t.workspaceFolder) dc.workspaceFolder = t.workspaceFolder;
  if (t.workspaceMount) dc.workspaceMount = t.workspaceMount;

  const lc = t.lifecycle ?? {};
  const initCmd = buildLifecycleSection(lc.initialize);
  if (initCmd) dc.initializeCommand = initCmd;
  const onCreateCmd = buildLifecycleSection(lc.onCreate);
  if (onCreateCmd) dc.onCreateCommand = onCreateCmd;
  const updateCmd = buildLifecycleSection(lc.updateContent);
  if (updateCmd) dc.updateContentCommand = updateCmd;
  const postCreateCmd = buildLifecycleSection(lc.postCreate);
  if (postCreateCmd) dc.postCreateCommand = postCreateCmd;
  const postStartCmd = buildLifecycleSection(lc.postStart);
  if (postStartCmd) dc.postStartCommand = postStartCmd;
  const postAttachCmd = buildLifecycleSection(lc.postAttach);
  if (postAttachCmd) dc.postAttachCommand = postAttachCmd;

  dc.metadata = {
    'buckle.template': t.name ?? projectName,
    'buckle.version': t.version,
    ...(t.metadata ? { 'buckle.origin': t.metadata.origin } : {}),
  };

  return dc;
}

/**
 * Serialize a Devcontainer into a deterministic JSON string with a top banner. Keys are sorted
 * for stable diffs.
 */
export function serializeDevcontainer(dc: Devcontainer): string {
  const banner =
    '// Generated by buckle <https://github.com/buckle-dev/buckle>. Edit your template, not this file.\n';
  return banner + JSON.stringify(sortKeys(dc), null, 2) + '\n';
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted as unknown as T;
  }
  return value;
}
