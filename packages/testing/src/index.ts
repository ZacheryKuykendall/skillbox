/**
 * @skillbox/testing — shared fixtures and helpers.
 *
 * Private and test-time only. Provides temporary-directory helpers and manifest
 * fixtures so the schema, core, and CLI suites share one definition of what a
 * valid and an invalid resource look like.
 */

export { createTempDir, withTempDir } from './temp.js';
export type { TempDir } from './temp.js';
