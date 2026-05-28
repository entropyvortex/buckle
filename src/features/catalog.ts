import type { Template } from '../templates/schema.js';

/**
 * The Buckle convenience-feature catalog.
 *
 * Each feature is a function that takes its argument (e.g. "20" for `node:20`) and emits a
 * partial Template patch which is merged into the resolved template before generation. This is
 * sugar — it always lowers to native devcontainer features + hooks + env + mounts.
 *
 * Adding a feature: register it here, document it in README, add a test in test/unit/features.
 */

export type FeaturePatch = Partial<Template>;

export type FeatureFn = (arg: string | undefined) => FeaturePatch;

const NATIVE = (id: string, opts: Record<string, unknown> = {}): FeaturePatch => ({
  nativeFeatures: { [id]: Object.keys(opts).length === 0 ? {} : opts },
});

function deepMergePatch(a: FeaturePatch, b: FeaturePatch): FeaturePatch {
  // local minimal merge, mirrors resolver semantics for arrays-append/objects-merge.
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const existing = out[k];
    if (Array.isArray(existing) && Array.isArray(v)) out[k] = [...existing, ...v];
    else if (existing && typeof existing === 'object' && v && typeof v === 'object' && !Array.isArray(v))
      out[k] = deepMergePatch(existing as FeaturePatch, v as FeaturePatch);
    else out[k] = v;
  }
  return out as FeaturePatch;
}

const CATALOG: Record<string, FeatureFn> = {
  // Docker outside docker — mounts host docker.sock, installs `docker` CLI in container.
  dod: () =>
    deepMergePatch(NATIVE('ghcr.io/devcontainers/features/docker-outside-of-docker:1', { moby: true }), {
      mounts: [
        {
          source: '/var/run/docker.sock',
          target: '/var/run/docker.sock',
          type: 'bind',
        },
      ],
    }),

  // Docker in docker — privileged, dockerd inside the container.
  dind: () =>
    deepMergePatch(NATIVE('ghcr.io/devcontainers/features/docker-in-docker:2', { moby: true }), {
      runArgs: ['--privileged'],
    }),

  // GitHub CLI feature.
  gh: () => NATIVE('ghcr.io/devcontainers/features/github-cli:1'),

  // Bind-mount the host gitconfig read-only into the container so signing / user.email work.
  'git-config': () => ({
    mounts: [
      {
        source: '${localEnv:HOME}/.gitconfig',
        target: '/home/vscode/.gitconfig',
        type: 'bind',
        readOnly: true,
      },
    ],
  }),

  aws: () => NATIVE('ghcr.io/devcontainers/features/aws-cli:1'),
  gcloud: () => NATIVE('ghcr.io/devcontainers/features/gcloud:1'),
  kube: () => NATIVE('ghcr.io/devcontainers/features/kubectl-helm-minikube:1'),
  terraform: () => NATIVE('ghcr.io/devcontainers/features/terraform:1'),

  node: (arg) =>
    NATIVE('ghcr.io/devcontainers/features/node:1', arg ? { version: arg } : { version: 'lts' }),
  python: (arg) =>
    NATIVE('ghcr.io/devcontainers/features/python:1', arg ? { version: arg } : { version: '3.12' }),
  rust: (arg) =>
    NATIVE('ghcr.io/devcontainers/features/rust:1', arg ? { version: arg } : { version: 'latest' }),
  go: (arg) =>
    NATIVE('ghcr.io/devcontainers/features/go:1', arg ? { version: arg } : { version: 'latest' }),
  java: (arg) =>
    NATIVE('ghcr.io/devcontainers/features/java:1', arg ? { version: arg } : { version: '21' }),

  // Claude Code: use the official installer (not the old npm package).
  // https://claude.ai/install
  // We run it directly (as root, during postCreate). This avoids all sudo/su
  // permission and password issues across different base images and sudoers setups.
  // Users who want the tools installed as the non-root user can override in their
  // own template.
  'claude-code': () => ({
    lifecycle: {
      postCreate: ['curl -fsSL https://claude.ai/install.sh | bash'],
    },
    env: {
      CLAUDE_CONFIG_DIR: '/home/vscode/.claude',
    },
  }),

  // Grok Build (xAI CLI / agentic coding TUI): use the official installer.
  // https://x.ai/cli
  // Mounts ~/.grok for auth.json, skills, config, completions, etc.
  // Supports optional version pinning: --feature grok:0.2.3
  grok: makeGrokFeature,

  // Alias for clarity / marketing
  'grok-build': makeGrokFeature,
};

