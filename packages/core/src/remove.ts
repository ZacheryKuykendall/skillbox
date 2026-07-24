import { readdir, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { Lockfile, ProjectManifest } from '@skillbox/schema';

import { SkillboxError } from './errors.js';
import { digestOfFile } from './integrity.js';
import { lockedDependents, withoutLockedResource } from './lockfile.js';
import { fromPosix, isInside } from './paths.js';
import { withoutResource, type Project } from './project.js';

/**
 * Safe removal.
 *
 * Deletes only files the lockfile records as owned by the resource, and refuses
 * to delete a file that has been edited since installation — overwriting or
 * deleting someone's work without warning is the failure mode this exists to
 * prevent (FR-9.2).
 */

export interface RemovePlan {
  readonly qualifiedName: string;
  readonly version: string;
  /** Files that will be deleted, POSIX-relative. */
  readonly files: readonly string[];
  /** Files edited since installation, which are preserved unless forced. */
  readonly modified: readonly string[];
  /** Files already gone, reported but not an error. */
  readonly missing: readonly string[];
  /** Installed resources that depend on this one. */
  readonly dependents: readonly string[];
}

export interface RemoveResult {
  readonly manifest: ProjectManifest;
  readonly lockfile: Lockfile;
  /** Files actually deleted. */
  readonly removed: readonly string[];
  /** Files preserved because they were modified. */
  readonly preserved: readonly string[];
  /** Directories cleaned up because they became empty. */
  readonly removedDirectories: readonly string[];
}

/**
 * Plan a removal without changing anything.
 *
 * @throws {SkillboxError} `RESOURCE_NOT_INSTALLED`.
 */
export async function planRemove(
  project: Project,
  qualifiedName: string,
): Promise<RemovePlan> {
  const locked = project.lockfile.resources[qualifiedName];

  if (locked === undefined) {
    throw new SkillboxError({
      code: 'RESOURCE_NOT_INSTALLED',
      message: `"${qualifiedName}" is not installed in this project.`,
      hint: 'Run skillbox list to see what is installed.',
    });
  }

  const files: string[] = [];
  const modified: string[] = [];
  const missing: string[] = [];

  for (const [installedPath, recordedDigest] of Object.entries(locked.files).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const absolute = path.join(project.root, fromPosix(installedPath));

    // Checked during planning, not just before deleting: a lockfile can arrive
    // via a pull request, so a tampered path must be rejected even when the file
    // it names does not exist (T5).
    if (!isInside(project.root, absolute)) {
      throw new SkillboxError({
        code: 'UNSAFE_PATH',
        message: `The lockfile records "${installedPath}" for ${qualifiedName}, which is outside the project directory.`,
        hint: 'Inspect the lockfile for tampering and regenerate it with skillbox add.',
      });
    }

    const stats = await stat(absolute).catch(() => undefined);

    if (stats === undefined) {
      missing.push(installedPath);
      continue;
    }

    const currentDigest = await digestOfFile(absolute).catch(() => undefined);

    if (currentDigest !== recordedDigest) {
      modified.push(installedPath);
    } else {
      files.push(installedPath);
    }
  }

  return {
    qualifiedName,
    version: locked.version,
    files,
    modified,
    missing,
    dependents: lockedDependents(project.lockfile, qualifiedName),
  };
}

export interface RemoveOptions {
  readonly project: Project;
  readonly qualifiedName: string;
  /** Delete modified files, and remove despite dependents. */
  readonly force?: boolean | undefined;
}

/**
 * Remove an installed resource.
 *
 * @throws {SkillboxError} `RESOURCE_NOT_INSTALLED`, `DEPENDENTS_EXIST`, or
 * `MODIFIED_FILES`.
 */
export async function removeResource(options: RemoveOptions): Promise<RemoveResult> {
  const { project, qualifiedName } = options;
  const force = options.force === true;

  const plan = await planRemove(project, qualifiedName);

  if (!force && plan.dependents.length > 0) {
    throw new SkillboxError({
      code: 'DEPENDENTS_EXIST',
      message: `"${qualifiedName}" is required by ${String(plan.dependents.length)} installed ${
        plan.dependents.length === 1 ? 'resource' : 'resources'
      }.`,
      details: plan.dependents,
      hint: 'Remove the dependents first, or pass --force.',
    });
  }

  if (!force && plan.modified.length > 0) {
    throw new SkillboxError({
      code: 'MODIFIED_FILES',
      message: `${String(plan.modified.length)} ${
        plan.modified.length === 1 ? 'file has' : 'files have'
      } local modifications.`,
      details: plan.modified,
      hint: 'Back up your changes, then pass --force to remove them anyway.',
    });
  }

  const toDelete = force ? [...plan.files, ...plan.modified] : plan.files;
  const removed: string[] = [];

  for (const installedPath of toDelete) {
    // planRemove already rejected any path outside the project, so this resolve
    // is safe.
    await rm(path.join(project.root, fromPosix(installedPath)), { force: true });
    removed.push(installedPath);
  }

  const removedDirectories = await pruneEmptyDirectories(
    project.root,
    toDelete.map((installedPath) =>
      path.dirname(path.join(project.root, fromPosix(installedPath))),
    ),
  );

  return {
    manifest: withoutResource(project.manifest, qualifiedName),
    lockfile: withoutLockedResource(project.lockfile, qualifiedName),
    removed,
    preserved: force ? [] : plan.modified,
    removedDirectories,
  };
}

/**
 * Delete directories left empty, walking upward.
 *
 * A directory containing anything unrelated is left alone (FR-9.5), so removing a
 * component from `src/components/x` cannot take `src/` with it.
 */
async function pruneEmptyDirectories(
  root: string,
  directories: readonly string[],
): Promise<string[]> {
  const pruned: string[] = [];

  // Deepest first, so a parent becomes prunable only after its children are gone.
  const sorted = [...new Set(directories)].sort((a, b) => b.length - a.length);

  for (const directory of sorted) {
    let current = directory;

    while (isInside(root, current)) {
      const entries = await readdir(current).catch(() => undefined);

      if (entries === undefined || entries.length > 0) break;

      // rmdir rather than rm: it refuses a non-empty directory, which is a
      // second guard against deleting something that is not actually empty.
      // (`rm` without `recursive` simply fails on any directory.)
      const removedDirectory = await rmdir(current).then(
        () => true,
        () => false,
      );

      if (!removedDirectory) break;

      pruned.push(current);
      current = path.dirname(current);
    }
  }

  return pruned;
}
