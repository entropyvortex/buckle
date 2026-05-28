import { basename } from 'node:path';

import { slugOrFallback } from '../util/slug.js';

export interface NameSpec {
  /** Project root (for `cwd_basename`). */
  cwd: string;
  /** Template name. */
  template: string;
  /** Names already in use; we'll append `_2`, `_3`… on collision. */
  inUse?: string[];
}

/**
 * Compute the deterministic container name for a workspace + template pair.
 * Format: `buckle.${slug(cwd_basename)}.${slug(template_name)}` (+ `_N` on collision).
 */
export function containerName(spec: NameSpec): string {
  const dir = slugOrFallback(basename(spec.cwd), 'tmp', 32);
  const tpl = slugOrFallback(spec.template, 'unnamed', 32);
  const base = `buckle.${dir}.${tpl}`;
  const taken = new Set(spec.inUse ?? []);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base}_${i}`;
    if (!taken.has(cand)) return cand;
  }
  // Pathological — fall through with a timestamp.
  return `${base}_${Date.now().toString(36)}`;
}

export const LABEL_LOCAL_FOLDER = 'devcontainer.local_folder';
export const LABEL_BUCKLE_TEMPLATE = 'buckle.template';
export const LABEL_BUCKLE_HASH = 'buckle.hash';
