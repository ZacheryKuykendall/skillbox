import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve workspace imports to source rather than to dist. Unit tests then
    // run without a prior build, and coverage attributes to the real .ts files.
    // CLI integration tests deliberately bypass this by spawning the built
    // binary, which is the behavior they exist to verify.
    alias: {
      '@skillbox/schema': path.join(root, 'packages/schema/src/index.ts'),
      '@skillbox/core': path.join(root, 'packages/core/src/index.ts'),
      '@skillbox/testing': path.join(root, 'packages/testing/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    // Catalog tests run too: a component that ships a test file should have it
    // actually pass, not merely exist. Templates are excluded because their
    // placeholder tests are meant to be filled in, not run.
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'registry/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Filesystem tests create real temporary directories. Forks give each file a
    // clean process so a leaked cwd or env var cannot bleed between suites.
    pool: 'forks',

    // Integration tests spawn the built CLI, which is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/dist/**',
        // Fixtures and helpers are exercised by the suites that consume them;
        // measuring them separately would inflate the number without adding signal.
        'packages/testing/**',
      ],
      // The repository-wide gate. Below this is a hard CI failure.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
