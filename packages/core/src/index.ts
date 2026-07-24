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