/** Shared implementation for both `grok` and `grok-build` */
function makeGrokFeature(arg: string | undefined): FeaturePatch {
  const inner = arg
    ? `curl -fsSL https://x.ai/cli/install.sh | bash -s ${arg}`
    : 'curl -fsSL https://x.ai/cli/install.sh | bash';
  // Run the official installer directly (as root during postCreate).
  // Avoids sudo/su permission issues entirely.
  const wrapped = inner;

  return {
    lifecycle: {
      postCreate: [wrapped],
    },
    mounts: [
      {
        source: '${localEnv:HOME}/.grok',
        target: '/home/vscode/.grok',
        type: 'bind',
      },
    ],
    // The official installer writes the binary to ~/.grok/bin and also:
    // - symlinks it into the first of ~/.local/bin or /usr/local/bin that is writable + on PATH
    // - appends the PATH export (plus completions) to the user's shell rc files (~/.bashrc etc.)
    // We rely on those mechanisms. A containerEnv PATH prefix here previously caused
    // the initial devcontainer probe ("sleep: not found") on macOS arm64 because the
    // ${containerEnv:PATH} reference was not expanded in the CLI's raw docker-run test.
  };
}


/** Register an MCP server feature dynamically: `mcp:<name>`. */
function mcpFeature(name: string): FeaturePatch {
  // We register the install via npm globally, then leave configuration to the user.
  // (MCP wiring lives in ~/.claude or shell config; we don't presume.)
  const pkg = name.startsWith('@') ? name : `@modelcontextprotocol/server-${name}`;
  return {
    lifecycle: {
      postCreate: [`npm install -g ${pkg} || true`],
    },
  };
}

export interface FeatureSpec {
  name: string;
  arg?: string;
  raw: string;
}

/**
 * Parse a feature string into `{ name, arg }`. Recognized shapes:
 *   `node`               → { name: "node" }
 *   `node:20`            → { name: "node", arg: "20" }
 *   `node=20`            → { name: "node", arg: "20" }
 *   `mcp:filesystem`     → { name: "mcp:filesystem" }
 *   `mcp:foo:1.2`        → { name: "mcp:foo", arg: "1.2" }
 *   `ghcr.io/devcontainers/features/python:1` → { name: <whole> }   (passthrough)
 */
export function parseFeatureSpec(input: string): FeatureSpec {
  if (!input) throw new Error('empty feature spec');
  if (input.startsWith('ghcr.io/')) return { name: input, raw: input };
  if (input.startsWith('mcp:')) {
    const rest = input.slice(4);
    const idx = rest.indexOf(':');
    if (idx > 0) return { name: 'mcp:' + rest.slice(0, idx), arg: rest.slice(idx + 1), raw: input };
    return { name: input, raw: input };
  }
  const m = /^([a-zA-Z0-9_./-]+)(?:[:=](.+))?$/.exec(input);
  if (!m) throw new Error(`invalid feature spec: ${input}`);
  const out: FeatureSpec = { name: m[1]!, raw: input };
  if (m[2] !== undefined) out.arg = m[2];
  return out;
}

export function isKnownFeature(raw: string): boolean {
  let spec: FeatureSpec;
  try {
    spec = parseFeatureSpec(raw);
  } catch {
    return false;
  }
  if (spec.name.startsWith('ghcr.io/')) return true;
  if (spec.name.startsWith('mcp:')) return true;
  return spec.name in CATALOG;
}

export function compileFeature(spec: FeatureSpec): FeaturePatch {
  if (spec.name.startsWith('ghcr.io/')) {
    return NATIVE(spec.name);
  }
  if (spec.name.startsWith('mcp:')) {
    return mcpFeature(spec.name.slice(4));
  }
  const fn = CATALOG[spec.name];
  if (!fn) {
    throw new Error(`unknown feature: ${spec.name}`);
  }
  return fn(spec.arg);
}

export function listFeatures(): { name: string; description: string }[] {
  return [
    { name: 'dod', description: 'Docker outside docker (mount host socket)' },
    { name: 'dind', description: 'Docker in docker (privileged dockerd)' },
    { name: 'gh', description: 'GitHub CLI' },
    { name: 'git-config', description: 'Bind-mount host ~/.gitconfig read-only' },
    { name: 'claude-code', description: 'Install Claude Code CLI; mount ~/.claude (pairs excellently with grok)' },
    { name: 'grok', description: 'Install Grok Build (xAI); mount ~/.grok (pairs excellently with claude-code)' },
    { name: 'grok-build', description: 'Alias for grok' },
    { name: 'mcp:<name>', description: 'Install an MCP server (filesystem, github, …)' },
    { name: 'aws', description: 'AWS CLI v2' },
    { name: 'gcloud', description: 'Google Cloud SDK' },
    { name: 'kube', description: 'kubectl + helm + minikube' },
    { name: 'terraform', description: 'Terraform CLI' },
    { name: 'node[:version]', description: 'Node.js (default: lts)' },
    { name: 'python[:version]', description: 'Python (default: 3.12)' },
    { name: 'go[:version]', description: 'Go (default: latest)' },
    { name: 'rust[:version]', description: 'Rust (default: latest)' },
    { name: 'java[:version]', description: 'OpenJDK (default: 21)' },
  ];
}

export const __TEST__ = { CATALOG, mcpFeature };
