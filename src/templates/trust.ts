import { createHash } from 'node:crypto';

import { exists, readTextOrUndefined, writeTextAtomic } from '../util/fs.js';
import { bucklePaths } from '../util/paths.js';
import type { Template } from './schema.js';

export interface TrustEntry {
  trustedAt: string;
  hookHash: string;
}

export interface TrustStore {
  version: 1;
  entries: Record<string, TrustEntry>;
}

const EMPTY: TrustStore = { version: 1, entries: {} };

export async function loadTrustStore(path?: string): Promise<TrustStore> {
  const file = path ?? bucklePaths().trustStore;
  const text = await readTextOrUndefined(file);
  if (!text) return EMPTY;
  try {
    const parsed = JSON.parse(text) as TrustStore;
    if (parsed && parsed.version === 1 && parsed.entries) return parsed;
  } catch {
    /* fall through */
  }
  return EMPTY;
}

export async function saveTrustStore(store: TrustStore, path?: string): Promise<void> {
  const file = path ?? bucklePaths().trustStore;
  await writeTextAtomic(file, JSON.stringify(store, null, 2));
}

/** Hash *just the executable surface* of a merged template — what runs on the host. */
export function hookSurfaceHash(t: Template): string {
  const surface = {
    lifecycle: t.lifecycle ?? null,
    runArgs: t.runArgs ?? null,
    mounts: t.mounts ?? null,
    features: t.features ?? null,
    nativeFeatures: t.nativeFeatures ?? null,
    customizations: t.customizations ?? null,
  };
  return createHash('sha256').update(JSON.stringify(surface)).digest('hex');
}

export interface TrustDecision {
  /** True if the resolved template is already trusted at this hook surface. */
  trusted: boolean;
  /** True if there is a previous trust at a different hook surface (changed). */
  changed: boolean;
}

export async function checkTrust(
  resolvedHash: string,
  hookHash: string,
  path?: string,
): Promise<TrustDecision> {
  const store = await loadTrustStore(path);
  const entry = store.entries[resolvedHash];
  if (!entry) return { trusted: false, changed: false };
  if (entry.hookHash === hookHash) return { trusted: true, changed: false };
  return { trusted: false, changed: true };
}

export async function recordTrust(
  resolvedHash: string,
  hookHash: string,
  path?: string,
): Promise<void> {
  const file = path ?? bucklePaths().trustStore;
  const store = (await exists(file)) ? await loadTrustStore(file) : EMPTY;
  const next: TrustStore = {
    version: 1,
    entries: {
      ...store.entries,
      [resolvedHash]: { trustedAt: new Date().toISOString(), hookHash },
    },
  };
  await saveTrustStore(next, file);
}
