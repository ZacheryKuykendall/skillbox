import { describe, expect, it } from 'vitest';

import {
  compatibilitySchema,
  dependencySchema,
  envVarSchema,
  inputSchema,
  installSchema,
  outputSchema,
  permissionSchema,
  runtimeSchema,
} from './spec.js';

describe('inputSchema', () => {
  it('accepts a minimal input', () => {
    expect(
      inputSchema.safeParse({
        name: 'diff',
        type: 'string',
        description: 'The diff to review.',
      }).success,
    ).toBe(true);
  });

  it('accepts an enum input with values', () => {
    expect(
      inputSchema.safeParse({
        name: 'severity',
        type: 'enum',
        values: ['low', 'high'],
        default: 'low',
        description: 'Minimum severity.',
      }).success,
    ).toBe(true);
  });

  it('requires values when the type is enum', () => {
    const result = inputSchema.safeParse({
      name: 'severity',
      type: 'enum',
      description: 'Minimum severity.',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('allowed "values"');
    }
  });

  it('rejects values on a non-enum type', () => {
    // Silently ignoring a meaningless field would let an author believe it works.
    const result = inputSchema.safeParse({
      name: 'diff',
      type: 'string',
      values: ['a'],
      description: 'The diff.',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('only meaningful');
    }
  });

  it('rejects a default outside the declared values', () => {
    const result = inputSchema.safeParse({
      name: 'severity',
      type: 'enum',
      values: ['low', 'high'],
      default: 'medium',
      description: 'Minimum severity.',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        'not one of the declared values',
      );
    }
  });

  it('rejects an empty values list', () => {
    expect(
      inputSchema.safeParse({
        name: 'severity',
        type: 'enum',
        values: [],
        description: 'Minimum severity.',
      }).success,
    ).toBe(false);
  });

  it('requires a description', () => {
    expect(inputSchema.safeParse({ name: 'diff', type: 'string' }).success).toBe(false);
  });

  it('rejects an unknown value type', () => {
    expect(
      inputSchema.safeParse({ name: 'diff', type: 'blob', description: 'The diff.' })
        .success,
    ).toBe(false);
  });

  it('rejects a name that is not an identifier', () => {
    expect(
      inputSchema.safeParse({
        name: 'Diff Value',
        type: 'string',
        description: 'x y z.',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      inputSchema.safeParse({
        name: 'diff',
        type: 'string',
        description: 'The diff.',
        example: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('outputSchema', () => {
  it('accepts a well-formed output', () => {
    expect(
      outputSchema.safeParse({
        name: 'findings',
        type: 'array',
        description: 'The findings.',
      }).success,
    ).toBe(true);
  });

  it('does not accept input-only fields', () => {
    expect(
      outputSchema.safeParse({
        name: 'findings',
        type: 'array',
        description: 'The findings.',
        required: true,
      }).success,
    ).toBe(false);
  });
});

describe('dependencySchema', () => {
  it('accepts a qualified name and a range', () => {
    expect(
      dependencySchema.safeParse({ resource: 'skillbox/other', version: '^0.1.0' })
        .success,
    ).toBe(true);
  });

  it('accepts an optional dependency', () => {
    expect(
      dependencySchema.safeParse({
        resource: 'skillbox/other',
        version: '^0.1.0',
        optional: true,
      }).success,
    ).toBe(true);
  });

  it('requires a version range', () => {
    expect(dependencySchema.safeParse({ resource: 'skillbox/other' }).success).toBe(
      false,
    );
  });

  it('rejects a version embedded in the resource field', () => {
    // The version lives in its own field so a range containing "@" or a space
    // never needs escaping.
    expect(
      dependencySchema.safeParse({
        resource: 'skillbox/other@1.0.0',
        version: '^1.0.0',
      }).success,
    ).toBe(false);
  });

  it('rejects an unqualified resource name', () => {
    expect(
      dependencySchema.safeParse({ resource: 'other', version: '^1.0.0' }).success,
    ).toBe(false);
  });

  it('rejects an invalid range', () => {
    expect(
      dependencySchema.safeParse({ resource: 'skillbox/other', version: 'newest' })
        .success,
    ).toBe(false);
  });
});

describe('envVarSchema', () => {
  it('accepts a declared name and description', () => {
    expect(
      envVarSchema.safeParse({
        name: 'SKILLBOX_API_TOKEN',
        description: 'The API token.',
      }).success,
    ).toBe(true);
  });

  it('accepts the secret marker', () => {
    expect(
      envVarSchema.safeParse({
        name: 'SKILLBOX_API_TOKEN',
        description: 'The API token.',
        required: true,
        secret: true,
      }).success,
    ).toBe(true);
  });

  it('has no field for a value, so one cannot be smuggled in', () => {
    // The whole secret-handling guarantee rests on this: a manifest declares
    // names only, and strict validation means no value field can be added (SR-7).
    expect(
      envVarSchema.safeParse({
        name: 'SKILLBOX_API_TOKEN',
        description: 'The API token.',
        value: 'ghp_realsecret',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['lowercase_name', 'names are uppercase'],
    ['1LEADING_DIGIT', 'a name cannot start with a digit'],
    ['_LEADING_UNDERSCORE', 'a name cannot start with an underscore'],
    ['HAS-HYPHEN', 'hyphens are not allowed'],
    ['', 'a name is required'],
  ])('rejects %s because %s', (name) => {
    expect(envVarSchema.safeParse({ name, description: 'Something.' }).success).toBe(
      false,
    );
  });

  it('requires a description so users know what to supply', () => {
    expect(envVarSchema.safeParse({ name: 'SKILLBOX_API_TOKEN' }).success).toBe(false);
  });
});

describe('permissionSchema', () => {
  it.each([
    'filesystem:read',
    'filesystem:write',
    'network:outbound',
    'process:spawn',
    'env:read',
    'secrets:read',
    'model:invoke',
  ])('accepts %s', (permission) => {
    expect(permissionSchema.safeParse(permission).success).toBe(true);
  });

  it.each(['filesystem:destroy', 'network:inbound', 'FILESYSTEM:READ', 'read', ''])(
    'rejects %s because the vocabulary is closed',
    (permission) => {
      expect(permissionSchema.safeParse(permission).success).toBe(false);
    },
  );
});

describe('runtimeSchema', () => {
  it('accepts a type alone', () => {
    expect(runtimeSchema.safeParse({ type: 'node' }).success).toBe(true);
  });

  it('accepts a type and version range', () => {
    expect(
      runtimeSchema.safeParse({ type: 'node', version: '>=20.19.0' }).success,
    ).toBe(true);
  });

  it('rejects an unknown runtime type', () => {
    expect(runtimeSchema.safeParse({ type: 'deno' }).success).toBe(false);
  });

  it('rejects an invalid version range', () => {
    expect(runtimeSchema.safeParse({ type: 'node', version: 'latest' }).success).toBe(
      false,
    );
  });
});

describe('compatibilitySchema', () => {
  it('accepts an empty object, meaning no constraints', () => {
    expect(compatibilitySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a skillbox range and platform list', () => {
    expect(
      compatibilitySchema.safeParse({
        skillbox: '>=0.1.0',
        platforms: ['win32', 'linux', 'darwin'],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown platform', () => {
    expect(compatibilitySchema.safeParse({ platforms: ['solaris'] }).success).toBe(
      false,
    );
  });

  it('rejects an empty platform list, which would mean nothing is supported', () => {
    expect(compatibilitySchema.safeParse({ platforms: [] }).success).toBe(false);
  });
});

describe('installSchema', () => {
  it('accepts a relative target', () => {
    expect(installSchema.safeParse({ target: '.skillbox/prompts/x' }).success).toBe(
      true,
    );
  });

  it('accepts a strategy', () => {
    expect(installSchema.safeParse({ strategy: 'flat' }).success).toBe(true);
  });

  it('rejects an unknown strategy', () => {
    expect(installSchema.safeParse({ strategy: 'symlink' }).success).toBe(false);
  });

  it.each([
    '/etc/skillbox',
    '../outside',
    'C:\\Temp',
    'C:relative',
    '\\\\server\\share',
  ])('rejects the unsafe target %s', (target) => {
    expect(installSchema.safeParse({ target }).success).toBe(false);
  });
});
