import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyPlan, plan, summarizePlan } from '../../src/generators/writer.js';
import type { Template } from '../../src/templates/schema.js';

describe('writer plan/apply', () => {
  it('plans a fresh devcontainer.json as created', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = { version: '0.1.0', image: 'foo:1' };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    expect(p.files).toHaveLength(1);
    expect(p.files[0]?.existed).toBe(false);
    expect(p.files[0]?.changed).toBe(true);
    const summary = summarizePlan(p);
    expect(summary[0]?.status).toBe('created');
  });

  it('apply writes the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = { version: '0.1.0', image: 'foo:1' };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    await applyPlan(p);
    const content = await readFile(join(dir, '.devcontainer/devcontainer.json'), 'utf8');
    expect(content).toContain('"image": "foo:1"');
  });

  it('detects unchanged on second plan', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = { version: '0.1.0', image: 'foo:1' };
    await applyPlan(await plan(t, { cwd: dir, projectName: 'proj' }));
    const p2 = await plan(t, { cwd: dir, projectName: 'proj' });
    expect(p2.files[0]?.existed).toBe(true);
    expect(p2.files[0]?.changed).toBe(false);
    expect(summarizePlan(p2)[0]?.status).toBe('unchanged');
  });

  it('emits a Dockerfile when build is set and Dockerfile is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = { version: '0.1.0', build: { dockerfile: 'Dockerfile' } };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    const paths = p.files.map((f) => f.path);
    expect(paths.some((p2) => p2.endsWith('/Dockerfile'))).toBe(true);
  });

  it('skips Dockerfile when one already exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    await mkdir(join(dir, '.devcontainer'), { recursive: true });
    await writeFile(join(dir, '.devcontainer/Dockerfile'), 'FROM scratch\n');
    const t: Template = { version: '0.1.0', build: { dockerfile: 'Dockerfile' } };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    expect(p.files.some((f) => f.path.endsWith('/Dockerfile'))).toBe(false);
  });

  it('emits compose.yml when compose: is set and missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      compose: { file: 'docker-compose.yml', service: 'app' },
    };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    const paths = p.files.map((f) => f.path);
    expect(paths.some((p2) => p2.endsWith('/docker-compose.yml'))).toBe(true);
  });

  it('surfaces compose + dind guardrail warning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'buckle-w-'));
    const t: Template = {
      version: '0.1.0',
      image: 'foo:1',
      compose: { file: 'docker-compose.yml', service: 'app' },
      features: ['dind'],
    };
    const p = await plan(t, { cwd: dir, projectName: 'proj' });
    expect(p.warnings).toBeDefined();
    expect(p.warnings?.some((w) => w.includes('compose + dind'))).toBe(true);
  });
});
