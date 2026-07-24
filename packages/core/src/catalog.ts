import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MANIFEST_FILENAME,
  compareVersions,
  type Diagnostic,
  type ResourceKind,
} from '@skillbox/schema';

import { SkillboxError } from './errors.js';
import {
  loadResource,
  type LoadedResource,
  type ResourceLoadFailure,
} from './manifest-loader.js';
import { toPosixRelative } from './paths.js';

/**
 * Registry discovery: walk a directory tree and build a queryable catalog.
 *
 * The only registry in v0.1.0 is a local directory. Catalog access sits behind
 * this narrow interface so a remote registry becomes a second implementation
 * rather than a rewrite (ADR-0003).
 */

/** How deep to descend looking for resource directories. */
const MAX_DEPTH = 4;

/** Directories never worth descending into. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.skillbox',
]);

/** The loaded catalog. */
export interface Catalog {
  /** Absolute path of the registry root. */
  readonly root: string;
  /** Every valid resource, ordered by identifier. */
  readonly resources: readonly LoadedResource[];
  /** Resources that failed to load, reported rather than thrown (FR-2.4). */
  readonly failures: readonly ResourceLoadFailure[];

  /** All versions of a `namespace/name`, highest first. */
  versionsOf(qualifiedName: string): readonly LoadedResource[];
  /** Look up an exact `namespace/name@version`. */
  get(identifier: string): LoadedResource | undefined;
  /** Does the catalog contain any version of this `namespace/name`? */
  has(qualifiedName: string): boolean;
  /** Every distinct `namespace/name`, sorted. */
  names(): readonly string[];
}

/**
 * Walk a registry directory and load every resource.
 *
 * Discovery is deterministic: directory entries are sorted before descending, and
 * results are sorted by identifier, so the same tree always yields the same
 * ordering (FR-2.2).
 *
 * A resource whose manifest fails validation is recorded in `failures` and does
 * not abort the scan, so one bad resource cannot make the whole catalog unusable.
 *
 * @throws {SkillboxError} when the root does not exist, or two resources share an
 * identifier.
 */
export async function loadCatalog(registryRoot: string): Promise<Catalog> {
  const root = path.resolve(registryRoot);

  const rootStats = await stat(root).catch(() => undefined);
  if (rootStats?.isDirectory() !== true) {
    throw new SkillboxError({
      code: 'IO_ERROR',
      message: `The registry directory "${registryRoot}" does not exist.`,
      location: root,
      hint: 'Pass --registry <path>, or set SKILLBOX_REGISTRY to the catalog location.',
    });
  }

  const directories = await findResourceDirectories(root, 0);

  const resources: LoadedResource[] = [];
  const failures: ResourceLoadFailure[] = [];

  for (const directory of directories) {
    const result = await loadResource(directory);

    if (result.ok) {
      resources.push(result.resource);
    } else {
      failures.push(result.failure);
    }
  }

  assertNoDuplicates(resources, root);

  resources.sort((a, b) => a.identifier.localeCompare(b.identifier));
  failures.sort((a, b) => a.directory.localeCompare(b.directory));

  return buildCatalog(root, resources, failures);
}

/** Build a catalog from already-loaded resources, without touching the disk. */
export function buildCatalog(
  root: string,
  resources: readonly LoadedResource[],
  failures: readonly ResourceLoadFailure[] = [],
): Catalog {
  const byIdentifier = new Map<string, LoadedResource>();
  const byName = new Map<string, LoadedResource[]>();

  for (const resource of resources) {
    byIdentifier.set(resource.identifier, resource);

    const existing = byName.get(resource.qualifiedName);
    if (existing === undefined) {
      byName.set(resource.qualifiedName, [resource]);
    } else {
      existing.push(resource);
    }
  }

  // Highest version first, so "the newest" is always the head of the list.
  for (const versions of byName.values()) {
    versions.sort((a, b) =>
      compareVersions(b.manifest.metadata.version, a.manifest.metadata.version),
    );
  }

  return {
    root,
    resources,
    failures,

    versionsOf(qualifiedName: string): readonly LoadedResource[] {
      return byName.get(qualifiedName) ?? [];
    },

    get(identifier: string): LoadedResource | undefined {
      return byIdentifier.get(identifier);
    },

    has(qualifiedName: string): boolean {
      return byName.has(qualifiedName);
    },

    names(): readonly string[] {
      return [...byName.keys()].sort();
    },
  };
}

/**
 * Find directories containing a manifest.
 *
 * Does not descend into a resource: a manifest marks a leaf, so a resource's own
 * source files cannot be misread as nested resources.
 */
async function findResourceDirectories(
  directory: string,
  depth: number,
): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  if (entries.some((entry) => entry.isFile() && entry.name === MANIFEST_FILENAME)) {
    return [directory];
  }

  const found: string[] = [];

  // Sorted so discovery order does not depend on filesystem enumeration order.
  const subdirectories = entries
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const name of subdirectories) {
    found.push(
      ...(await findResourceDirectories(path.join(directory, name), depth + 1)),
    );
  }

  return found;
}

/**
 * Reject two resources claiming the same identifier.
 *
 * An ambiguous catalog would make resolution non-deterministic, so this is an
 * error rather than a warning (FR-2.3).
 */
function assertNoDuplicates(resources: readonly LoadedResource[], root: string): void {
  const seen = new Map<string, LoadedResource>();

  for (const resource of resources) {
    const existing = seen.get(resource.identifier);

    if (existing !== undefined) {
      throw new SkillboxError({
        code: 'DUPLICATE_RESOURCE',
        message: `Two resources declare the identifier "${resource.identifier}".`,
        details: [
          toPosixRelative(root, existing.directory),
          toPosixRelative(root, resource.directory),
        ],
        hint: 'Each namespace/name@version must be unique. Change one version or name.',
      });
    }

    seen.set(resource.identifier, resource);
  }
}

/** Every kind present in the catalog. */
export function kindsInCatalog(catalog: Catalog): readonly ResourceKind[] {
  return [...new Set(catalog.resources.map((r) => r.manifest.kind))].sort();
}

/** Flatten catalog failures into diagnostics with their file locations. */
export function failureDiagnostics(catalog: Catalog): readonly {
  readonly location: string;
  readonly diagnostics: readonly Diagnostic[];
}[] {
  return catalog.failures.map((failure) => ({
    location: failure.manifestPath,
    diagnostics: failure.diagnostics,
  }));
}
