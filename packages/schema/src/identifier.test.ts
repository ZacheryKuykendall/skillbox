import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  formatIdentifier,
  formatQualifiedName,
  identifierSchema,
  isPrerelease,
  parseReference,
  ReferenceParseError,
  resourceNameSchema,
  satisfiesRange,
  tryParseReference,
  versionRangeSchema,
  versionSchema,
} from './identifier.js';

describe('identifierSchema', () => {
  it.each(['ab', 'code-review', 'skillbox', 'a1', 'x-y-z', 'a'.repeat(64)])(
    'accepts %s',
    (value) => {
      expect(identifierSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['a', 'a single character is below the minimum length'],
    ['a'.repeat(65), 'it exceeds the maximum length'],
    ['-leading', 'it starts with a hyphen'],
    ['trailing-', 'it ends with a hyphen'],
    ['Upper', 'it contains uppercase letters'],
    ['under_score', 'it contains an underscore'],
    ['has.dot', 'it contains a dot'],
    ['has space', 'it contains a space'],
    ['a/b', 'it contains a slash'],
  ])('rejects %s because %s', (value) => {
    expect(identifierSchema.safeParse(value).success).toBe(false);
  });

  it('explains the pattern in its error message', () => {
    const result = identifierSchema.safeParse('Not_Valid');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('lowercase');
    }
  });
});

