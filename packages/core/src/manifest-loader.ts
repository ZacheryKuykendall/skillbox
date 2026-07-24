import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MANIFEST_FILENAME,
  formatIdentifier,
  resolveInstallTarget,
  validateManifest,
  type Diagnostic,
  type ResourceManifest,
} from '@skillbox/schema';
import { parse as parseYaml, YAMLParseError } from 'yaml';

import { SkillboxError, wrapError } from './errors.js';
import { resolveInside, toPosixRelative } from './paths.js';

/**
 * Reading and validating a resource manifest from disk.
 *
 * Structural validation lives in `@skillbox/schema`; this module adds the checks
 * that need a real directory: declared files exist, and the entrypoint is inside
 * the resource directory.
 */

/** A resource successfully loaded from disk. */
export interface LoadedResource {
  readonly manifest: ResourceManifest;
  /** Absolute path of the resource directory. */
  readonly directory: string;
  /** Absolute path of the manifest file. */
  readonly manifestPath: string;
  /** Canonical `namespace/name@version`. */
  readonly identifier: string;
  /** `namespace/name`. */
  readonly qualifiedName: string;
  /** Install target relative to a project root. */
  readonly target: string;
  /** Non-fatal findings, such as an undeclared file in the directory. */
  readonly warnings: readonly Diagnostic[];
}

/** A resource that could not be loaded. */
export interface ResourceLoadFailure {
  readonly directory: string;
  readonly manifestPath: string;
  readonly diagnostics: readonly Diagnostic[];
}

export type LoadResult =
  | { readonly ok: true; readonly resource: LoadedResource }
  | { readonly ok: false; readonly failure: ResourceLoadFailure };

/** Parse YAML, mapping a syntax error to a diagnostic naming the line. */
function parseManifestYaml(
  contents: string,
): { ok: true; value: unknown } | { ok: false; diagnostics: Diagnostic[] } {
  try {
    return { ok: true, value: parseYaml(contents) };
  } catch (error) {
    const message =
      error instanceof YAMLParseError
        ? // YAMLParseError carries a linePos; surfacing it turns "invalid YAML"
          // into something a user can navigate to.
          `${error.message.split('\n')[0] ?? error.message}${
            error.linePos?.[0] === undefined
              ? ''
              : ` (line ${String(error.linePos[0].line)}, column ${String(error.linePos[0].col)})`
          }`
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          path: '',
          message: `Could not parse ${MANIFEST_FILENAME}: ${message}`,
          hint: 'Check indentation and quoting. Version ranges such as ">=1.0.0" must be quoted.',
        },
      ],
    };
  }
}

/**
 * Load and validate a resource from a directory.
 *
 * Returns a result rather than throwing so a single invalid resource does not
 * abort discovery of an entire catalog (FR-2.4).
 */
export async function loadResource(directory: string): Promise<LoadResult> {
  const absoluteDirectory = path.resolve(directory);
  const manifestPath = path.join(absoluteDirectory, MANIFEST_FILENAME);

  let contents: string;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      failure: {
        directory: absoluteDirectory,
        manifestPath,
        diagnostics: [
          {
            severity: 'error',
            path: '',
            message: `Could not read ${MANIFEST_FILENAME}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            hint: `A resource directory must contain a ${MANIFEST_FILENAME} file.`,
          },
        ],
      },
    };
  }

  const parsed = parseManifestYaml(contents);
  if (!parsed.ok) {
    return {
      ok: false,
      failure: {
        directory: absoluteDirectory,
        manifestPath,
        diagnostics: parsed.diagnostics,
      },
    };
  }

  const validated = validateManifest(parsed.value);
  if (!validated.ok) {
    return {
      ok: false,
      failure: {
        directory: absoluteDirectory,
        manifestPath,
        diagnostics: validated.diagnostics,
      },
    };
  }

  const manifest = validated.value;
  const filesystemDiagnostics = await checkFilesystem(manifest, absoluteDirectory);

  const errors = filesystemDiagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    return {
      ok: false,
      failure: {
        directory: absoluteDirectory,
        manifestPath,
        diagnostics: filesystemDiagnostics,
      },
    };
  }

  return {
    ok: true,
    resource: {
      manifest,
      directory: absoluteDirectory,
      manifestPath,
      identifier: formatIdentifier(manifest.metadata),
      qualifiedName: `${manifest.metadata.namespace}/${manifest.metadata.name}`,
      target: resolveInstallTarget(manifest),
      warnings: filesystemDiagnostics.filter((d) => d.severity === 'warning'),
    },
  };
}

/**
 * Verify declared files exist and stay inside the resource directory.
 *
 * The schema already rejected traversal textually; this re-resolves against the
 * real directory, which also catches a declared file that resolves through a
 * symlink out of the resource.
 */
async function checkFilesystem(
  manifest: ResourceManifest,
  directory: string,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const [index, declared] of manifest.spec.files.entries()) {
    // Safe to resolve without guarding: the manifest has already passed schema
    // validation, which applies the same path constraints this helper checks.
    // Wrapping it again would add an unreachable branch, not safety.
    const resolved = resolveInside(directory, declared, {
      field: `spec.files[${String(index)}]`,
    });

    const stats = await stat(resolved).catch(() => undefined);

    if (stats === undefined) {
      diagnostics.push({
        severity: 'error',
        path: `spec.files[${String(index)}]`,
        message: `Declared file "${declared}" does not exist.`,
        hint: 'Create the file, or remove it from spec.files.',
      });
    } else if (!stats.isFile()) {
      diagnostics.push({
        severity: 'error',
        path: `spec.files[${String(index)}]`,
        message: `Declared file "${declared}" is not a regular file.`,
        hint: 'spec.files must list files, not directories.',
      });
    }
  }

  // The schema already checks the entrypoint appears in spec.files, so if the
  // file list is sound the entrypoint has been verified above.
  if (!manifest.spec.files.includes(manifest.spec.entrypoint)) {
    diagnostics.push({
      severity: 'error',
      path: 'spec.entrypoint',
      message: `The entrypoint "${manifest.spec.entrypoint}" is not listed in spec.files.`,
      hint: 'Add the entrypoint to spec.files.',
    });
  }

  return diagnostics;
}

/**
 * Load a resource, throwing when it is invalid.
 *
 * For callers that treat an invalid resource as fatal, such as validating one
 * specific path the user named.
 */
export async function loadResourceOrThrow(directory: string): Promise<LoadedResource> {
  const result = await loadResource(directory);

  if (!result.ok) {
    throw new SkillboxError({
      code: 'INVALID_MANIFEST',
      message: `The resource at ${directory} is not valid.`,
      location: result.failure.manifestPath,
      details: result.failure.diagnostics.map((d) =>
        d.path.length === 0 ? d.message : `${d.path}: ${d.message}`,
      ),
      hint: 'Run skillbox validate on this path for full detail.',
    });
  }

  return result.resource;
}

/** Read the files a resource declares, keyed by POSIX-relative path. */
export async function readResourceFiles(
  resource: LoadedResource,
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  for (const declared of resource.manifest.spec.files) {
    const absolute = resolveInside(resource.directory, declared, {
      field: 'spec.files',
      location: resource.manifestPath,
    });

    try {
      files.set(
        toPosixRelative(resource.directory, absolute),
        await readFile(absolute),
      );
    } catch (error) {
      throw wrapError(error, {
        code: 'IO_ERROR',
        message: `Could not read "${declared}" from ${resource.identifier}.`,
        location: absolute,
        hint: 'Check the file exists and is readable.',
      });
    }
  }

  return files;
}
