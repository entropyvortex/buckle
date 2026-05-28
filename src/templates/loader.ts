import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { BuckleError, ErrorCode } from '../util/errors.js';
import { exists, isDir, isFile, readText } from '../util/fs.js';
import { bucklePaths } from '../util/paths.js';
import { TemplateSchema, type Template } from './schema.js';

export interface TemplateRecord {
  /** unqualified name */
  name: string;
  /** raw, unmerged template */
  raw: Template;
  /** absolute path of the source file */
  path: string;
  /** classification */
  origin: 'builtin' | 'user' | 'installed';
  /** for installed templates, the install origin URL */
  installOrigin?: string;
}

/** Locate the directory containing the bundled built-in templates. */
export function builtinDir(): string {
  // Resolution order, first existing wins:
  //   1. $BUCKLE_BUILTIN_DIR (tests / power users)
  //   2. <here>/builtin           (src/templates/builtin during `tsx`/`vitest`)
  //   3. <here>/../builtin        (dist/index.js → dist/builtin after tsup build)
  //   4. <here>/../templates/builtin
  if (process.env['BUCKLE_BUILTIN_DIR']) return process.env['BUCKLE_BUILTIN_DIR'];
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'builtin');
}

function builtinCandidates(): string[] {
  if (process.env['BUCKLE_BUILTIN_DIR']) return [process.env['BUCKLE_BUILTIN_DIR']];
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, 'builtin'),
    join(here, '..', 'builtin'),
    join(here, '..', 'templates', 'builtin'),
  ];
}

async function loadOne(path: string, origin: TemplateRecord['origin'], installOrigin?: string): Promise<TemplateRecord | null> {
  if (!(await isFile(path))) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(await readText(path));
  } catch (e) {
    throw new BuckleError(
      ErrorCode.E_TEMPLATE_INVALID,
      `failed to parse YAML at ${path}: ${(e as Error).message}`,
      'fix the YAML syntax and try again',
      e,
    );
  }
  const safe = TemplateSchema.safeParse(parsed);
  if (!safe.success) {
    throw new BuckleError(
      ErrorCode.E_TEMPLATE_INVALID,
      `template at ${path} is invalid: ${safe.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      'see template authoring docs for the full schema',
    );
  }
  const raw = safe.data;
  const baseName = path.split('/').slice(-2)[0]!;
  const rec: TemplateRecord = {
    name: raw.name ?? baseName,
    raw,
    path,
    origin,
    ...(installOrigin !== undefined ? { installOrigin } : {}),
  };
  return rec;
}

async function discoverDir(
  dir: string,
  origin: TemplateRecord['origin'],
): Promise<TemplateRecord[]> {
  if (!(await isDir(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: TemplateRecord[] = [];
  for (const ent of entries) {
    if (ent.name.startsWith('_')) continue;
    if (!ent.isDirectory()) continue;
    const candidate = join(dir, ent.name, 'template.yaml');
    const rec = await loadOne(candidate, origin);
    if (rec) {
      // Prefer the directory name over `name` for resolution (lookup key).
      out.push({ ...rec, name: ent.name });
    }
  }
  return out;
}

async function discoverInstalled(installRoot: string): Promise<TemplateRecord[]> {
  if (!(await isDir(installRoot))) return [];
  // Layout: <installRoot>/<origin-hash>/<template-name>/template.yaml
  const out: TemplateRecord[] = [];
  for (const originDir of await readdir(installRoot, { withFileTypes: true })) {
    if (!originDir.isDirectory()) continue;
    const subdir = join(installRoot, originDir.name);
    for (const tplDir of await readdir(subdir, { withFileTypes: true })) {
      if (!tplDir.isDirectory()) continue;
      const candidate = join(subdir, tplDir.name, 'template.yaml');
      const rec = await loadOne(candidate, 'installed', originDir.name);
      if (rec) out.push({ ...rec, name: tplDir.name });
    }
  }
  return out;
}

export interface CatalogOptions {
  /** Override builtin dir (used by tests). */
  builtinDir?: string;
  /** Override user templates root (used by tests). */
  templatesRoot?: string;
  /** Override installed root (used by tests). */
  installedRoot?: string;
}

export async function loadCatalog(opts: CatalogOptions = {}): Promise<TemplateRecord[]> {
  const paths = bucklePaths();
  const cands = opts.builtinDir ? [opts.builtinDir] : builtinCandidates();
  let bdir = cands[0]!;
  for (const c of cands) {
    if (await isDir(c)) {
      bdir = c;
      break;
    }
  }
  const udir = opts.templatesRoot ?? paths.templatesRoot;
  const idir = opts.installedRoot ?? paths.installedRoot;
  const [b, u, i] = await Promise.all([
    discoverDir(bdir, 'builtin'),
    discoverDir(udir, 'user'),
    discoverInstalled(idir),
  ]);
  // Resolution precedence: user > installed > builtin (last-write-wins on name collision).
  // We surface a warning once per process when shadowing happens — it's almost always a foot-gun.
  const map = new Map<string, TemplateRecord>();
  const builtinNames = new Set(b.map((r) => r.name));
  for (const r of b) map.set(r.name, r);
  for (const r of i) {
    if (builtinNames.has(r.name) && !shadowWarned.has(r.name)) {
       
      console.warn(`buckle: installed template "${r.name}" shadows the built-in.`);
      shadowWarned.add(r.name);
    }
    map.set(r.name, r);
  }
  for (const r of u) {
    if ((builtinNames.has(r.name) || i.some((x) => x.name === r.name)) && !shadowWarned.has(r.name)) {
       
      console.warn(`buckle: user template "${r.name}" shadows a built-in or installed template.`);
      shadowWarned.add(r.name);
    }
    map.set(r.name, r);
  }
  return [...map.values()].sort((a, b2) => a.name.localeCompare(b2.name));
}

const shadowWarned = new Set<string>();

export async function findTemplate(name: string, opts: CatalogOptions = {}): Promise<TemplateRecord> {
  const cat = await loadCatalog(opts);
  const match = cat.find((r) => r.name === name);
  if (!match) {
    throw new BuckleError(
      ErrorCode.E_TEMPLATE_NOT_FOUND,
      `template "${name}" is not installed or built-in`,
      `run "buckle list" to see available templates, or "buckle install <origin>" to add one`,
    );
  }
  return match;
}

export async function templateExists(name: string, opts: CatalogOptions = {}): Promise<boolean> {
  const cat = await loadCatalog(opts);
  return cat.some((r) => r.name === name);
}

/** Helpful for users: ensure a `template.yaml` is well-formed without mutating the catalog. */
export async function validateFile(path: string): Promise<void> {
  const rec = await loadOne(path, 'user');
  if (!rec) {
    throw new BuckleError(ErrorCode.E_TEMPLATE_NOT_FOUND, `no template file at ${path}`);
  }
}

/** Awaits the catalog and returns just the metadata-y view (no raw YAML payload). */
export async function listCatalog(opts: CatalogOptions = {}): Promise<
  { name: string; description?: string; origin: TemplateRecord['origin']; installOrigin?: string }[]
> {
  const cat = await loadCatalog(opts);
  return cat.map((r) => ({
    name: r.name,
    ...(r.raw.description !== undefined ? { description: r.raw.description } : {}),
    origin: r.origin,
    ...(r.installOrigin !== undefined ? { installOrigin: r.installOrigin } : {}),
  }));
}

// Tiny helper for unit tests that need to introspect "did anything load".
export async function _existsForTest(path: string): Promise<boolean> {
  return exists(path);
}
