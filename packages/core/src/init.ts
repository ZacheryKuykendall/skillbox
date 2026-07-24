import path from 'node:path';

import {
  LOCKFILE_FILENAME,
  PROJECT_DIRECTORY,
  PROJECT_MANIFEST_FILENAME,
  emptyLockfile,
  emptyProjectManifest,
  identifierSchema,
} from '@skillbox/schema';

import { SkillboxError } from './errors.js';
import { isInitialized, writeLockfile, writeProjectManifest } from './project.js';

/**
 * Project initialization.
 */

export interface InitOptions {
  readonly root: string;
  /** Project name. Defaults to a sanitized form of the directory name. */
  readonly name?: string | undefined;
  /** Overwrite existing configuration. */
  readonly force?: boolean | undefined;
}

export interface InitResult {
  readonly root: string;
  readonly name: string;
  /** Project-relative paths that were created, in creation order. */
  readonly created: readonly string[];
}

/**
 * Derive a valid project name from a directory name.
 *
 * A directory can be called anything; a project name must match the identifier
 * pattern. Rather than reject a perfectly reasonable directory name, sanitize it.
 */
export function projectNameFromDirectory(directory: string): string {
  const base = path.basename(path.resolve(directory));

  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  // A directory named "_" or "." sanitizes to nothing, and the schema requires at
  // least two characters.
  if (sanitized.length < 2) return 'skillbox-project';

  return sanitized.slice(0, 64).replace(/-+$/, '');
}

/**
 * Initialize a Skillbox project.
 *
 * Refuses to overwrite an existing configuration without `force`, and changes
 * nothing when it refuses (FR-13.2).
 *
 * @throws {SkillboxError} `ALREADY_INITIALIZED` or `VALIDATION_FAILED`.
 */
export async function initProject(options: InitOptions): Promise<InitResult> {
  const root = path.resolve(options.root);

  if (options.force !== true && (await isInitialized(root))) {
    throw new SkillboxError({
      code: 'ALREADY_INITIALIZED',
      message: `A Skillbox project already exists at ${root}.`,
      location: path.join(root, PROJECT_DIRECTORY, PROJECT_MANIFEST_FILENAME),
      hint: 'Pass --force to overwrite the existing configuration.',
    });
  }

  const name = options.name ?? projectNameFromDirectory(root);

  const validated = identifierSchema.safeParse(name);
  if (!validated.success) {
    throw new SkillboxError({
      code: 'VALIDATION_FAILED',
      message: `"${name}" is not a valid project name.`,
      details: validated.error.issues.map((issue) => issue.message),
      hint: 'Pass --name with lowercase letters, digits, and internal hyphens.',
    });
  }

  await writeProjectManifest(root, emptyProjectManifest(name));
  await writeLockfile(root, emptyLockfile());

  return {
    root,
    name,
    created: [
      `${PROJECT_DIRECTORY}/${PROJECT_MANIFEST_FILENAME}`,
      `${PROJECT_DIRECTORY}/${LOCKFILE_FILENAME}`,
    ],
  };
}