describe('versionSchema', () => {
  it.each(['0.1.0', '1.0.0', '10.20.30', '1.0.0-beta.1', '2.0.0-rc.1'])(
    'accepts %s',
    (value) => {
      expect(versionSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['^0.1.0', 'a caret range is not an exact version'],
    ['~1.2.0', 'a tilde range is not an exact version'],
    ['1.0', 'a partial version is not valid semver'],
    ['1', 'a bare major is not valid semver'],
    ['latest', 'a dist-tag is not a version'],
    ['', 'an empty string is not a version'],
    ['>=1.0.0', 'a comparator is not an exact version'],
  ])('rejects %s because %s', (value) => {
    expect(versionSchema.safeParse(value).success).toBe(false);
  });
});

describe('versionRangeSchema', () => {
  it.each(['0.1.0', '^0.1.0', '~1.2.0', '>=1.0.0 <2.0.0', '*', '1.x'])(
    'accepts %s',
    (value) => {
      expect(versionRangeSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['not-a-range', 'it is not parseable as a range'],
    ['^^1.0.0', 'a doubled caret is malformed'],
  ])('rejects %s because %s', (value) => {
    expect(versionRangeSchema.safeParse(value).success).toBe(false);
  });
});

describe('resourceNameSchema', () => {
  it('accepts namespace/name', () => {
    expect(resourceNameSchema.safeParse('skillbox/code-review').success).toBe(true);
  });

  it.each([
    ['code-review', 'the namespace is missing'],
    ['skillbox/code-review/extra', 'there is more than one slash'],
    ['skillbox/', 'the name is empty'],
    ['/code-review', 'the namespace is empty'],
    ['Skillbox/code-review', 'the namespace has uppercase letters'],
    ['skillbox/code-review@0.1.0', 'a version is included'],
  ])('rejects %s because %s', (value) => {
    expect(resourceNameSchema.safeParse(value).success).toBe(false);
  });
});

describe('parseReference', () => {
  it('parses a reference with no version as "highest stable"', () => {
    const reference = parseReference('skillbox/code-review');

    expect(reference).toEqual({
      namespace: 'skillbox',
      name: 'code-review',
      qualifiedName: 'skillbox/code-review',
      version: undefined,
      exact: false,
    });
  });

  it('parses an exact version and marks it exact', () => {
    const reference = parseReference('skillbox/code-review@0.1.0');

    expect(reference.version).toBe('0.1.0');
    expect(reference.exact).toBe(true);
  });

  it.each(['^0.1.0', '~0.1.0', '>=0.1.0 <0.2.0', '*', '0.1.x'])(
    'parses the range %s and does not mark it exact',
    (range) => {
      const reference = parseReference(`skillbox/code-review@${range}`);

      expect(reference.version).toBe(range);
      expect(reference.exact).toBe(false);
    },
  );

  it('parses a prerelease as an exact version', () => {
    const reference = parseReference('skillbox/code-review@1.0.0-beta.1');

    expect(reference.version).toBe('1.0.0-beta.1');
    expect(reference.exact).toBe(true);
  });

  it('round-trips through formatIdentifier without loss', () => {
    const reference = parseReference('skillbox/code-review@0.1.0');

    expect(
      formatIdentifier({
        namespace: reference.namespace,
        name: reference.name,
        version: reference.version!,
      }),
    ).toBe('skillbox/code-review@0.1.0');
  });

  describe('rejections', () => {
    it.each([
      ['', 'the reference is empty'],
      ['code-review', 'a namespace is required'],
      ['skillbox/code-review/extra', 'exactly one'],
      ['skillbox/', 'the name is empty'],
      ['/code-review', 'the namespace is empty'],
      ['Skillbox/code-review', 'lowercase'],
      ['skillbox/Code-Review', 'lowercase'],
      ['skillbox/code_review', 'lowercase'],
      ['skillbox/code-review@', 'a version was expected'],
      ['skillbox/code-review@not-a-version', 'not a valid version'],
      ['skillbox/a', 'between 2 and 64'],
    ])('rejects %s mentioning %s', (input, expectedFragment) => {
      expect(() => parseReference(input)).toThrow(ReferenceParseError);
      expect(() => parseReference(input)).toThrow(
        new RegExp(expectedFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      );
    });

    it('rejects an npm-style scope so there is one canonical form', () => {
      // Accepting both @a/b and a/b would make output ambiguous.
      expect(() => parseReference('@skillbox/code-review')).toThrow(
        /must not begin with "@"/,
      );
    });

    it('includes the offending input and a hint on the error', () => {
      try {
        parseReference('bad');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ReferenceParseError);
        const parseError = error as ReferenceParseError;
        expect(parseError.input).toBe('bad');
        expect(parseError.hint).toContain('namespace/name');
      }
    });
  });
});

describe('tryParseReference', () => {
  it('returns the reference when valid', () => {
    expect(tryParseReference('skillbox/code-review')?.name).toBe('code-review');
  });

  it('returns undefined instead of throwing when invalid', () => {
    expect(tryParseReference('nope')).toBeUndefined();
  });
});

describe('formatQualifiedName', () => {
  it('omits the version', () => {
    expect(formatQualifiedName({ namespace: 'skillbox', name: 'code-review' })).toBe(
      'skillbox/code-review',
    );
  });
});

describe('satisfiesRange', () => {
  it.each([
    ['0.1.0', '^0.1.0', true],
    ['0.1.5', '^0.1.0', true],
    ['0.2.0', '^0.1.0', false],
    ['1.0.0', '^0.1.0', false],
    ['1.2.3', '>=1.0.0 <2.0.0', true],
    ['2.0.0', '>=1.0.0 <2.0.0', false],
    ['0.1.0', '0.1.0', true],
  ])('reports %s against %s as %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });

  it('does not let a prerelease satisfy a plain range', () => {
    // FR-4.5. Without this, `^0.1.0` could silently resolve to an alpha.
    expect(satisfiesRange('0.2.0-alpha.1', '^0.1.0')).toBe(false);
    expect(satisfiesRange('1.0.0-beta.1', '>=0.1.0')).toBe(false);
  });

  it('lets a prerelease satisfy a range that names one', () => {
    expect(satisfiesRange('1.0.0-beta.2', '>=1.0.0-beta.1')).toBe(true);
  });
});

describe('compareVersions', () => {
  it('orders versions ascending', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });

  it('orders a prerelease before its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
  });

  it('sorts a list deterministically', () => {
    const sorted = ['0.2.0', '0.1.0', '1.0.0', '0.1.5'].sort(compareVersions);

    expect(sorted).toEqual(['0.1.0', '0.1.5', '0.2.0', '1.0.0']);
  });
});

describe('isPrerelease', () => {
  it.each([
    ['1.0.0-beta.1', true],
    ['1.0.0-rc.1', true],
    ['1.0.0-0', true],
    ['1.0.0', false],
    ['0.1.0', false],
  ])('reports %s as %s', (version, expected) => {
    expect(isPrerelease(version)).toBe(expected);
  });

  it('reports an unparseable version as not a prerelease', () => {
    expect(isPrerelease('not-a-version')).toBe(false);
  });
});
