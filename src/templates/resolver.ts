import { createHash } from 'node:crypto';

import { BuckleError, ErrorCode } from '../util/errors.js';
import { findTemplate, type CatalogOptions, type TemplateRecord } from './loader.js';
import { TemplateSchema, validateSourceMutex, type Template } from './schema.js';

/**
 * Resolve a template by name into its fully-merged form. Handles:
 *   - `extends` chain (string or array; rightmost wins)
 *   - cycle detection (DFS, depth ≤ 8)
 *   - deep-merge with last-writer-wins (arrays append unless first element is "!replace")
 *   - source mutex (`image`/`build`/`compose`)
 */

export const REPLACE_SENTINEL = '!replace';
export const MAX_DEPTH = 8;

export interface ResolveOptions extends CatalogOptions {
  /** Optional CLI-time overlay (features, env, runArgs, etc.). Last application. */
  overlay?: Partial<Template>;
}

export interface ResolveResult {
  /** Fully merged template, ready for compilation/generation. */
  merged: Template;
  /** Names of every template visited during resolution, in MRO order. */
  chain: string[];
  /** Origin of each entry in `chain` (parallel array). */
  chainOrigins: ('builtin' | 'user' | 'installed')[];
  /** SHA-256 over the merged template (without overlay), for trust prompting. */
  hash: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge two values with these rules:
 *   - Plain objects merge key-by-key.
 *   - Arrays: if `next[0] === '!replace'`, the rest of next replaces base. Otherwise next is
 *     appended to base.
 *   - Scalars and unlike kinds: next wins.
 */
export function deepMerge<A, B>(base: A, next: B): A | B {
  if (Array.isArray(base) && Array.isArray(next)) {
    if (next[0] === REPLACE_SENTINEL) {
      return next.slice(1) as unknown as B;
    }
    return [...base, ...next] as unknown as A | B;
  }
  if (isPlainObject(base) && isPlainObject(next)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(next)) {
      if (k in out) {
        out[k] = deepMerge(out[k] as unknown, v as unknown);
      } else {
        out[k] = v;
      }
    }
    return out as unknown as A | B;
  }
  return next as A | B;
}

function toExtendsList(t: Template): string[] {
  if (!t.extends) return [];
  return Array.isArray(t.extends) ? t.extends : [t.extends];
}

/**
 * Compute the linearized MRO (Method-Resolution-Order) for a template.
 * Order: parents are merged left-to-right (rightmost wins), then the child applied last.
 */
async function buildChain(
  startName: string,
  opts: CatalogOptions,
  seen: Set<string>,
  depth: number,
): Promise<{ records: TemplateRecord[]; names: string[] }> {
  if (depth > MAX_DEPTH) {
    throw new BuckleError(
      ErrorCode.E_CYCLE,
      `template inheritance exceeds max depth (${MAX_DEPTH}) starting at "${startName}"`,
      'simplify the extends chain',
    );
  }
  if (seen.has(startName)) {
    throw new BuckleError(
      ErrorCode.E_CYCLE,
      `inheritance cycle detected at "${startName}" (chain: ${[...seen, startName].join(' → ')})`,
    );
  }
  const rec = await findTemplate(startName, opts);
  const nextSeen = new Set(seen);
  nextSeen.add(startName);

  const parents = toExtendsList(rec.raw);
  const records: TemplateRecord[] = [];
  const names: string[] = [];
  for (const parentName of parents) {
    const sub = await buildChain(parentName, opts, nextSeen, depth + 1);
    for (const r of sub.records) {
      // Don't include the same record twice; right-most occurrence wins later anyway.
      if (!records.some((x) => x.path === r.path)) {
        records.push(r);
        names.push(r.name);
      }
    }
  }
  records.push(rec);
  names.push(rec.name);
  return { records, names };
}

function stripExtends(t: Template): Template {
  // Strip the `extends` field once we've inlined parents — clean output.
  const { extends: _e, ...rest } = t;
  return rest as Template;
}

/** Stable JSON serializer for hashing (sorted keys, no formatting). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function templateHash(t: Template): string {
  return createHash('sha256').update(stableStringify(t)).digest('hex');
}

export async function resolve(name: string, opts: ResolveOptions = {}): Promise<ResolveResult> {
  const { overlay, ...catalog } = opts;
  const { records, names } = await buildChain(name, catalog, new Set<string>(), 0);
  const origins = records.map((r) => r.origin);

  // Merge in MRO order. Each step strips `extends` from the input we're merging in,
  // because the chain itself encodes inheritance.
  let merged: Template = {} as Template;
  for (const rec of records) {
    merged = deepMerge(merged, stripExtends(rec.raw)) as Template;
  }
  // Validate merged shape (re-parse so defaults are applied uniformly).
  const reparse = TemplateSchema.safeParse({ ...merged });
  if (!reparse.success) {
    throw new BuckleError(
      ErrorCode.E_TEMPLATE_INVALID,
      `merged template "${name}" is invalid: ${reparse.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const mergedFinal = reparse.data;
  const mutexErr = validateSourceMutex(mergedFinal);
  if (mutexErr) {
    throw new BuckleError(ErrorCode.E_TEMPLATE_CONFLICT, mutexErr);
  }
  const hash = templateHash(mergedFinal);

  // Apply CLI overlay LAST, after hashing. Overlay can introduce new hooks/features that we
  // surface via a separate trust check (handled by trust.ts).
  let withOverlay: Template = mergedFinal;
  if (overlay) {
    const ov = TemplateSchema.partial().safeParse(overlay);
    if (!ov.success) {
      throw new BuckleError(
        ErrorCode.E_TEMPLATE_INVALID,
        `invalid overlay: ${ov.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    withOverlay = deepMerge(mergedFinal, ov.data) as Template;
    const mutexErr2 = validateSourceMutex(withOverlay);
    if (mutexErr2) {
      throw new BuckleError(ErrorCode.E_TEMPLATE_CONFLICT, mutexErr2);
    }
  }

  return { merged: withOverlay, chain: names, chainOrigins: origins, hash };
}
