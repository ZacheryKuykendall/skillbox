import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLI_VERSION } from './version.js';

describe('CLI_VERSION', () => {
  it('matches the version in package.json', async () => {
    // The constant is hand-maintained to avoid a runtime filesystem read, so
    // this test is what prevents the two from drifting.
    const packageJsonPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const contents = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      version: string;
    };

    expect(CLI_VERSION).toBe(contents.version);
  });

  it('is a strict semantic version', () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
  });
});
