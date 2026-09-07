import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { packageVersion } from '../../src/util/version.js';

describe('packageVersion', () => {
  it('matches package.json', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    expect(packageVersion()).toBe(pkg.version);
  });
});
