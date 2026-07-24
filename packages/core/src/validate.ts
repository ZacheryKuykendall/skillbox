import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MANIFEST_FILENAME,
  checkManifestPath,
  describePathRejection,
  resolveInstallTarget,
  satisfiesRange,
  type Diagnostic,
} from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { SkillboxError } from './errors.js';
import { loadResource, type LoadedResource } from './manifest-loader.js';

/**
 * Validation of resources and their cross-references.
 *
 * Structural validation lives in `@skillbox/schema`; this module runs the checks
 * that need a directory or a catalog: declared files exist, install targets are
 * safe, and dependency references resolve (FR-11).
 */

/** Validation findings for one resource. */
export interface ValidationTarget {
  /** Absolute path of the manifest, or of the directory when none was found. */
  readonly location: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ValidationReport {
  readonly targets: readonly ValidationTarget[];
  readonly errors: number;
  readonly warnings: number;
  readonly ok: boolean;
}

export interface ValidateOptions {
  /** Directory to validate: one resource, or a tree containing several. */
  readonly directory: string;
  /** Catalog used to resolve dependency and workflow references. */
  readonly catalog?: Catalog | undefined;
}

/**
 * Validate a resource directory, or every resource beneath a directory.
 *
 * @throws {SkillboxError} `IO_ERROR` when the path does not exist or holds no
 * resources.
 */
export async function validateDirectory(
  options: ValidateOptions,
): Promise<ValidationReport> {
  const root = path.resolve(options.directory);

  const stats = await stat(root).catch(() => undefined);

  if (stats === undefined) {
    throw new SkillboxError({
      code: 'IO_ERROR',
      message: `The path "${options.directory}" does not exist.`,
      location: root,
      hint: 'Pass a resource directory, or a directory containing resources.',
    });
  }

  if (!stats.isDirectory()) {
    throw new SkillboxError({
      code: 'IO_ERROR',
      message: `The path "${options.directory}" is not a directory.`,
      location: root,
      hint: 'Pass the resource directory, not the manifest file itself.',
    });
  }

  const directories = await findResourceDirectories(root);

  if (directories.length === 0) {
    throw new SkillboxError({
      code: 'IO_ERROR',
      message: `No ${MANIFEST_FILENAME} was found in or under "${options.directory}".`,
      location: root,
      hint: `A resource directory must contain a ${MANIFEST_FILENAME} file.`,
    });
  }

  const targets: ValidationTarget[] = [];

  for (const directory of directories) {
    targets.push(await validateOne(directory, options.catalog));
  }

  const errors = countBySeverity(targets, 'error');
  const warnings = countBySeverity(targets, 'warning');

  return { targets, errors, warnings, ok: errors === 0 };
}

function countBySeverity(
  targets: readonly ValidationTarget[],
  severity: Diagnostic['severity'],
): number {
  return targets.reduce(
    (total, target) =>
      total + target.diagnostics.filter((d) => d.severity === severity).length,
    0,
  );
}

async function validateOne(
  directory: string,
  catalog: Catalog | undefined,
): Promise<ValidationTarget> {
  const result = await loadResource(directory);

  if (!result.ok) {
    return {
      location: result.failure.manifestPath,
      diagnostics: result.failure.diagnostics,
    };
  }

  const { resource } = result;

  const diagnostics: Diagnostic[] = [
    ...resource.warnings,
    ...checkInstallTarget(resource),
    ...(await checkUndeclaredFiles(resource.directory, resource.manifest.spec.files)),
    ...(catalog === undefined ? [] : checkReferences(resource, catalog)),
  ];

  return { location: resource.manifestPath, diagnostics };
}

/**
 * Verify the install target is a safe relative path.
 *
 * The schema already checks a declared target, but a kind default is composed at
 * runtime, so the composed result is checked here too (FR-11.5).
 */
function checkInstallTarget(resource: LoadedResource): Diagnostic[] {
  const target = resolveInstallTarget(resource.manifest);
  const rejection = checkManifestPath(target);

  if (rejection === undefined) return [];

  return [
    {
      severity: 'error',
      path: 'spec.install.target',
      message: `The install target "${target}" ${describePathRejection(rejection)}.`,
      hint: 'Install targets must be relative POSIX paths inside the project directory.',
    },
  ];
}

/**
 * Report files present in a resource directory but absent from `spec.files`.
 *
 * A warning rather than an error: an author may legitimately keep notes or
 * fixtures alongside a resource. Reporting it catches the more common case of
 * forgetting to declare a file that was meant to ship (SR-10).
 */
async function checkUndeclaredFiles(
  directory: string,
  declared: readonly string[],
): Promise<Diagnostic[]> {
  const present = await listFiles(directory, '');
  const declaredSet = new Set([...declared, MANIFEST_FILENAME]);

  const undeclared = present.filter((file) => !declaredSet.has(file)).sort();

  if (undeclared.length === 0) return [];

  return [
    {
      severity: 'warning',
      path: 'spec.files',
      message: `${String(undeclared.length)} ${
        undeclared.length === 1 ? 'file is' : 'files are'
      } present but not declared: ${undeclared.join(', ')}.`,
      hint: 'Add them to spec.files if they should be installed, or remove them.',
    },
  ];
}

async function listFiles(directory: string, prefix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }

