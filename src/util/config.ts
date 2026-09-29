import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

import { readTextOrUndefined } from './fs.js';
import { bucklePaths } from './paths.js';

export interface BuckleConfig {
  /** $EDITOR override. Falls back to $VISUAL → $EDITOR → vi. */
  editor?: string;
  /** Wizard suggestion when autodetect cannot decide. */
  defaultTemplate?: string;
  /**
   * When false, bind-mount host ~/.claude and ~/.grok (legacy share-home).
   * Default true = per-workspace isolated agent state.
   */
  isolate?: boolean;
}

const EMPTY: BuckleConfig = {};

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

export function parseConfig(text: string): BuckleConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return EMPTY;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY;
  const rec = parsed as Record<string, unknown>;
  const out: BuckleConfig = {};
  const editor = asString(rec['editor']);
  if (editor !== undefined) out.editor = editor;
  const defaultTemplate = asString(rec['defaultTemplate']);
  if (defaultTemplate !== undefined) out.defaultTemplate = defaultTemplate;
  const isolate = asBool(rec['isolate']);
  if (isolate !== undefined) out.isolate = isolate;
  return out;
}

export function loadConfigSync(file?: string): BuckleConfig {
  const path = file ?? bucklePaths().configFile;
  try {
    return parseConfig(readFileSync(path, 'utf8'));
  } catch {
    return EMPTY;
  }
}

export async function loadConfig(file?: string): Promise<BuckleConfig> {
  const path = file ?? bucklePaths().configFile;
  const text = await readTextOrUndefined(path);
  if (!text) return EMPTY;
  return parseConfig(text);
}
