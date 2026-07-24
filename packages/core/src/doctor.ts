import { stat } from 'node:fs/promises';
import path from 'node:path';

import { satisfiesRange, type Diagnostic } from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { digestOfFile } from './integrity.js';
import { fromPosix, isInside } from './paths.js';
import { requestedResources, type Project } from './project.js';

/**
 * Project diagnostics.
 *
 * Every finding carries a severity and a remediation hint (FR-12.8).
 *
 * Environment variables are reported **by name only**. Presence is tested with
 * `name in process.env`; a value is never read (SR-7).
 */

export type CheckStatus = 'ok' | 'warning' | 'error';

/** One diagnostic check and its outcome. */
export interface DoctorCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly message: string;
  /** Supporting lines, such as the specific files affected. */
  readonly details: readonly string[];
  readonly hint: string | undefined;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  readonly errors: number;
  readonly warnings: number;
  readonly healthy: boolean;
}

export interface DoctorOptions {
  readonly project: Project;
  readonly catalog: Catalog;
  /**
   * Environment to check variable presence against. Injectable so tests need not
   * mutate the real process environment.
   */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** Run every diagnostic check. */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const { project, catalog } = options;
  const env = options.env ?? process.env;

  const checks: DoctorCheck[] = [
    checkConfiguration(project),
    checkLockfileConsistency(project),
    await checkInstalledFiles(project),
    checkDependencies(project),
    checkCatalogAvailability(project, catalog),
    checkRuntime(project, catalog),
    checkEnvironment(project, catalog, env),
  ];

  const errors = checks.filter((check) => check.status === 'error').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;

  return { checks, errors, warnings, healthy: errors === 0 && warnings === 0 };
}

function ok(name: string, message: string): DoctorCheck {
  return { name, status: 'ok', message, details: [], hint: undefined };
}

function problem(
  name: string,
  status: 'warning' | 'error',
  message: string,
  details: readonly string[],
  hint: string,
): DoctorCheck {
  return { name, status, message, details, hint };
}

function checkConfiguration(project: Project): DoctorCheck {
  // Reaching here means the manifest parsed and validated, since loadProject
  // would have thrown otherwise.
  return ok('configuration', `Project "${project.manifest.metadata.name}" is valid`);
}

/**
 * Compare the project manifest against the lockfile.
 *
 * The manifest states intent and the lockfile states fact; a disagreement means
 * one of them was edited without running Skillbox.
 */
function checkLockfileConsistency(project: Project): DoctorCheck {
  const requested = requestedResources(project.manifest);
  const locked = new Set(Object.keys(project.lockfile.resources));

  const missingFromLock: string[] = [];
  const rangeMismatches: string[] = [];

  for (const [qualifiedName, entry] of requested) {
    const lockedEntry = project.lockfile.resources[qualifiedName];

    if (lockedEntry === undefined) {
      missingFromLock.push(qualifiedName);
      continue;
    }

    if (!satisfiesRange(lockedEntry.version, entry.version)) {
      rangeMismatches.push(
        `${qualifiedName}: locked at ${lockedEntry.version}, manifest requests ${entry.version}`,
      );
    }
  }

  // A lockfile entry with no manifest entry is normal for a transitive dependency.
  const orphans = [...locked].filter((name) => {
    if (requested.has(name)) return false;
    return project.lockfile.resources[name]?.requestedBy === 'direct';
  });

  const details = [
    ...missingFromLock.map((n) => `${n} is requested but not locked`),
    ...rangeMismatches,
    ...orphans.map((n) => `${n} is locked as direct but not requested`),
  ];

  if (details.length === 0) {
    return ok('lockfile', 'Lockfile is consistent with the project manifest');
  }

  return problem(
    'lockfile',
    'error',
    'The lockfile disagrees with the project manifest.',
    details.sort(),
    'Run skillbox add to reconcile, or correct .skillbox/skillbox.yaml by hand.',
  );
}

/** Verify every installed file exists and still matches its recorded digest. */
async function checkInstalledFiles(project: Project): Promise<DoctorCheck> {
  const missing: string[] = [];
  const modified: string[] = [];
  const outside: string[] = [];

  for (const [name, locked] of Object.entries(project.lockfile.resources)) {
    for (const [installedPath, recordedDigest] of Object.entries(locked.files)) {
      const absolute = path.join(project.root, fromPosix(installedPath));

      // A lockfile can arrive via a pull request, so its paths are untrusted (T5).
      if (!isInside(project.root, absolute)) {
        outside.push(`${installedPath} (recorded by ${name})`);
        continue;
      }

      const stats = await stat(absolute).catch(() => undefined);

      if (stats === undefined) {
        missing.push(`${installedPath} (from ${name})`);
        continue;
      }

      const currentDigest = await digestOfFile(absolute).catch(() => undefined);

      if (currentDigest !== recordedDigest) {
        modified.push(`${installedPath} (from ${name})`);
      }
    }
  }

  if (outside.length > 0) {
    return problem(
      'files',
      'error',
      'The lockfile records files outside the project directory.',
      outside.sort(),
      'Inspect the lockfile for tampering and regenerate it.',
    );
  }

  if (missing.length > 0) {
    return problem(
      'files',
      'error',
      `${String(missing.length)} installed ${missing.length === 1 ? 'file is' : 'files are'} missing.`,
      missing.sort(),
      'Run skillbox add to reinstall the affected resources.',
    );
  }

  if (modified.length > 0) {
    return problem(
      'files',
      'warning',
      `${String(modified.length)} installed ${modified.length === 1 ? 'file has' : 'files have'} local modifications.`,
      modified.sort(),
      'Your edits are preserved. Remove and reinstall the resource to restore the original.',
    );
  }

  return ok('files', 'All installed files match their recorded integrity digests');
}

