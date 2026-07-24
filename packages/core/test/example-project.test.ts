import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCatalog } from '../src/catalog.js';
import { runDoctor } from '../src/doctor.js';
import { serializeLockfile } from '../src/lockfile.js';
import { loadProject, lockfilePath } from '../src/project.js';

/**
 * Tests against the committed example project.
 *
 * The example exists to show what installation actually produces, so it has to
 * stay accurate as the catalog changes. Without these, a resource edit would
 * silently leave the example's lockfile stale, and the digests it shows would be
 * wrong (SBX-078).
 */

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const projectRoot = path.join(repositoryRoot, 'examples', 'starter-project');
const registryRoot = path.join(repositoryRoot, 'registry');

describe('the committed example project', () => {
  it('loads with a valid manifest and lockfile', async () => {
    const project = await loadProject(projectRoot);

    expect(project.manifest.metadata.name).toBe('starter-project');
    expect(Object.keys(project.lockfile.resources).length).toBeGreaterThan(0);
  });

  it('requests three resources directly', async () => {
    const project = await loadProject(projectRoot);

    expect(project.manifest.spec.resources?.map((entry) => entry.resource)).toEqual([
      'skillbox/plan-implement-review',
      'skillbox/project-summary',
      'skillbox/structured-logger',
    ]);
  });

  it('locks six resources, three of them dependencies', async () => {
    // The point of the example: three commands produce six resources.
    const project = await loadProject(projectRoot);

    const locked = Object.entries(project.lockfile.resources);
    const transitive = locked.filter(([, entry]) => entry.requestedBy !== 'direct');

    expect(locked).toHaveLength(6);
    expect(transitive).toHaveLength(3);
  });

  it('is healthy according to doctor', async () => {
    const project = await loadProject(projectRoot);
    const catalog = await loadCatalog(registryRoot);

    const report = await runDoctor({ project, catalog, env: {} });

    if (!report.healthy) {
      const findings = report.checks
        .filter((check) => check.status !== 'ok')
        .map(
          (check) =>
            `${check.status}: ${check.message}\n  ${check.details.join('\n  ')}`,
        )
        .join('\n');

      throw new Error(
        `The committed example project is not healthy. Reinstall it and commit the result:\n\n${findings}`,
      );
    }

    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it('has a lockfile that matches what serialization would produce now', async () => {
    // Catches a hand-edited or stale lockfile: the committed bytes must be
    // exactly what the current serializer writes (ADR-0004).
    const project = await loadProject(projectRoot);
    const committed = await readFile(lockfilePath(projectRoot), 'utf8');

    expect(committed).toBe(serializeLockfile(project.lockfile));
  });

  it('records no timestamp or absolute path in the lockfile', async () => {
    const committed = await readFile(lockfilePath(projectRoot), 'utf8');

    expect(committed).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(committed).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(committed).not.toContain('\\');
  });

  it('installs the component into the project source tree, not .skillbox', async () => {
    const project = await loadProject(projectRoot);

    expect(project.lockfile.resources['skillbox/structured-logger']?.target).toBe(
      'src/components/structured-logger',
    );
  });

  it('installs every other kind under .skillbox', async () => {
    const project = await loadProject(projectRoot);

    for (const [name, entry] of Object.entries(project.lockfile.resources)) {
      if (entry.kind === 'component' || entry.kind === 'api') continue;

      expect(entry.target, `${name} should install under .skillbox/`).toMatch(
        /^\.skillbox\//,
      );
    }
  });

  it('documents the exact list output it displays', async () => {
    // A README showing stale output is worse than one showing none, since a
    // reader trusts it.
    const readme = await readFile(path.join(projectRoot, 'README.md'), 'utf8');
    const project = await loadProject(projectRoot);

    for (const name of Object.keys(project.lockfile.resources)) {
      expect(readme, `README should mention ${name}`).toContain(name);
    }
  });

  it('resolves every locked resource against the current catalog', async () => {
    const project = await loadProject(projectRoot);
    const catalog = await loadCatalog(registryRoot);

    for (const [name, entry] of Object.entries(project.lockfile.resources)) {
      expect(
        catalog.get(`${name}@${entry.version}`),
        `${name}@${entry.version} is locked but not in the catalog`,
      ).toBeDefined();
    }
  });
});
