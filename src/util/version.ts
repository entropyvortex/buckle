import { createRequire } from 'node:module';

/**
 * Resolve the published package version without baking it into source.
 *
 * `import.meta.url` points at `src/util/version.ts` under vitest and at
 * `dist/index.js` after tsup bundles; we probe both relative layouts and
 * require the name to match so a stray nearby package.json cannot win.
 */
export function packageVersion(): string {
  const req = createRequire(import.meta.url);
  for (const rel of ['../../package.json', '../package.json', './package.json']) {
    try {
      const pkg = req(rel) as { name?: string; version?: string };
      if (pkg.name === 'buckle-cli' && typeof pkg.version === 'string' && pkg.version.length > 0) {
        return pkg.version;
      }
    } catch {
      continue;
    }
  }
  return '0.0.0-dev';
}
