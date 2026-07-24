import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Lockfile, Permission, ResourceEnvVar } from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { SkillboxError } from './errors.js';
import { buildGraph, type DependencyGraph, type GraphNode } from './graph.js';
import { digestOfFile } from './integrity.js';
import { assertRealPathInside, resolveInside, toPosixRelative } from './paths.js';

/**
 * Install planning.
 *
 * Planning reads state and returns an immutable description of every file
 * operation. It writes nothing (FR-6.2). Application is a separate step.
 *
 * That split is what makes `--dry-run` genuinely the same code path as a real
 * install, and what lets conflicts and permissions be shown before anything is
 * written. See docs/architecture/overview.md.
 */

/** Why a planned write is unsafe. */
export type ConflictKind =
  /** A file exists at the destination and Skillbox did not put it there. */
  | 'untracked'
  /** The destination is recorded as owned by a different resource. */
  | 'owned-by-other'
  /** Skillbox installed it, but its content no longer matches the lockfile. */
  | 'locally-modified';

export interface PlanConflict {
  readonly kind: ConflictKind;
  /** POSIX-relative destination path. */
  readonly path: string;
  /** The resource that wants to write here. */
  readonly resource: string;
  /** For `owned-by-other`, the resource that currently owns it. */
  readonly owner?: string;
}

/** One file to write. */
export interface PlannedFile {
  /** Source path inside the resource directory, POSIX-style. */
  readonly source: string;
  /** Destination path relative to the project root, POSIX-style. */
  readonly destination: string;
  /** Absolute source path. */
  readonly absoluteSource: string;
  /** Absolute destination path. */
  readonly absoluteDestination: string;
  /** True when a file already exists at the destination. */
  readonly overwrites: boolean;
}

/** One resource to install. */
export interface PlannedResource {
  readonly identifier: string;
  readonly qualifiedName: string;
  readonly version: string;
  readonly kind: string;
  readonly target: string;
  readonly files: readonly PlannedFile[];
  readonly permissions: readonly Permission[];
  readonly env: readonly ResourceEnvVar[];
  readonly dependencies: readonly string[];
  readonly requestedBy: string;
  readonly direct: boolean;
  readonly node: GraphNode;
  /** True when this resource is already installed at this exact version. */
  readonly alreadyInstalled: boolean;
  /** True when the resource declares a deprecation notice. */
  readonly deprecated: boolean;
}

export interface InstallPlan {
  readonly projectRoot: string;
  /** Resources in dependency order. */
  readonly resources: readonly PlannedResource[];
  readonly conflicts: readonly PlanConflict[];
  /** Union of declared permissions across the plan, sorted. */
  readonly permissions: readonly Permission[];
  /** Union of required environment variables, by name. Never values (SR-7). */
  readonly env: readonly ResourceEnvVar[];
  /** Optional dependencies that were absent. */
  readonly missingOptional: readonly string[];
  readonly graph: DependencyGraph;
  /** True when there is nothing to do. */
  readonly empty: boolean;
}

export interface PlanOptions {
  readonly projectRoot: string;
  readonly catalog: Catalog;
  readonly lockfile: Lockfile;
  /** References to install, with an optional target override each. */
  readonly requested: readonly {
    readonly reference: string;
    readonly range?: string;
    readonly target?: string;
  }[];
}

/**
 * Build an install plan.
 *
 * Reads the catalog, the project's lockfile, and the current state of destination
 * files. Performs no writes.
 *
 * @throws {SkillboxError} on an unresolvable reference, dependency problem, or a
 * destination that escapes the project.
 */
export async function planInstall(options: PlanOptions): Promise<InstallPlan> {
  const { projectRoot, catalog, lockfile, requested } = options;

  const graph = buildGraph(
    catalog,
    requested.map((entry) => ({
      reference: entry.reference,
      ...(entry.range === undefined ? {} : { range: entry.range }),
    })),
  );

  const targetOverrides = new Map<string, string>();
  for (const entry of requested) {
    if (entry.target !== undefined) {
      targetOverrides.set(stripVersion(entry.reference), entry.target);
    }
  }

  // Which resource owns each already-installed path, so a collision can be
  // classified rather than merely reported.
  const ownership = new Map<string, { resource: string; digest: string }>();
  for (const [name, locked] of Object.entries(lockfile.resources)) {
    for (const [installedPath, digest] of Object.entries(locked.files)) {
      ownership.set(installedPath, { resource: name, digest });
    }
  }

  const resources: PlannedResource[] = [];
  const conflicts: PlanConflict[] = [];

  for (const node of graph.order) {
    const planned = await planResource({
      node,
      projectRoot,
      target: targetOverrides.get(node.resource.qualifiedName) ?? node.resource.target,
      lockfile,
      ownership,
      conflicts,
    });

    resources.push(planned);
  }

  return {
    projectRoot,
    resources,
    conflicts,
    permissions: unionPermissions(resources),
    env: unionEnv(resources),
    missingOptional: graph.missingOptional,
    graph,
    empty: resources.every((resource) => resource.alreadyInstalled),
  };
}

