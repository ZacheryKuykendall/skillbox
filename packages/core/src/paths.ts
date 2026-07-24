import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { checkManifestPath, describePathRejection } from '@skillbox/schema';

import { SkillboxError } from './errors.js';

/**
 * Containment-checked path resolution.
 *
 * The runtime half of the path security boundary. `@skillbox/schema` rejects
 * malformed paths as data; this module verifies a resolved path actually stays
 * inside a real directory, which the schema cannot do because it has no
 * filesystem access and cannot resolve symlinks.
 *
 * Both layers are necessary. See docs/architecture/security-model.md.
 */

/**
 * Is `candidate` inside `root`?
 *
 * Uses path relativity rather than string prefix comparison. `startsWith` is
 * wrong here in three ways: it accepts `/project-evil` for a root of `/project`,
 * it fails on Windows case differences (`C:\Project` vs `c:\project`), and it
 * does not normalize away `..` segments. `path.relative` normalizes first, so a
 * traversal shows up as a leading `..` (SR-13).
 *
 * A candidate equal to the root is *not* contained: there is nothing to write.
 */
export function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);

  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (relative.length === 0) return false;
  if (relative === '..') return false;
  if (relative.startsWith(`..${path.sep}`)) return false;
  if (path.isAbsolute(relative)) return false;

  return true;
}

/**
 * Resolve a relative manifest path against a root, rejecting anything unsafe.
 *
 * Validates the path as data first, then confirms the resolved result is
 * contained. The containment check is not redundant: on a case-insensitive
 * filesystem, and with platform-specific normalization, a path that passes the
 * textual checks can still resolve outside the root.
 *
 * @throws {SkillboxError} with code `UNSAFE_PATH`.
 */
export function resolveInside(
  root: string,
  relativePath: string,
  context: { readonly field: string; readonly location?: string },
): string {
  const rejection = checkManifestPath(relativePath);

  if (rejection !== undefined) {
    throw new SkillboxError({
      code: 'UNSAFE_PATH',
      message: `The path "${relativePath}" ${describePathRejection(rejection)}.`,
      location: context.location,
      hint: `${context.field} must be a relative, POSIX-style path inside the project directory.`,
    });
  }

  // Manifest paths are POSIX-style; translate for the host platform (NFR-2).
  const resolved = path.resolve(root, ...relativePath.split('/'));

  if (!isInside(root, resolved)) {
    throw new SkillboxError({
      code: 'UNSAFE_PATH',
      message: `The path "${relativePath}" resolves outside the permitted directory.`,
      location: context.location,
      hint: `${context.field} must stay inside the project directory.`,
    });
  }

  return resolved;
}

/**
 * Resolve a path and verify its real location is contained, following symlinks.
 *
 * A textual check cannot catch a pre-planted symlink: an attacker who creates
 * `project/target -> /etc` makes a write to `project/target/passwd` land outside
 * the project even though every path component looks relative.
 *
 * Since the destination itself may not exist yet, this resolves the nearest
 * existing ancestor and checks *that*.
 *
 * @throws {SkillboxError} with code `UNSAFE_PATH`.
 */
export async function assertRealPathInside(
  root: string,
  target: string,
  context: { readonly field: string; readonly location?: string },
): Promise<void> {
  const realRoot = await realpath(root).catch(() => path.resolve(root));

  let existing = path.resolve(target);

  // Walk up until a component exists. The loop terminates because path.dirname
  // eventually reaches the filesystem root and stops changing.
  for (;;) {
    try {
      const real = await realpath(existing);

      if (real !== realRoot && !isInside(realRoot, real)) {
        throw new SkillboxError({
          code: 'UNSAFE_PATH',
          message: `The path "${target}" resolves outside the project directory through a symbolic link.`,
          location: context.location,
          hint: `${context.field} must not pass through a link that leaves the project directory.`,
        });
      }
      return;
    } catch (error) {
      if (SkillboxError.is(error)) throw error;

      const parent = path.dirname(existing);

      // Reached the filesystem root without finding an existing component.
      if (parent === existing) return;

      existing = parent;
    }
  }
}

/**
 * Convert a host path to the POSIX-style relative form used in manifests,
 * lockfiles, and output.
 *
 * Always producing `/` keeps lockfiles byte-identical across platforms, which is
 * what makes integrity digests and diffs stable (ADR-0004).
 */
export function toPosixRelative(root: string, target: string): string {
  return path
    .relative(path.resolve(root), path.resolve(target))
    .split(path.sep)
    .join('/');
}

/** Convert a POSIX-style relative path to a host path, without resolving it. */
export function fromPosix(relativePath: string): string {
  return relativePath.split('/').join(path.sep);
}

/**
 * Normalize a POSIX-style relative path for comparison and hashing.
 *
 * Collapses redundant separators and resolves interior segments without touching
 * the filesystem. Returns `undefined` when the result would escape.
 */
export function normalizePosix(relativePath: string): string | undefined {
  const normalized = path.posix.normalize(relativePath);

  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized === '.') {
    return undefined;
  }

  return normalized;
}