  return files;
}

/** Verify dependency and workflow references resolve in the catalog. */
function checkReferences(resource: LoadedResource, catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { manifest } = resource;

  for (const [index, dependency] of (manifest.spec.dependencies ?? []).entries()) {
    if (!catalog.has(dependency.resource)) {
      diagnostics.push({
        severity: dependency.optional === true ? 'warning' : 'error',
        path: `spec.dependencies[${String(index)}]`,
        message: `Dependency "${dependency.resource}" was not found in the catalog.`,
        hint: 'Add the resource to the catalog, or correct the reference.',
      });
      continue;
    }

    const satisfied = catalog
      .versionsOf(dependency.resource)
      .some((candidate) =>
        satisfiesRange(candidate.manifest.metadata.version, dependency.version),
      );

    if (!satisfied) {
      diagnostics.push({
        severity: 'error',
        path: `spec.dependencies[${String(index)}].version`,
        message: `No version of "${dependency.resource}" satisfies "${dependency.version}".`,
        hint: 'Widen the range, or add a satisfying version to the catalog.',
      });
    }
  }

  // A referenced resource that is not declared as a dependency will not be
  // installed, so the workflow or agent would break at use time.
  const declared = new Set((manifest.spec.dependencies ?? []).map((d) => d.resource));

  if (manifest.kind === 'workflow') {
    for (const [index, step] of manifest.spec.steps.entries()) {
      if (!declared.has(step.uses)) {
        diagnostics.push({
          severity: 'warning',
          path: `spec.steps[${String(index)}].uses`,
          message: `Step "${step.name}" uses "${step.uses}", which is not declared as a dependency.`,
          hint: 'Add it to spec.dependencies so it is installed with this workflow.',
        });
      }
    }
  }

  if (manifest.kind === 'agent') {
    for (const [index, prompt] of (manifest.spec.prompts ?? []).entries()) {
      if (!declared.has(prompt)) {
        diagnostics.push({
          severity: 'warning',
          path: `spec.prompts[${String(index)}]`,
          message: `Prompt "${prompt}" is referenced but not declared as a dependency.`,
          hint: 'Add it to spec.dependencies so it is installed with this agent.',
        });
      }
    }
  }

  return diagnostics;
}

/** Find every directory containing a manifest, at or beneath `root`. */
async function findResourceDirectories(root: string): Promise<string[]> {
  const manifest = await stat(path.join(root, MANIFEST_FILENAME)).catch(
    () => undefined,
  );

  if (manifest?.isFile() === true) return [root];

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];

  const subdirectories = entries
    .filter((candidate) => candidate.isDirectory() && candidate.name !== 'node_modules')
    .map((candidate) => candidate.name)
    .sort();

  for (const entry of subdirectories) {
    found.push(...(await findResourceDirectories(path.join(root, entry))));
  }

  return found;
}
