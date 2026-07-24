import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  LOCKFILE_FILENAME,
  PROJECT_DIRECTORY,
  PROJECT_MANIFEST_FILENAME,
  emptyLockfile,
  lockfileSchema,
  projectManifestSchema,
  type Lockfile,
  type ProjectManifest,
} from '@skillbox/schema';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { SkillboxError, wrapError } from './errors.js';
import { serializeLockfile } from './lockfile.js';

/**
 * Reading and writing project configuration under `.skillbox/`.
 *
 * The project manifest records what was *requested*; the lockfile records what
 * was *resolved and installed*. See ADR-0004.
 */

/** A loaded project. */
export interface Project {
  /** Absolute path of the project root, the directory containing `.skillbox/`. */
  readonly root: string;
  readonly manifest: ProjectManifest;
  readonly lockfile: Lockfile;
}

/** Absolute path of a project's `.skillbox` directory. */
export function projectDirectory(root: string): string {
  return path.join(root, PROJECT_DIRECTORY);
}

/** Absolute path of a project's manifest. */
export function projectManifestPath(root: string): string {
  return path.join(root, PROJECT_DIRECTORY, PROJECT_MANIFEST_FILENAME);
}

/** Absolute path of a project's lockfile. */
export function lockfilePath(root: string): string {
  return path.join(root, PROJECT_DIRECTORY, LOCKFILE_FILENAME);
}

/**
 * Find the project root by walking up from a starting directory.
 *
 * Mirrors how git and package managers behave: running a command from a
 * subdirectory should still find the project.
 */
export async function findProjectRoot(from: string): Promise<string | undefined> {
  let current = path.resolve(from);

  for (;;) {
    const candidate = path.join(current, PROJECT_DIRECTORY, PROJECT_MANIFEST_FILENAME);
    const stats = await stat(candidate).catch(() => undefined);

    if (stats?.isFile() === true) return current;

    const parent = path.dirname(current);
    if (parent === current) return undefined;

    current = parent;
  }
}

/** Is this directory, or an ancestor, an initialized Skillbox project? */
export async function isInitialized(root: string): Promise<boolean> {
  const stats = await stat(projectManifestPath(root)).catch(() => undefined);
  return stats?.isFile() === true;
}

/**
 * Load a project's manifest and lockfile.
 *
 * @throws {SkillboxError} `PROJECT_NOT_INITIALIZED` when there is no `.skillbox`,
 * or `VALIDATION_FAILED` when configuration is malformed.
 */
export async function loadProject(root: string): Promise<Project> {
  const absoluteRoot = path.resolve(root);
  const manifestPath = projectManifestPath(absoluteRoot);

  const manifestContents = await readFile(manifestPath, 'utf8').catch(() => undefined);

  if (manifestContents === undefined) {
    throw new SkillboxError({
      code: 'PROJECT_NOT_INITIALIZED',
      message: `No Skillbox project was found at ${absoluteRoot}.`,
      location: manifestPath,
      hint: 'Run skillbox init to create .skillbox/skillbox.yaml.',
    });
  }

  const manifest = parseAndValidate(
    manifestContents,
    manifestPath,
    projectManifestSchema,
    'project manifest',
  );

  // A project with no lockfile yet is normal immediately after init, so treat an
  // absent lockfile as empty rather than an error.
  const lockContents = await readFile(lockfilePath(absoluteRoot), 'utf8').catch(
    () => undefined,
  );

  const lockfile =
    lockContents === undefined
      ? emptyLockfile()
      : parseAndValidate(
          lockContents,
          lockfilePath(absoluteRoot),
          lockfileSchema,
          'lockfile',
        );

  return { root: absoluteRoot, manifest, lockfile };
}

function parseAndValidate<T>(
  contents: string,
  location: string,
  schema: {
    safeParse(value: unknown): { success: boolean; data?: T; error?: unknown };
  },
  label: string,
): T {
  let parsed: unknown;
  try {
    parsed = parseYaml(contents);
  } catch (error) {
    throw wrapError(error, {
      code: 'VALIDATION_FAILED',
      message: `Could not parse the ${label}.`,
      location,
      hint: 'Check indentation and quoting, or delete the file and run skillbox init again.',
    });
  }

  const result = schema.safeParse(parsed);

  if (!result.success || result.data === undefined) {
    const issues = (result.error as { issues?: { path: unknown[]; message: string }[] })
      ?.issues;

    throw new SkillboxError({
      code: 'VALIDATION_FAILED',
      message: `The ${label} is not valid.`,
      location,
      details:
        issues?.map(
          (issue) => `${issue.path.join('.') || '<document>'}: ${issue.message}`,
        ) ?? [],
      hint: 'Correct the file, or delete it and run skillbox init again.',
    });
  }

  return result.data;
}

/** Write a project manifest, creating `.skillbox/` if needed. */
export async function writeProjectManifest(
  root: string,
  manifest: ProjectManifest,
): Promise<void> {
  await mkdir(projectDirectory(root), { recursive: true });

  await writeFile(
    projectManifestPath(root),
    serializeProjectManifest(manifest),
    'utf8',
  );
}

/**
 * Serialize a project manifest.
 *
 * Unlike the lockfile, this file is hand-editable, so key order follows the
 * document's logical structure rather than being sorted alphabetically.
 */
export function serializeProjectManifest(manifest: ProjectManifest): string {
  return stringifyYaml(manifest, { lineWidth: 0, indent: 2 });
}

/** Write a lockfile, creating `.skillbox/` if needed. */
export async function writeLockfile(root: string, lockfile: Lockfile): Promise<void> {
  await mkdir(projectDirectory(root), { recursive: true });
  await writeFile(lockfilePath(root), serializeLockfile(lockfile), 'utf8');
}

/** The resources a project has requested, keyed by qualified name. */
export function requestedResources(
  manifest: ProjectManifest,
): ReadonlyMap<string, { readonly version: string; readonly target?: string }> {
  const entries = new Map<string, { version: string; target?: string }>();

  for (const entry of manifest.spec.resources ?? []) {
    entries.set(entry.resource, {
      version: entry.version,
      ...(entry.target === undefined ? {} : { target: entry.target }),
    });
  }

  return entries;
}

/**
 * Return a manifest with a resource added or updated.
 *
 * Pure: the caller decides when to persist, so a failed install never leaves the
 * manifest claiming something that was not written.
 */
export function withResource(
  manifest: ProjectManifest,
  entry: { resource: string; version: string; target?: string },
): ProjectManifest {
  const existing = manifest.spec.resources ?? [];
  const others = existing.filter((candidate) => candidate.resource !== entry.resource);

  const updated = [
    ...others,
    {
      resource: entry.resource,
      version: entry.version,
      ...(entry.target === undefined ? {} : { target: entry.target }),
    },
  ].sort((a, b) => a.resource.localeCompare(b.resource));

  return { ...manifest, spec: { ...manifest.spec, resources: updated } };
}

/** Return a manifest with a resource removed. */
export function withoutResource(
  manifest: ProjectManifest,
  qualifiedName: string,
): ProjectManifest {
  const existing = manifest.spec.resources ?? [];

  return {
    ...manifest,
    spec: {
      ...manifest.spec,
      resources: existing.filter((entry) => entry.resource !== qualifiedName),
    },
  };
}
