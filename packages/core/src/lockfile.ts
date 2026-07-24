import {
  LOCKFILE_VERSION,
  emptyLockfile,
  type Lockfile,
  type LockedResource,
} from '@skillbox/schema';
import { stringify as stringifyYaml } from 'yaml';

import { aggregateDigest } from './integrity.js';

/**
 * Deterministic lockfile serialization.
 *
 * Identical inputs must produce byte-identical output on every machine and
 * platform. A lockfile that churns stops being reviewed, and the integrity
 * information it carries stops being read — which is the whole reason it exists
 * (ADR-0004).
 *
 * The rules, all enforced here and asserted in tests:
 *
 * 1. Every mapping is serialized in sorted key order, at every level.
 * 2. No timestamps. The specification permits one; recording it would guarantee
 *    a diff on every reinstall.
 * 3. No absolute paths, so the file is portable between machines.
 * 4. No environment or machine data.
 * 5. An explicit `lockfileVersion`, so a format change is detectable.
 * 6. Fixed YAML emission options, so the serializer cannot introduce variation.
 */

/** Recursively sort object keys so serialization order is fixed. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Array order is meaningful, so elements are not reordered.
    return value.map(sortDeep);
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return Object.fromEntries(entries.map(([key, entry]) => [key, sortDeep(entry)]));
  }

  return value;
}

/** Serialize a lockfile deterministically. */
export function serializeLockfile(lockfile: Lockfile): string {
  return stringifyYaml(sortDeep(lockfile), {
    lineWidth: 0,
    indent: 2,
    // Anchors and aliases would make output depend on object identity rather
    // than on content, which is exactly the nondeterminism to avoid.
    aliasDuplicateObjects: false,
    sortMapEntries: true,
  });
}

/** Build one lockfile entry from an installed resource's facts. */
export function lockedResourceFor(options: {
  readonly version: string;
  readonly kind: LockedResource['kind'];
  /** Registry-relative source path, POSIX-style. */
  readonly sourcePath: string;
  readonly target: string;
  /** Project-relative installed paths mapped to digests, POSIX-style. */
  readonly files: Readonly<Record<string, string>>;
  readonly dependencies?: readonly string[];
  readonly requestedBy: string;
}): LockedResource {
  return {
    version: options.version,
    kind: options.kind,
    source: { type: 'local', path: options.sourcePath },
    integrity: aggregateDigest(options.files),
    target: options.target,
    files: { ...options.files },
    ...(options.dependencies === undefined || options.dependencies.length === 0
      ? {}
      : { dependencies: [...options.dependencies].sort() }),
    requestedBy: options.requestedBy,
  };
}

/** Return a lockfile with an entry added or replaced. */
export function withLockedResource(
  lockfile: Lockfile,
  qualifiedName: string,
  entry: LockedResource,
): Lockfile {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    resources: { ...lockfile.resources, [qualifiedName]: entry },
  };
}

/** Return a lockfile with an entry removed. */
export function withoutLockedResource(
  lockfile: Lockfile,
  qualifiedName: string,
): Lockfile {
  const remaining = { ...lockfile.resources };
  delete remaining[qualifiedName];

  return { lockfileVersion: LOCKFILE_VERSION, resources: remaining };
}

/** Every installed path in a lockfile, mapped to its owning resource. */
export function fileOwnership(lockfile: Lockfile): ReadonlyMap<string, string> {
  const ownership = new Map<string, string>();

  for (const [name, locked] of Object.entries(lockfile.resources)) {
    for (const installedPath of Object.keys(locked.files)) {
      ownership.set(installedPath, name);
    }
  }

  return ownership;
}

/** Resources in the lockfile that declare a dependency on the given resource. */
export function lockedDependents(
  lockfile: Lockfile,
  qualifiedName: string,
): readonly string[] {
  return Object.entries(lockfile.resources)
    .filter(([, locked]) => (locked.dependencies ?? []).includes(qualifiedName))
    .map(([name]) => name)
    .sort();
}

/** An empty lockfile. Re-exported so callers need one import. */
export { emptyLockfile };
