import { deepMerge } from '../templates/resolver.js';
import type { Template } from '../templates/schema.js';
import { compileFeature, isKnownFeature, parseFeatureSpec } from './catalog.js';

/**
 * Apply the buckle convenience-features layer to a resolved template.
 *
 * We split `template.features` into:
 *   - convenience features (the catalog + `mcp:*`) → compiled into native features + hooks
 *   - opaque-string passthroughs (already native feature IDs) → preserved as-is into nativeFeatures
 *
 * The result has an empty `features` (consumed) and a populated `nativeFeatures`.
 */
export function applyFeatures(t: Template): Template {
  const featuresIn = t.features ?? [];
  if (featuresIn.length === 0) return t;
  let merged: Template = { ...t, features: [] };
  for (const entry of featuresIn) {
    const raw = typeof entry === 'string' ? entry : entry[0];
    if (!isKnownFeature(raw)) {
      throw new Error(`unknown feature in template: "${raw}"`);
    }
    const spec = parseFeatureSpec(raw);
    if (typeof entry !== 'string' && entry.length === 2) {
      spec.arg = String(entry[1]);
    }
    const patch = compileFeature(spec);
    merged = deepMerge(merged, patch) as Template;
  }
  return merged;
}
