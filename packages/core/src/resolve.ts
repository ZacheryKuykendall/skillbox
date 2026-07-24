import {
  compareVersions,
  isPrerelease,
  parseReference,
  ReferenceParseError,
  satisfiesRange,
  type ResourceReference,
} from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { SkillboxError } from './errors.js';
import type { LoadedResource } from './manifest-loader.js';

/**
 * Version resolution: turn a reference into one concrete catalog entry.
 */

/** Parse a reference, converting a parse failure into a SkillboxError. */
export function parseResourceReference(input: string): ResourceReference {
  try {
    return parseReference(input);
  } catch (error) {
    if (error instanceof ReferenceParseError) {
      throw new SkillboxError({
        code: 'INVALID_REFERENCE',
        message: error.message,
        hint: error.hint,
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Resolve a reference against the catalog.
 *
 * - No version requested resolves to the highest stable version (FR-4.3).
 * - An exact version must be present (FR-4.1).
 * - A range resolves to the highest satisfying version (FR-4.2).
 *
 * A prerelease never satisfies a plain range, so `^0.1.0` cannot silently resolve
 * to `0.2.0-alpha.1` (FR-4.5). A prerelease is still reachable by requesting it
 * exactly.
 *
 * @throws {SkillboxError} `RESOURCE_NOT_FOUND` when the name is unknown, or
 * `VERSION_NOT_FOUND` when no version satisfies the request.
 */
export function resolve(
  catalog: Catalog,
  reference: string | ResourceReference,
): LoadedResource {
  const parsed =
    typeof reference === 'string' ? parseResourceReference(reference) : reference;

  const versions = catalog.versionsOf(parsed.qualifiedName);

  // Destructuring here handles the empty case once, so later lookups are typed
  // without a redundant undefined guard.
  const [newest] = versions;

  if (newest === undefined) {
    const suggestion = suggestionFor(catalog, parsed.qualifiedName);

    throw new SkillboxError({
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource "${parsed.qualifiedName}" was not found in the catalog.`,
      hint:
        suggestion === undefined
          ? 'Run skillbox search to list available resources.'
          : `Did you mean "${suggestion}"? Run skillbox search to list available resources.`,
    });
  }

  if (parsed.version === undefined) {
    // Falling back to a prerelease beats failing when that is all that exists,
    // which is common for a resource still at 0.x-alpha.
    return (
      versions.find(
        (candidate) => !isPrerelease(candidate.manifest.metadata.version),
      ) ?? newest
    );
  }

  if (parsed.exact) {
    const exact = versions.find(
      (candidate) => candidate.manifest.metadata.version === parsed.version,
    );

    if (exact === undefined) {
      throw versionNotFound(parsed.qualifiedName, parsed.version, versions);
    }
    return exact;
  }

  // versions is already sorted highest-first, so the first match is the highest.
  const satisfying = versions.find((candidate) =>
    satisfiesRange(candidate.manifest.metadata.version, parsed.version!),
  );

  if (satisfying === undefined) {
    throw versionNotFound(parsed.qualifiedName, parsed.version, versions);
  }

  return satisfying;
}

/** Resolve, returning `undefined` rather than throwing. */
export function tryResolve(
  catalog: Catalog,
  reference: string | ResourceReference,
): LoadedResource | undefined {
  try {
    return resolve(catalog, reference);
  } catch {
    return undefined;
  }
}

/** Every available version of a name, highest first. */
export function availableVersions(
  catalog: Catalog,
  qualifiedName: string,
): readonly string[] {
  return catalog
    .versionsOf(qualifiedName)
    .map((resource) => resource.manifest.metadata.version)
    .sort((a, b) => compareVersions(b, a));
}

function versionNotFound(
  qualifiedName: string,
  requested: string,
  versions: readonly LoadedResource[],
): SkillboxError {
  const available = versions
    .map((resource) => resource.manifest.metadata.version)
    .sort((a, b) => compareVersions(b, a));

  return new SkillboxError({
    code: 'VERSION_NOT_FOUND',
    message: `No version of "${qualifiedName}" satisfies "${requested}".`,
    // Listing what is available turns a dead end into a next step (FR-4.4).
    details: [`Available: ${available.join(', ')}`],
    hint: 'Request one of the available versions, or widen the range.',
  });
}

/**
 * Find the closest catalog name, to catch a typo.
 *
 * Uses edit distance with a threshold proportional to length, so "code-reviw"
 * suggests "code-review" but an unrelated name suggests nothing.
 */
function suggestionFor(catalog: Catalog, qualifiedName: string): string | undefined {
  let best: { name: string; distance: number } | undefined;

  for (const candidate of catalog.names()) {
    const distance = editDistance(qualifiedName, candidate);

    if (best === undefined || distance < best.distance) {
      best = { name: candidate, distance };
    }
  }

  if (best === undefined) return undefined;

  const threshold = Math.max(2, Math.floor(qualifiedName.length / 4));
  return best.distance <= threshold ? best.name : undefined;
}

/** Levenshtein distance, iterative with a single row of state. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + substitutionCost,
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}