function checkDependencies(project: Project): DoctorCheck {
  const locked = new Set(Object.keys(project.lockfile.resources));
  const unsatisfied: string[] = [];

  for (const [name, entry] of Object.entries(project.lockfile.resources)) {
    for (const dependency of entry.dependencies ?? []) {
      if (!locked.has(dependency)) {
        unsatisfied.push(`${name} depends on ${dependency}, which is not installed`);
      }
    }
  }

  if (unsatisfied.length === 0) {
    return ok('dependencies', 'All recorded dependencies are installed');
  }

  return problem(
    'dependencies',
    'error',
    `${String(unsatisfied.length)} dependency ${unsatisfied.length === 1 ? 'problem' : 'problems'} found.`,
    unsatisfied.sort(),
    'Run skillbox add for the affected resources to install their dependencies.',
  );
}

function checkCatalogAvailability(project: Project, catalog: Catalog): DoctorCheck {
  const unavailable: string[] = [];

  for (const [name, entry] of Object.entries(project.lockfile.resources)) {
    if (catalog.get(`${name}@${entry.version}`) === undefined) {
      unavailable.push(`${name}@${entry.version}`);
    }
  }

  if (unavailable.length === 0) {
    return ok('catalog', 'Every installed resource is present in the catalog');
  }

  return problem(
    'catalog',
    'warning',
    `${String(unavailable.length)} installed ${unavailable.length === 1 ? 'resource is' : 'resources are'} not in the current catalog.`,
    unavailable.sort(),
    'Check the registry path. Installed files still work, but update and validate cannot verify them.',
  );
}

function checkRuntime(project: Project, catalog: Catalog): DoctorCheck {
  const incompatible: string[] = [];
  const nodeVersion = process.versions.node;

  for (const [name, entry] of Object.entries(project.lockfile.resources)) {
    const resource = catalog.get(`${name}@${entry.version}`);
    const runtime = resource?.manifest.spec.runtime;

    if (runtime?.type !== 'node' || runtime.version === undefined) continue;

    if (!satisfiesRange(nodeVersion, runtime.version)) {
      incompatible.push(
        `${name} requires Node ${runtime.version}, running ${nodeVersion}`,
      );
    }
  }

  if (incompatible.length === 0) {
    return ok('runtime', `Runtime requirements are satisfied (Node ${nodeVersion})`);
  }

  return problem(
    'runtime',
    'warning',
    `${String(incompatible.length)} ${incompatible.length === 1 ? 'resource has' : 'resources have'} unmet runtime requirements.`,
    incompatible.sort(),
    'Upgrade Node, or use a version that satisfies the declared range.',
  );
}

/**
 * Report required environment variables that are unset.
 *
 * Presence only. A value is never read, so nothing sensitive can reach output
 * (SR-7, SR-8).
 */
function checkEnvironment(
  project: Project,
  catalog: Catalog,
  env: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  const unset: string[] = [];

  for (const [name, entry] of Object.entries(project.lockfile.resources)) {
    const resource = catalog.get(`${name}@${entry.version}`);

    for (const variable of resource?.manifest.spec.env ?? []) {
      if (variable.required === false) continue;

      // Presence check: `in` never reads the value.
      if (!(variable.name in env)) {
        unset.push(`${variable.name} (required by ${name})`);
      }
    }
  }

  if (unset.length === 0) {
    return ok('environment', 'All required environment variables are set');
  }

  return problem(
    'environment',
    'warning',
    `${String(unset.length)} required environment ${unset.length === 1 ? 'variable is' : 'variables are'} not set.`,
    unset.sort(),
    'Set them in your shell before using the affected resources. Skillbox never stores their values.',
  );
}

/** Convert a report into diagnostics, for shared rendering with validation. */
export function reportDiagnostics(report: DoctorReport): readonly Diagnostic[] {
  return report.checks
    .filter((check) => check.status !== 'ok')
    .map((check) => ({
      severity: check.status === 'error' ? ('error' as const) : ('warning' as const),
      path: check.name,
      message: check.message,
      ...(check.hint === undefined ? {} : { hint: check.hint }),
    }));
}
