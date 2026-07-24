/**
 * @skillbox/core — the domain layer.
 *
 * Owns catalog discovery, resolution, dependency graphs, install planning,
 * filesystem application, lockfiles, and diagnostics.
 *
 * Must not import CLI presentation logic and must not write to stdout
 * (ADR-0001). Operations return data; the caller decides how to present it.
 */

export { ERROR_CODES, SkillboxError, wrapError } from './errors.js';
export type { ErrorCode, SkillboxErrorOptions } from './errors.js';

// --- paths and integrity ----------------------------------------------------

export {
  assertRealPathInside,
  fromPosix,
  isInside,
  normalizePosix,
  resolveInside,
  toPosixRelative,
} from './paths.js';

export {
  aggregateDigest,
  digestOf,
  digestOfFile,
  digestsMatch,
  isDigest,
} from './integrity.js';

// --- catalog ----------------------------------------------------------------

export {
  buildCatalog,
  failureDiagnostics,
  kindsInCatalog,
  loadCatalog,
} from './catalog.js';
export type { Catalog } from './catalog.js';

export {
  loadResource,
  loadResourceOrThrow,
  readResourceFiles,
} from './manifest-loader.js';
export type {
  LoadResult,
  LoadedResource,
  ResourceLoadFailure,
} from './manifest-loader.js';

// --- search and resolution --------------------------------------------------

export { search } from './search.js';
export type { SearchHit, SearchOptions } from './search.js';

export {
  availableVersions,
  parseResourceReference,
  resolve,
  tryResolve,
} from './resolve.js';

export { buildGraph, dependentsOf } from './graph.js';
export type { DependencyGraph, GraphNode } from './graph.js';

// --- planning ---------------------------------------------------------------

export {
  assertNoConflicts,
  describeConflict,
  planInstall,
  plannedPaths,
} from './plan.js';
export type {
  ConflictKind,
  InstallPlan,
  PlanConflict,
  PlanOptions,
  PlannedFile,
  PlannedResource,
} from './plan.js';
