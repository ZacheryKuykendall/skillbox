import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Lockfile, ProjectManifest } from '@skillbox/schema';

import { SkillboxError, wrapError } from './errors.js';
import { digestOf } from './integrity.js';
import { lockedResourceFor, withLockedResource } from './lockfile.js';
import type { InstallPlan, PlannedResource } from './plan.js';
import { toPosixRelative } from './paths.js';
import { withResource } from './project.js';
import { substituteInFile } from './variables.js';

/**
 * Applying an install plan, with rollback.
 *
 * The mutating half of the plan/apply split. Every created file and every
 * overwritten file's prior content is journaled, so a failure at any point
 * restores the prior state (FR-8.3).
 *
 * The project manifest and lockfile are written **last**, after all file
 * operations succeed, so a crash cannot leave configuration claiming an install
 * that did not finish.
 */

/** What was actually installed. */
export interface InstallResult {
  readonly manifest: ProjectManifest;
  readonly lockfile: Lockfile;
  /** Resources installed, in dependency order. */
  readonly installed: readonly {
    readonly qualifiedName: string;
    readonly version: string;
    readonly files: readonly string[];
  }[];
  /** Resources skipped because they were already at the resolved version. */
  readonly skipped: readonly string[];
}

/** One journal entry, recording how to undo a single write. */
type JournalEntry =
  | { readonly kind: 'created-file'; readonly path: string }
  | { readonly kind: 'created-directory'; readonly path: string }
  | {
      readonly kind: 'overwritten-file';
      readonly path: string;
      readonly previous: Buffer;
    };

export interface ApplyOptions {
  readonly plan: InstallPlan;
  readonly manifest: ProjectManifest;
  readonly lockfile: Lockfile;
  /** Requested ranges to record in the project manifest, by qualified name. */
  readonly requestedRanges: ReadonlyMap<string, string>;
  /** Registry root, so lockfile source paths can be recorded relatively. */
  readonly registryRoot: string;
  /**
   * Injected failure point, for testing rollback. Called before each file write;
   * throwing simulates a mid-install failure.
   */
  readonly beforeWrite?: (destination: string) => void;
}

/**
 * Apply an install plan.
 *
 * On any failure the filesystem is restored and the error is rethrown, so the
 * caller never has to reason about partial state.
 *
 * @throws {SkillboxError}
 */
export async function applyPlan(options: ApplyOptions): Promise<InstallResult> {
  const { plan, requestedRanges, registryRoot, beforeWrite } = options;

  const journal: JournalEntry[] = [];
  const variables = options.manifest.spec.variables ?? {};

  let manifest = options.manifest;
  let lockfile = options.lockfile;

  const installed: { qualifiedName: string; version: string; files: string[] }[] = [];
  const skipped: string[] = [];

  try {
    for (const resource of plan.resources) {
      if (
        resource.alreadyInstalled &&
        resource.files.every((file) => file.overwrites)
      ) {
        skipped.push(resource.qualifiedName);
        continue;
      }

      const digests = await installResource({
        resource,
        variables,
        journal,
        beforeWrite,
      });

      lockfile = withLockedResource(
        lockfile,
        resource.qualifiedName,
        lockedResourceFor({
          version: resource.version,
          kind: resource.kind as Parameters<typeof lockedResourceFor>[0]['kind'],
          sourcePath: toPosixRelative(registryRoot, resource.node.resource.directory),
          target: resource.target,
          files: digests,
          dependencies: resource.dependencies,
          requestedBy: resource.direct ? 'direct' : resource.requestedBy,
        }),
      );

      // Only directly requested resources are recorded in the project manifest.
      // A transitive dependency belongs in the lockfile, not in the statement of
      // what the project asked for.
      if (resource.direct) {
        manifest = withResource(manifest, {
          resource: resource.qualifiedName,
          version:
            requestedRanges.get(resource.qualifiedName) ?? `^${resource.version}`,
          ...(resource.target === resource.node.resource.target
            ? {}
            : { target: resource.target }),
        });
      }

      installed.push({
        qualifiedName: resource.qualifiedName,
        version: resource.version,
        files: Object.keys(digests).sort(),
      });
    }
  } catch (error) {
    await rollback(journal);
    throw error;
  }

  return { manifest, lockfile, installed, skipped };
}

async function installResource(context: {
  resource: PlannedResource;
  variables: Readonly<Record<string, string>>;
  journal: JournalEntry[];
  beforeWrite: ApplyOptions['beforeWrite'];
}): Promise<Record<string, string>> {
  const { resource, variables, journal, beforeWrite } = context;
  const digests: Record<string, string> = {};

  for (const file of resource.files) {
    beforeWrite?.(file.destination);

    const source = await readFile(file.absoluteSource).catch((error: unknown) => {
      throw wrapError(error, {
        code: 'IO_ERROR',
        message: `Could not read "${file.source}" from ${resource.identifier}.`,
        location: file.absoluteSource,
        hint: 'Check the resource directory is intact.',
      });
    });

    const contents = substituteInFile(file.source, source, variables);

    await ensureDirectory(path.dirname(file.absoluteDestination), journal);

    if (file.overwrites) {
      // Capture prior content so rollback can restore it exactly.
      const previous = await readFile(file.absoluteDestination).catch(() => undefined);

      if (previous !== undefined) {
        journal.push({
          kind: 'overwritten-file',
          path: file.absoluteDestination,
          previous,
        });
      }
    } else {
      journal.push({ kind: 'created-file', path: file.absoluteDestination });
    }

    await writeFile(file.absoluteDestination, contents).catch((error: unknown) => {
      throw wrapError(error, {
        code: 'IO_ERROR',
        message: `Could not write "${file.destination}".`,
        location: file.absoluteDestination,
        hint: 'Check the destination is writable.',
      });
    });

    digests[file.destination] = digestOf(contents);
  }

  return digests;
}

/**
 * Create a directory, journaling only the segments that did not already exist.
 *
 * Rollback must not delete a directory that was already there, which is why each
 * created segment is recorded individually.
 */
async function ensureDirectory(
  directory: string,
  journal: JournalEntry[],
): Promise<void> {
  const created = await mkdir(directory, { recursive: true });

  // Node returns the first directory it created, or undefined if none were.
  if (created !== undefined) {
    journal.push({ kind: 'created-directory', path: created });
  }
}

/**
 * Undo journaled changes, most recent first.
 *
 * Failures during rollback are swallowed deliberately: the original error is what
 * the user needs to see, and a rollback failure on one entry must not prevent the
 * remaining entries from being undone.
 */
async function rollback(journal: readonly JournalEntry[]): Promise<void> {
  for (const entry of [...journal].reverse()) {
    try {
      switch (entry.kind) {
        case 'created-file':
          await rm(entry.path, { force: true });
          break;
        case 'overwritten-file':
          await writeFile(entry.path, entry.previous);
          break;
        case 'created-directory':
          await rm(entry.path, { recursive: true, force: true });
          break;
      }
    } catch {
      // Continue undoing the rest.
    }
  }
}

/** Error thrown by {@link assertInstallable} when a plan cannot be applied. */
export function assertInstallable(plan: InstallPlan): void {
  if (plan.resources.length === 0) {
    throw new SkillboxError({
      code: 'USAGE_ERROR',
      message: 'Nothing to install.',
      hint: 'Name at least one resource, for example skillbox add skillbox/code-review.',
    });
  }
}
