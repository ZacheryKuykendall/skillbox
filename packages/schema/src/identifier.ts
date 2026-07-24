import semver from 'semver';
import { z } from 'zod';

import {
  IDENTIFIER_MAX_LENGTH,
  IDENTIFIER_MIN_LENGTH,
  IDENTIFIER_PATTERN,
} from './constants.js';

/**
 * Resource identifiers and version rules.
 *
 * Canonical identifier form is `namespace/name@version`, for example
 * `skillbox/code-review@0.1.0`. See docs/architecture/resource-model.md, which
 * is normative for these rules.
 */

/**
 * A namespace, resource name, or tag.
 *
 * Deliberately narrower than npm's naming rules: lowercase alphanumeric with
 * internal hyphens only. This keeps identifiers usable as directory names on
 * case-insensitive filesystems and unambiguous inside a
 * `namespace/name@version` string.
 */
export const identifierSchema = z
  .string()
  .min(IDENTIFIER_MIN_LENGTH, {
    message: `must be at least ${String(IDENTIFIER_MIN_LENGTH)} characters`,
  })
  .max(IDENTIFIER_MAX_LENGTH, {
    message: `must be at most ${String(IDENTIFIER_MAX_LENGTH)} characters`,
  })
  .regex(IDENTIFIER_PATTERN, {
    message:
      'must contain only lowercase letters, digits, and internal hyphens (pattern: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)',
  });

/** A strict semantic version. Ranges are rejected. */
export const versionSchema = z
  .string()
  .refine((value) => semver.valid(value) !== null, {
    message: 'must be a strict semantic version such as 1.0.0 or 0.2.1-beta.1',
  });

/** A semantic version range, such as `^0.1.0` or `>=1.2.3 <2.0.0`. */
export const versionRangeSchema = z
  .string()
  .refine((value) => semver.validRange(value) !== null, {
    message:
      'must be a semantic version range such as ^0.1.0, ~1.2.0, or >=1.0.0 <2.0.0',
  });

/** A `namespace/name` pair with no version. */
export const resourceNameSchema = z.string().refine(
  (value) => {
    const parts = value.split('/');
    if (parts.length !== 2) return false;
    return parts.every(
      (part) =>
        IDENTIFIER_PATTERN.test(part) &&
        part.length >= IDENTIFIER_MIN_LENGTH &&
        part.length <= IDENTIFIER_MAX_LENGTH,
    );
  },
  { message: 'must be in the form namespace/name, for example skillbox/code-review' },
);

/** The parts of a parsed resource reference. */
export interface ResourceReference {
  readonly namespace: string;
  readonly name: string;
  /** `namespace/name`, without a version. */
  readonly qualifiedName: string;
  /**
   * The requested version or range, or `undefined` when none was given.
   * `undefined` means "the highest stable version".
   */
  readonly version: string | undefined;
  /** True when {@link version} is an exact version rather than a range. */
  readonly exact: boolean;
}

/** A fully resolved identifier: namespace, name, and an exact version. */
export interface ResourceIdentifier {
  readonly namespace: string;
  readonly name: string;
  readonly version: string;
}

export class ReferenceParseError extends Error {
  readonly input: string;
  readonly hint: string;

  constructor(input: string, reason: string, hint: string) {
    super(`Invalid resource reference "${input}": ${reason}`);
    this.name = 'ReferenceParseError';
    this.input = input;
    this.hint = hint;
  }
}

/**
 * Parse a resource reference.
 *
 * Accepts `namespace/name`, `namespace/name@version`, and
 * `namespace/name@range`.
 *
 * @throws {ReferenceParseError} when the reference is malformed.
 */