async function planResource(context: {
  node: GraphNode;
  projectRoot: string;
  target: string;
  lockfile: Lockfile;
  ownership: Map<string, { resource: string; digest: string }>;
  conflicts: PlanConflict[];
}): Promise<PlannedResource> {
  const { node, projectRoot, target, lockfile, ownership, conflicts } = context;
  const { resource } = node;

  // Containment is re-verified here even though the schema already checked the
  // path textually: only now is the concrete project root known (SR-1).
  const absoluteTarget = resolveInside(projectRoot, target, {
    field: 'spec.install.target',
    location: resource.manifestPath,
  });
  await assertRealPathInside(projectRoot, absoluteTarget, {
    field: 'spec.install.target',
    location: resource.manifestPath,
  });

  const strategy = resource.manifest.spec.install?.strategy ?? 'directory';
  const locked = lockfile.resources[resource.qualifiedName];
  const alreadyInstalled = locked?.version === resource.manifest.metadata.version;

  const files: PlannedFile[] = [];

  for (const source of resource.manifest.spec.files) {
    const relativeDestination =
      strategy === 'flat' ? path.posix.basename(source) : source;

    const absoluteDestination = resolveInside(absoluteTarget, relativeDestination, {
      field: 'spec.files',
      location: resource.manifestPath,
    });

    // Re-check against the project root, not just the target: a target deep in
    // the tree must not become a way to widen the boundary.
    resolveInside(projectRoot, toPosixRelative(projectRoot, absoluteDestination), {
      field: 'spec.files',
      location: resource.manifestPath,
    });

    const destination = toPosixRelative(projectRoot, absoluteDestination);
    const existing = await stat(absoluteDestination).catch(() => undefined);

    if (existing !== undefined) {
      const conflict = await classifyConflict({
        destination,
        absoluteDestination,
        resourceName: resource.qualifiedName,
        ownership,
        alreadyInstalled,
      });

      if (conflict !== undefined) conflicts.push(conflict);
    }

    files.push({
      source,
      destination,
      absoluteSource: resolveInside(resource.directory, source, {
        field: 'spec.files',
        location: resource.manifestPath,
      }),
      absoluteDestination,
      overwrites: existing !== undefined,
    });
  }

  return {
    identifier: resource.identifier,
    qualifiedName: resource.qualifiedName,
    version: resource.manifest.metadata.version,
    kind: resource.manifest.kind,
    target,
    files,
    permissions: resource.manifest.spec.permissions ?? [],
    env: resource.manifest.spec.env ?? [],
    dependencies: node.dependencies,
    requestedBy: node.requestedBy,
    direct: node.direct,
    node,
    alreadyInstalled,
    deprecated: resource.manifest.metadata.deprecated !== undefined,
  };
}

/**
 * Classify an existing destination file.
 *
 * Returns `undefined` when overwriting is safe: the file is owned by this
 * resource and still matches its recorded digest, so it is Skillbox's own output
 * being replaced.
 */
async function classifyConflict(context: {
  destination: string;
  absoluteDestination: string;
  resourceName: string;
  ownership: Map<string, { resource: string; digest: string }>;
  alreadyInstalled: boolean;
}): Promise<PlanConflict | undefined> {
  const { destination, absoluteDestination, resourceName, ownership } = context;

  const owner = ownership.get(destination);

  if (owner === undefined) {
    return { kind: 'untracked', path: destination, resource: resourceName };
  }

  if (owner.resource !== resourceName) {
    return {
      kind: 'owned-by-other',
      path: destination,
      resource: resourceName,
      owner: owner.resource,
    };
  }

  const currentDigest = await digestOfFile(absoluteDestination).catch(() => undefined);

  if (currentDigest !== owner.digest) {
    // Skillbox wrote this file, but someone has edited it since. Overwriting
    // would silently discard their work.
    return { kind: 'locally-modified', path: destination, resource: resourceName };
  }

  return undefined;
}

function unionPermissions(resources: readonly PlannedResource[]): Permission[] {
  const all = new Set<Permission>();

  for (const resource of resources) {
    for (const permission of resource.permissions) all.add(permission);
  }

  return [...all].sort();
}

function unionEnv(resources: readonly PlannedResource[]): ResourceEnvVar[] {
  const byName = new Map<string, ResourceEnvVar>();

  for (const resource of resources) {
    for (const variable of resource.env) {
      if (!byName.has(variable.name)) byName.set(variable.name, variable);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function stripVersion(reference: string): string {
  const atIndex = reference.indexOf('@');
  return atIndex === -1 ? reference : reference.slice(0, atIndex);
}

/** Every file the plan would write, POSIX-relative and sorted. */
export function plannedPaths(plan: InstallPlan): readonly string[] {
  return plan.resources
    .flatMap((resource) => resource.files.map((file) => file.destination))
    .sort();
}

/**
 * Reject a plan that has conflicts.
 *
 * Called before application so nothing is written when a conflict exists
 * (FR-8.4). `force` allows overwriting, which is why it is an explicit opt-in.
 */
export function assertNoConflicts(plan: InstallPlan, force: boolean): void {
  if (force || plan.conflicts.length === 0) return;

  throw new SkillboxError({
    code: 'FILE_CONFLICT',
    message: `${String(plan.conflicts.length)} destination ${
      plan.conflicts.length === 1 ? 'file conflicts' : 'files conflict'
    } with the install plan.`,
    details: plan.conflicts.map(
      (conflict) => `${conflict.path} (${describeConflict(conflict)})`,
    ),
    hint: 'Move or delete the conflicting files, override the install target, or pass --force to overwrite.',
  });
}

/** A human-readable reason for a conflict. */
export function describeConflict(conflict: PlanConflict): string {
  switch (conflict.kind) {
    case 'untracked':
      return 'a file already exists here and Skillbox did not install it';
    case 'owned-by-other':
      return `installed by ${conflict.owner ?? 'another resource'}`;
    case 'locally-modified':
      return 'installed by Skillbox but modified since';
  }
}
