import { z } from 'zod';

/**
 * Buckle template schema (zod).
 *
 * The template is a superset of the devcontainer.json shape with two additions:
 *   1. `extends` for inheritance.
 *   2. A "buckle convenience features" layer (`features` strings like `dod`, `claude-code`,
 *      `mcp:filesystem`) that compile down to native devcontainer features + hooks + env.
 *
 * Source mutex: at most one of `image`, `build`, `compose` may be set on a single template
 * level. Inheritance can override (a child's `image` replaces a parent's `build`).
 */

const _SourceImage = z.object({
  image: z.string().min(1),
});

const SourceBuild = z.object({
  build: z.object({
    dockerfile: z.string().min(1),
    context: z.string().optional(),
    args: z.record(z.string()).optional(),
    target: z.string().optional(),
  }),
});

const SourceCompose = z.object({
  compose: z.object({
    file: z.string().min(1),
    service: z.string().min(1),
    runServices: z.array(z.string()).optional(),
    shutdownAction: z.enum(['none', 'stopCompose', 'stopContainer']).optional(),
  }),
});

const FeatureValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.union([z.string(), z.number(), z.boolean()])),
]);

const FeaturesField = z.array(z.union([z.string(), z.tuple([z.string(), FeatureValue])])).optional();

const LifecycleStep = z.union([
  z.string(),
  z.object({
    command: z.string(),
    user: z.string().optional(),
  }),
]);

export type LifecycleStep = z.infer<typeof LifecycleStep>;

const HookList = z.array(LifecycleStep).optional();

const PortDecl = z.union([
  z.number().int().positive().max(65535),
  z.object({
    port: z.number().int().positive().max(65535),
    label: z.string().optional(),
    onAutoForward: z.enum(['notify', 'openBrowser', 'openPreview', 'silent', 'ignore']).optional(),
  }),
]);

export const MountDecl = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(['bind', 'volume', 'tmpfs']).default('bind'),
  readOnly: z.boolean().optional(),
  consistency: z.enum(['cached', 'delegated', 'consistent']).optional(),
});

export const TemplateSchema = z
  .object({
    /** semver-ish; carried into devcontainer.json metadata. */
    version: z.string().default('0.1.0'),
    /** Display name; the wizard list shows this. */
    name: z.string().min(1).optional(),
    /** Long-form description. */
    description: z.string().optional(),
    /** Inheritance. Single string or ordered MRO array (rightmost wins). */
    extends: z.union([z.string(), z.array(z.string())]).optional(),
    image: z.string().optional(),
    build: SourceBuild.shape.build.optional(),
    compose: SourceCompose.shape.compose.optional(),
    /** Buckle convenience features + native devcontainer features (mixed). */
    features: FeaturesField,
    /** Pass-through native devcontainer features (in case the user wants to be explicit). */
    nativeFeatures: z.record(z.union([z.record(z.unknown()), z.boolean(), z.string()])).optional(),
    forwardPorts: z.array(PortDecl).optional(),
    appPort: z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]).optional(),
    portsAttributes: z.record(z.unknown()).optional(),
    mounts: z.array(MountDecl).optional(),
    env: z.record(z.string()).optional(),
    runArgs: z.array(z.string()).optional(),
    /** devcontainer.json `customizations`, e.g. vscode.extensions / vscode.settings. */
    customizations: z.record(z.unknown()).optional(),
    remoteUser: z.string().optional(),
    containerUser: z.string().optional(),
    workspaceFolder: z.string().optional(),
    workspaceMount: z.string().optional(),
    /** Lifecycle hook lists. Append-merge by default; use the "!replace" sentinel as the
     * first element of a list to fully replace the parent's. */
    lifecycle: z
      .object({
        initialize: HookList,
        onCreate: HookList,
        updateContent: HookList,
        postCreate: HookList,
        postStart: HookList,
        postAttach: HookList,
      })
      .partial()
      .optional(),
    /** A free-form metadata bag the resolver carries through (origin, signature, …). */
    metadata: z
      .object({
        origin: z.string().optional(),
        signature: z.string().optional(),
        builtin: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

export type Template = z.infer<typeof TemplateSchema>;
export type MountDecl = z.infer<typeof MountDecl>;

/** Validate that at most one of `image`, `build`, `compose` is set. */
export function validateSourceMutex(t: Template): string | null {
  const set = [t.image && 'image', t.build && 'build', t.compose && 'compose'].filter(Boolean);
  if (set.length > 1) {
    return `template defines more than one source: ${set.join(', ')} (must be exactly one of image|build|compose)`;
  }
  return null;
}