export function parseReference(input: string): ResourceReference {
  if (input.length === 0) {
    throw new ReferenceParseError(
      input,
      'the reference is empty',
      'Use namespace/name.',
    );
  }

  // An npm-style leading scope is rejected so there is exactly one canonical
  // form. Accepting both would make `@a/b` and `a/b` ambiguous in output.
  if (input.startsWith('@')) {
    throw new ReferenceParseError(
      input,
      'references must not begin with "@"',
      'Use namespace/name rather than an npm-style @scope/name.',
    );
  }

  const atIndex = input.indexOf('@');
  const namePart = atIndex === -1 ? input : input.slice(0, atIndex);
  const versionPart = atIndex === -1 ? undefined : input.slice(atIndex + 1);

  const slashIndex = namePart.indexOf('/');
  if (slashIndex === -1) {
    throw new ReferenceParseError(
      input,
      'a namespace is required',
      'Use namespace/name, for example skillbox/code-review.',
    );
  }
  if (namePart.includes('/', slashIndex + 1)) {
    throw new ReferenceParseError(
      input,
      'a reference must contain exactly one "/"',
      'Use namespace/name, for example skillbox/code-review.',
    );
  }

  const namespace = namePart.slice(0, slashIndex);
  const name = namePart.slice(slashIndex + 1);

  for (const [label, value] of [
    ['namespace', namespace],
    ['name', name],
  ] as const) {
    if (value.length === 0) {
      throw new ReferenceParseError(
        input,
        `the ${label} is empty`,
        'Use namespace/name, for example skillbox/code-review.',
      );
    }
    if (!IDENTIFIER_PATTERN.test(value)) {
      throw new ReferenceParseError(
        input,
        `the ${label} "${value}" must contain only lowercase letters, digits, and internal hyphens`,
        'Names use lowercase letters, digits, and hyphens between characters.',
      );
    }
    if (value.length < IDENTIFIER_MIN_LENGTH || value.length > IDENTIFIER_MAX_LENGTH) {
      throw new ReferenceParseError(
        input,
        `the ${label} "${value}" must be between ${String(IDENTIFIER_MIN_LENGTH)} and ${String(IDENTIFIER_MAX_LENGTH)} characters`,
        'Shorten or lengthen the name to fit the allowed range.',
      );
    }
  }

  if (versionPart !== undefined) {
    if (versionPart.length === 0) {
      throw new ReferenceParseError(
        input,
        'a version was expected after "@"',
        'Either omit "@" or supply a version such as @0.1.0 or @^0.1.0.',
      );
    }
    if (semver.validRange(versionPart) === null) {
      throw new ReferenceParseError(
        input,
        `"${versionPart}" is not a valid version or range`,
        'Use an exact version such as 0.1.0 or a range such as ^0.1.0.',
      );
    }
  }

  return {
    namespace,
    name,
    qualifiedName: `${namespace}/${name}`,
    version: versionPart,
    exact: versionPart !== undefined && semver.valid(versionPart) !== null,
  };
}

/** Parse a reference, returning `undefined` instead of throwing. */
export function tryParseReference(input: string): ResourceReference | undefined {
  try {
    return parseReference(input);
  } catch {
    return undefined;
  }
}

/** Format a resolved identifier as `namespace/name@version`. */
export function formatIdentifier(identifier: ResourceIdentifier): string {
  return `${identifier.namespace}/${identifier.name}@${identifier.version}`;
}

/** Format the `namespace/name` portion of an identifier. */
export function formatQualifiedName(
  identifier: Pick<ResourceIdentifier, 'namespace' | 'name'>,
): string {
  return `${identifier.namespace}/${identifier.name}`;
}

/**
 * Does `version` satisfy `range`?
 *
 * Prereleases do not satisfy a range unless the range itself names a
 * prerelease (FR-4.5). `includePrerelease` is deliberately left off so that
 * `^0.1.0` never silently resolves to `0.2.0-alpha.1`.
 */
export function satisfiesRange(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

/** Compare two versions. Negative when `a` precedes `b`. */
export function compareVersions(a: string, b: string): number {
  return semver.compare(a, b);
}

/** Is this a prerelease version? */
export function isPrerelease(version: string): boolean {
  const parsed = semver.parse(version);
  return parsed !== null && parsed.prerelease.length > 0;
}
