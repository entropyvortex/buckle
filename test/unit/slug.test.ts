import { describe, expect, it } from 'vitest';

import { slug, slugOrFallback } from '../../src/util/slug.js';

describe('slug', () => {
  it('lowercases and replaces unsafe chars', () => {
    expect(slug('My Project!')).toBe('my-project');
    expect(slug('Foo_Bar.baz')).toBe('foo-bar-baz');
  });

  it('collapses runs of dashes', () => {
    expect(slug('a---b__c')).toBe('a-b-c');
  });

  it('trims leading/trailing dashes', () => {
    expect(slug('---hello---')).toBe('hello');
  });

  it('truncates to maxLen', () => {
    expect(slug('a'.repeat(100), 10)).toBe('aaaaaaaaaa');
  });

  it('returns empty for non-alphanumeric input', () => {
    expect(slug('!!!')).toBe('');
  });

  it('slugOrFallback returns fallback for empty input', () => {
    expect(slugOrFallback('!!', 'tmp')).toBe('tmp');
    expect(slugOrFallback('hello', 'tmp')).toBe('hello');
  });
});
