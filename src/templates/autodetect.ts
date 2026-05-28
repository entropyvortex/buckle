import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { isDir, isFile } from '../util/fs.js';

/**
 * Walk a project directory and score language signals to suggest a template.
 *
 * Scoring (final):
 *   lockfile = 3, manifest = 2, framework hint = 1, Dockerfile hint = 1.
 * Decision:
 *   single template if max - second_max ≥ 2.
 *   polyglot if both ≥ 3.
 *   else `ubuntu-base`.
 */

export interface LanguageScore {
  template: string;
  score: number;
  reasons: string[];
}

export interface AutoDetectResult {
  /** Suggested template, in priority order (always at least 1). */
  suggestions: string[];
  /** All non-zero scores (sorted desc). */
  scores: LanguageScore[];
  /** Whether a polyglot template was suggested. */
  polyglot: boolean;
}

const LANG_RULES: ReadonlyArray<{
  template: string;
  lockfiles: string[];
  manifests: string[];
  frameworks: string[];
  dockerHints: string[];
}> = [
  {
    template: 'node',
    lockfiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'],
    manifests: ['package.json'],
    frameworks: ['next.config.js', 'next.config.ts', 'nuxt.config.ts', 'svelte.config.js', 'vite.config.ts', 'vite.config.js'],
    dockerHints: ['node:', 'mcr.microsoft.com/devcontainers/javascript-node'],
  },
  {
    template: 'python',
    lockfiles: ['poetry.lock', 'pdm.lock', 'Pipfile.lock', 'uv.lock'],
    manifests: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
    frameworks: ['manage.py', 'pyproject.toml'],
    dockerHints: ['python:', 'mcr.microsoft.com/devcontainers/python'],
  },
  {
    template: 'go',
    lockfiles: ['go.sum'],
    manifests: ['go.mod'],
    frameworks: [],
    dockerHints: ['golang:', 'mcr.microsoft.com/devcontainers/go'],
  },
  {
    template: 'rust',
    lockfiles: ['Cargo.lock'],
    manifests: ['Cargo.toml'],
    frameworks: [],
    dockerHints: ['rust:', 'mcr.microsoft.com/devcontainers/rust'],
  },
  {
    template: 'bun',
    lockfiles: ['bun.lockb'],
    manifests: [],
    frameworks: [],
    dockerHints: ['oven/bun'],
  },
  {
    template: 'deno',
    lockfiles: ['deno.lock'],
    manifests: ['deno.json', 'deno.jsonc'],
    frameworks: [],
    dockerHints: ['denoland/deno'],
  },
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.cache',
  'vendor',
]);

export async function detectProject(cwd: string): Promise<AutoDetectResult> {
  const present = await listFiles(cwd, 1);
  const scores = new Map<string, LanguageScore>();
  const fileSet = new Set(present);

  // Read Dockerfile for hint-substring matching.
  let dockerfileText = '';
  if (fileSet.has('Dockerfile')) {
    try {
      const txt = await import('node:fs/promises').then((m) => m.readFile(join(cwd, 'Dockerfile'), 'utf8'));
      dockerfileText = txt;
    } catch {
      /* ignore */
    }
  }

  for (const rule of LANG_RULES) {
    let score = 0;
    const reasons: string[] = [];
    for (const lf of rule.lockfiles) {
      if (fileSet.has(lf)) {
        score += 3;
        reasons.push(`lockfile:${lf}`);
      }
    }
    for (const mf of rule.manifests) {
      if (fileSet.has(mf)) {
        score += 2;
        reasons.push(`manifest:${mf}`);
      }
    }
    for (const fw of rule.frameworks) {
      if (fileSet.has(fw)) {
        score += 1;
        reasons.push(`framework:${fw}`);
      }
    }
    for (const dh of rule.dockerHints) {
      if (dockerfileText.includes(dh)) {
        score += 1;
        reasons.push(`dockerfile-from:${dh}`);
      }
    }
    if (score > 0) scores.set(rule.template, { template: rule.template, score, reasons });
  }

  const sorted = [...scores.values()].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];

  let suggestions: string[];
  let polyglot = false;
  if (!top) {
    suggestions = ['ubuntu-base'];
  } else if (!second) {
    suggestions = [top.template];
  } else if (top.score - second.score >= 2) {
    suggestions = [top.template, second.template];
  } else if (top.score >= 3 && second.score >= 3) {
    polyglot = true;
    suggestions = ['polyglot', top.template, second.template];
  } else {
    suggestions = [top.template, second.template];
  }
  return { suggestions, scores: sorted, polyglot };
}

async function listFiles(cwd: string, depth: number): Promise<string[]> {
  if (!(await isDir(cwd))) return [];
  const out: string[] = [];
  const stack: { dir: string; depth: number; rel: string }[] = [{ dir: cwd, depth: 0, rel: '' }];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = (await readdir(cur.dir, { withFileTypes: true, encoding: 'utf8' })) as unknown as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        if (cur.depth < depth) {
          stack.push({ dir: join(cur.dir, ent.name), depth: cur.depth + 1, rel: cur.rel ? `${cur.rel}/${ent.name}` : ent.name });
        }
      } else if (ent.isFile()) {
        // Score by basename only; the rules use bare filenames.
        out.push(ent.name);
      }
    }
  }
  // Also expose explicit Dockerfile presence.
  if (await isFile(join(cwd, 'Dockerfile'))) out.push('Dockerfile');
  return out;
}
