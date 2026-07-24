import { compareVersions, satisfiesRange } from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { SkillboxError } from './errors.js';
import { planInstall, type InstallPlan } from './plan.js';
import { requestedResources, type Project } from './project.js';
import { availableVersions } from './resolve.js';

/**
 * Update planning.
 *
 * Finds newer versions compatible with what the project requested, and produces a
 * plan so conflicts are detected before any file changes (FR-10.2, FR-10.3).
 */

/** One resource's update status. */
export interface UpdateCandidate {
  readonly qualifiedName: string;
  readonly requestedRange: string;
  readonly currentVersion: string;
  /** The highest version satisfying the requested range. */
  readonly targetVersion: string;
  readonly upToDate: boolean;
  /**
   * A newer version exists but falls outside the requested range. Reported so a
   * user can widen the range deliberately rather than being silently stuck.
   */
  readonly blockedByRange: string | undefined;
}

export interface UpdateReport {
  readonly candidates: readonly UpdateCandidate[];
  /** Candidates that would actually change, in name order. */
  readonly updatable: readonly UpdateCandidate[];
  /** The install plan for the updatable set, or `undefined` when there is none. */
  readonly plan: InstallPlan | undefined;
}

export interface UpdateOptions {
  readonly project: Project;
  readonly catalog: Catalog;
  /** Limit to one resource. Omit to consider everything installed. */
  readonly only?: string | undefined;
}

/**
 * Work out what could be updated.
 *
 * Respects the range recorded in the project manifest: update will not cross a
 * range boundary (FR-10.1). Moving to a new major version is a deliberate act,
 * done by editing the manifest and running `add`.
 *
 * @throws {SkillboxError} `RESOURCE_NOT_INSTALLED` when `only` names something
 * that is not installed.
 */
export async function planUpdate(options: UpdateOptions): Promise<UpdateReport> {
  const { project, catalog } = options;

  const requested = requestedResources(project.manifest);

  if (options.only !== undefined && !requested.has(options.only)) {
    throw new SkillboxError({
      code: 'RESOURCE_NOT_INSTALLED',
      message: `"${options.only}" is not recorded in the project manifest.`,
      hint: 'Run skillbox list to see what is installed.',
    });
  }

  const names =
    options.only === undefined ? [...requested.keys()].sort() : [options.only];

  const candidates: UpdateCandidate[] = [];

  for (const qualifiedName of names) {
    const entry = requested.get(qualifiedName);
    if (entry === undefined) continue;

    const locked = project.lockfile.resources[qualifiedName];
    const currentVersion = locked?.version ?? 'not installed';

    const available = availableVersions(catalog, qualifiedName);

    if (available.length === 0) {
      throw new SkillboxError({
        code: 'RESOURCE_NOT_FOUND',
        message: `"${qualifiedName}" is recorded in the project but is not in the catalog.`,
        hint: 'Check the registry path, or remove the resource from the project manifest.',
      });
    }

    const satisfying = available.filter((version) =>
      satisfiesRange(version, entry.version),
    );
    const targetVersion = satisfying[0] ?? currentVersion;

    // Sorted highest-first, so a newer out-of-range version is the head.
    const newest = available[0];
    const blockedByRange =
      newest !== undefined &&
      newest !== targetVersion &&
      compareVersions(newest, targetVersion) > 0
        ? newest
        : undefined;

    candidates.push({
      qualifiedName,
      requestedRange: entry.version,
      currentVersion,
      targetVersion,
      upToDate: targetVersion === currentVersion,
      blockedByRange,
    });
  }

  const updatable = candidates.filter((candidate) => !candidate.upToDate);

  if (updatable.length === 0) {
    return { candidates, updatable, plan: undefined };
  }

  const plan = await planInstall({
    projectRoot: project.root,
    catalog,
    lockfile: project.lockfile,
    requested: updatable.map((candidate) => {
      const entry = requested.get(candidate.qualifiedName);

      return {
        reference: candidate.qualifiedName,
        range: candidate.requestedRange,
        ...(entry?.target === undefined ? {} : { target: entry.target }),
      };
    }),
  });

  return { candidates, updatable, plan };
}
