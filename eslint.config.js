import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'schemas/**',
      // Everything under examples/ is installed output: a copy of a catalog
      // resource, placed there to show what installation produces. The originals
      // under registry/ are linted; linting the copies would report the same
      // findings twice and would fail the moment a consumer's target differs.
      'examples/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: {
        // The root tsconfig.json includes every source file, test, and script,
        // so the project service can resolve them all with strict options.
        // Only plain JavaScript falls outside it, and type-aware rules are
        // disabled there.
        projectService: {
          allowDefaultProject: ['*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused values are almost always a mistake, but an underscore prefix is
      // the conventional way to say "intentionally ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Every thrown value must be a real Error so it carries a stack.
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // `type` and `interface` both fine; consistency here is not worth churn.
      '@typescript-eslint/consistent-type-definitions': 'off',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'object-shorthand': ['error', 'always'],
    },
  },

  // Layering enforcement. ADR-0001 fixes the direction as cli -> core -> schema;
  // a boundary that is only documented erodes, so it is checked mechanically.
  {
    files: ['packages/schema/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@skillbox/core', '@skillbox/cli', '@skillbox/testing'],
              message:
                '@skillbox/schema is the lowest layer and must not depend on other Skillbox packages (ADR-0001).',
            },
            {
              group: ['node:fs', 'node:fs/*', 'fs', 'fs/*'],
              message:
                '@skillbox/schema must not touch the filesystem. It validates values, not directories (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@skillbox/cli', '@skillbox/cli/*'],
              message:
                '@skillbox/core must not depend on CLI presentation logic (ADR-0001).',
            },
          ],
        },
      ],
    },
  },

  // Test files: relaxed rules that would otherwise fight normal test idioms.
  {
    files: ['**/*.test.ts', '**/test/**/*.ts', 'packages/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
    },
  },

  // Repository scripts and the CLI are the only places allowed to write to stdout.
  {
    files: ['scripts/**/*.ts', 'packages/cli/src/output.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Plain JavaScript (the CLI launcher, this config file) is outside the
  // TypeScript projects, so type-aware rules cannot run on it. The spread's own
  // `rules` must be merged in explicitly — a bare `rules` key would replace it.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
    },
  },

  // Catalog and template content is written for a consumer's project, not for
  // this repository. It is typechecked so the examples are proven to compile,
  // but rules about our own conventions do not apply to it: a template's unused
  // placeholder is the point, and a shipped script writes to stdout by design.
  {
    files: ['registry/**/*.ts', 'templates/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
