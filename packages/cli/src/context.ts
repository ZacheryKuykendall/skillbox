import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SkillboxError,
  findProjectRoot,
  loadCatalog,
  loadProject,
  type Catalog,
  type Project,
} from '@skillbox/core';

import { createWriter, type Writer } from './output.js';

/**
 * Shared setup for command handlers.
 *
 * Resolves the registry and project locations once, so every command agrees on
 * how they are discovered.
 */

/** Global options available to every command. */
export interface GlobalOptions {
  readonly registry?: string | undefined;
  readonly project?: string | undefined;
  readonly json?: boolean | undefined;
  readonly color?: boolean | undefined;
}

export interface CommandContext {
  readonly writer: Writer;
  readonly options: GlobalOptions;
  readonly cwd: string;
  /** Load the catalog, resolving the registry path. */
  catalog(): Promise<Catalog>;
  /** Load the project, requiring initialization. */
  project(): Promise<Project>;
  /** Resolve the project root, requiring initialization. */
  projectRoot(): Promise<string>;
  /** Resolve the registry path without loading it. */
  registryPath(): string;
}

/**
 * The registry bundled with this repository.
 *
 * Derived from this module's location so the CLI works when invoked from any
 * directory. v0.1.0 has no remote registry, so a sensible local default matters
 * (ADR-0003).
 */
export function defaultRegistryPath(): string {
  // dist/context.js -> packages/cli/dist -> packages/cli -> packages -> repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'registry');
}

export interface CreateContextOptions extends GlobalOptions {
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly stdout?: ((text: string) => void) | undefined;
  readonly stderr?: ((text: string) => void) | undefined;
  readonly isTty?: boolean | undefined;
}

/** Create a command context. */
export function createContext(options: CreateContextOptions = {}): CommandContext {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  const writer = createWriter({
    json: options.json,
    color: options.color,
    env,
    stdout: options.stdout,
    stderr: options.stderr,
    isTty: options.isTty,
  });

  const registryPath = (): string =>
    path.resolve(
      cwd,
      options.registry ?? env.SKILLBOX_REGISTRY ?? defaultRegistryPath(),
    );

  const projectRoot = async (): Promise<string> => {
    const explicit = options.project ?? env.SKILLBOX_PROJECT;

    if (explicit !== undefined) return path.resolve(cwd, explicit);

    const found = await findProjectRoot(cwd);

    if (found === undefined) {
      throw new SkillboxError({
        code: 'PROJECT_NOT_INITIALIZED',
        message: `No Skillbox project was found in ${cwd} or any parent directory.`,
        hint: 'Run skillbox init to create one, or pass --project <path>.',
      });
    }

    return found;
  };

  return {
    writer,
    options,
    cwd,
    registryPath,

    async catalog(): Promise<Catalog> {
      return loadCatalog(registryPath());
    },

    async project(): Promise<Project> {
      return loadProject(await projectRoot());
    },

    projectRoot,
  };
}
