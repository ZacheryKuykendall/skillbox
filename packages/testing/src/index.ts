/**
 * @skillbox/testing — shared fixtures and helpers.
 *
 * Private and test-time only. Provides temporary-directory helpers and manifest
 * fixtures so the schema, core, and CLI suites share one definition of what a
 * valid and an invalid resource look like.
 */

export { createTempDir, KIND_DIRECTORY, withTempDir } from './temp.js';
export type { TempDir } from './temp.js';

export { buildManifest, writeRegistry, writeResource } from './registry.js';
export type { ResourceSpec } from './registry.js';

export {
  INVALID_MANIFESTS,
  manifestWith,
  manifestWithMetadata,
  manifestWithSpec,
  VALID_MANIFESTS,
  validManifest,
  validPromptManifest,
} from './fixtures.js';
export type { InvalidManifestFixture } from './fixtures.js';
