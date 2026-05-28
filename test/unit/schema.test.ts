import { describe, expect, it } from 'vitest';

import { TemplateSchema, validateSourceMutex } from '../../src/templates/schema.js';

describe('TemplateSchema', () => {
  it('accepts a minimal template', () => {
    const r = TemplateSchema.safeParse({ image: 'foo:1' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const r = TemplateSchema.safeParse({ image: 'foo:1', sneaky: true });
    expect(r.success).toBe(false);
  });

  it('accepts string and array forms of extends', () => {
    expect(TemplateSchema.safeParse({ extends: 'parent' }).success).toBe(true);
    expect(TemplateSchema.safeParse({ extends: ['a', 'b'] }).success).toBe(true);
  });

  it('accepts numeric and object forwardPorts', () => {
    const r = TemplateSchema.safeParse({
      forwardPorts: [3000, { port: 8080, label: 'api' }],
    });
    expect(r.success).toBe(true);
  });
});

describe('validateSourceMutex', () => {
  it('returns null when zero or one of image/build/compose is set', () => {
    expect(validateSourceMutex({ version: '0.1.0' } as never)).toBeNull();
    expect(validateSourceMutex({ image: 'foo', version: '0.1.0' } as never)).toBeNull();
  });

  it('errors when more than one source is set', () => {
    const err = validateSourceMutex({
      version: '0.1.0',
      image: 'foo:1',
      build: { dockerfile: 'Dockerfile' },
    } as never);
    expect(err).not.toBeNull();
    expect(err).toContain('image');
    expect(err).toContain('build');
  });
});
