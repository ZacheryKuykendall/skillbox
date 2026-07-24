import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { MANIFEST_FILENAME } from '@skillbox/schema';
import {
  createTempDir,
  writeRegistry,
  type ResourceSpec,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPlan } from './apply.js';
import { loadCatalog, type Catalog } from './catalog.js';
import { runDoctor } from './doctor.js';
import { initProject } from './init.js';
import { planInstall } from './plan.js';
import {
  loadProject,
  writeLockfile,
  writeProjectManifest,
  type Project,
} from './project.js';
import { planRemove, removeResource } from './remove.js';
import { planUpdate } from './update.js';

let dir: TempDir;
let projectRoot: string;
let registryRoot: string;

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('my-project');
});

afterEach(async () => {
  await dir.cleanup();
});

/** Install resources into a fresh project and return the loaded state. */
async function installed(
  resources: readonly ResourceSpec[],
  requested: readonly { reference: string; range?: string }[],
): Promise<{ project: Project; catalog: Catalog }> {
  registryRoot = await writeRegistry(dir, resources);
  const catalog = await loadCatalog(registryRoot);

  await initProject({ root: projectRoot });
  const initial = await loadProject(projectRoot);

  const plan = await planInstall({
    projectRoot,
    catalog,
    lockfile: initial.lockfile,
    requested,
  });

  const result = await applyPlan({
    plan,
    manifest: initial.manifest,
    lockfile: initial.lockfile,
    requestedRanges: new Map(
      requested.map((entry) => [entry.reference, entry.range ?? '^0.1.0']),
    ),
    registryRoot,
  });

  await writeProjectManifest(projectRoot, result.manifest);
  await writeLockfile(projectRoot, result.lockfile);

  return { project: await loadProject(projectRoot), catalog };
}

/** Write an additional version of a resource into the registry. */
async function addVersion(name: string, version: string): Promise<void> {
  const directory = `registry/prompts/${name}-${version}`;

  await dir.write(
    `${directory}/${MANIFEST_FILENAME}`,
    [
      'apiVersion: skillbox.dev/v1alpha1',
      'kind: prompt',
      'metadata:',
      '  namespace: skillbox',
      `  name: ${name}`,
      `  version: ${version}`,
      `  description: Version ${version} of the ${name} fixture resource.`,
      'spec:',
      '  entrypoint: entry.md',
      '  files:',
      '    - entry.md',
      '  install:',
      `    target: target-dir`,
      '',
    ].join('\n'),
  );
  await dir.write(`${directory}/entry.md`, `version ${version}\n`);
}

describe('planRemove', () => {
  it('lists the files a removal would delete', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const plan = await planRemove(project, 'skillbox/code-review');

    expect([...plan.files].sort()).toEqual([
      'target-dir/README.md',
      'target-dir/entry.md',
    ]);
    expect(plan.modified).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it('reports a file edited since installation as modified', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/target-dir/entry.md', 'I edited this');

    const plan = await planRemove(
      await loadProject(projectRoot),
      'skillbox/code-review',
    );

    expect(plan.modified).toEqual(['target-dir/entry.md']);
    expect(plan.files).toEqual(['target-dir/README.md']);
    expect(project.root).toBe(projectRoot);
  });

  it('reports an already-deleted file as missing rather than failing', async () => {
    await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, 'target-dir', 'entry.md'));

    const plan = await planRemove(
      await loadProject(projectRoot),
      'skillbox/code-review',
    );

    expect(plan.missing).toEqual(['target-dir/entry.md']);
  });

  it('rejects a resource that is not installed', async () => {
    const { project } = await installed(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await expect(planRemove(project, 'skillbox/absent-resource')).rejects.toMatchObject(
      {
        code: 'RESOURCE_NOT_INSTALLED',
      },
    );
  });
});

describe('removeResource', () => {
  it('deletes the resource files and updates configuration', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const result = await removeResource({
      project,
      qualifiedName: 'skillbox/code-review',
    });

    await writeProjectManifest(projectRoot, result.manifest);
    await writeLockfile(projectRoot, result.lockfile);

    expect([...result.removed].sort()).toEqual([
      'target-dir/README.md',
      'target-dir/entry.md',
    ]);
    expect(result.manifest.spec.resources).toEqual([]);
    expect(result.lockfile.resources).toEqual({});
    await expect(
      stat(path.join(projectRoot, 'target-dir', 'entry.md')),
    ).rejects.toThrow();
  });

  it('refuses to delete a modified file', async () => {
    // Deleting someone's edit without warning is the failure this prevents.
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/target-dir/entry.md', 'my edits');

    await expect(
      removeResource({
        project: await loadProject(projectRoot),
        qualifiedName: 'skillbox/code-review',
      }),
    ).rejects.toMatchObject({ code: 'MODIFIED_FILES' });

    expect(
      await readFile(path.join(projectRoot, 'target-dir', 'entry.md'), 'utf8'),
    ).toBe('my edits');
    expect(project.root).toBe(projectRoot);
  });

  it('preserves a modified file while removing the rest when not forced', async () => {
    await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/target-dir/entry.md', 'my edits');

    // The refusal is the default; the caller can inspect the plan and choose.
    const plan = await planRemove(
      await loadProject(projectRoot),
      'skillbox/code-review',
    );

    expect(plan.modified).toEqual(['target-dir/entry.md']);
    expect(plan.files).toEqual(['target-dir/README.md']);
  });

  it('deletes a modified file when forced', async () => {
    await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/target-dir/entry.md', 'my edits');

    const result = await removeResource({
      project: await loadProject(projectRoot),
      qualifiedName: 'skillbox/code-review',
      force: true,
    });

    expect(result.removed).toContain('target-dir/entry.md');
    expect(result.preserved).toEqual([]);
    await expect(
      stat(path.join(projectRoot, 'target-dir', 'entry.md')),
    ).rejects.toThrow();
  });

  it('refuses to remove a resource another installed resource depends on', async () => {
    const { project } = await installed(
      [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    await expect(
      removeResource({ project, qualifiedName: 'skillbox/provider-resource' }),
    ).rejects.toMatchObject({ code: 'DEPENDENTS_EXIST' });
  });

  it('names the dependents in the error', async () => {
    const { project } = await installed(
      [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    await expect(
      removeResource({ project, qualifiedName: 'skillbox/provider-resource' }),
    ).rejects.toMatchObject({ details: ['skillbox/consumer-resource'] });
  });

  it('removes a depended-upon resource when forced', async () => {
    const { project } = await installed(
      [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    const result = await removeResource({
      project,
      qualifiedName: 'skillbox/provider-resource',
      force: true,
    });

    expect(result.removed.length).toBeGreaterThan(0);
  });

  it('cleans up a directory left empty', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'nested/deeply/target' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await removeResource({ project, qualifiedName: 'skillbox/code-review' });

    await expect(stat(path.join(projectRoot, 'nested'))).rejects.toThrow();
  });

  it('leaves a directory containing unrelated files alone', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'shared-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/shared-dir/my-own-file.txt', 'mine');

    await removeResource({ project, qualifiedName: 'skillbox/code-review' });

    expect(await readdir(path.join(projectRoot, 'shared-dir'))).toEqual([
      'my-own-file.txt',
    ]);
  });

  it('rejects a lockfile path that points outside the project', async () => {
    // A lockfile can arrive via a pull request, so its paths are untrusted (T5).
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const tampered: Project = {
      ...project,
      lockfile: {
        ...project.lockfile,
        resources: {
          'skillbox/code-review': {
            ...project.lockfile.resources['skillbox/code-review']!,
            files: { '../../escaped.txt': 'sha256-x' },
          },
        },
      },
    };

    // Rejected during planning, so a tampered path is caught even though the file
    // it names does not exist. Forcing does not bypass it.
    await expect(planRemove(tampered, 'skillbox/code-review')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });

    await expect(
      removeResource({
        project: tampered,
        qualifiedName: 'skillbox/code-review',
        force: true,
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });
});

describe('planUpdate', () => {
  it('reports nothing to do when everything is current', async () => {
    const { project, catalog } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    const report = await planUpdate({ project, catalog });

    expect(report.updatable).toEqual([]);
    expect(report.plan).toBeUndefined();
    expect(report.candidates[0]?.upToDate).toBe(true);
  });

  it('finds a newer version inside the requested range', async () => {
    await installed(
      [{ name: 'code-review', target: 'target-dir', version: '0.1.0' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    await addVersion('code-review', '0.1.5');

    const report = await planUpdate({
      project: await loadProject(projectRoot),
      catalog: await loadCatalog(registryRoot),
    });

    expect(report.updatable).toHaveLength(1);
    expect(report.updatable[0]?.currentVersion).toBe('0.1.0');
    expect(report.updatable[0]?.targetVersion).toBe('0.1.5');
    expect(report.plan).toBeDefined();
  });

  it('will not cross the requested range boundary', async () => {
    // Moving to a new major version is a deliberate act, done by editing the
    // manifest, not something update does silently (FR-10.1).
    await installed(
      [{ name: 'code-review', target: 'target-dir', version: '0.1.0' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    await addVersion('code-review', '1.0.0');

    const report = await planUpdate({
      project: await loadProject(projectRoot),
      catalog: await loadCatalog(registryRoot),
    });

    expect(report.updatable).toEqual([]);
    expect(report.candidates[0]?.blockedByRange).toBe('1.0.0');
  });

  it('produces a plan for the updatable set', async () => {
    await installed(
      [{ name: 'code-review', target: 'target-dir', version: '0.1.0' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    // 0.2.0 would be outside ^0.1.0, since caret pins the minor below 1.0.
    await addVersion('code-review', '0.1.9');

    const report = await planUpdate({
      project: await loadProject(projectRoot),
      catalog: await loadCatalog(registryRoot),
    });

    expect(report.plan?.resources[0]?.version).toBe('0.1.9');
  });

  it('limits to one resource when asked', async () => {
    const { project, catalog } = await installed(
      [
        { name: 'first-resource', target: 'first-dir' },
        { name: 'second-resource', target: 'second-dir' },
      ],
      [
        { reference: 'skillbox/first-resource' },
        { reference: 'skillbox/second-resource' },
      ],
    );

    const report = await planUpdate({
      project,
      catalog,
      only: 'skillbox/first-resource',
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.qualifiedName).toBe('skillbox/first-resource');
  });

  it('rejects a resource that is not in the project manifest', async () => {
    const { project, catalog } = await installed(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await expect(
      planUpdate({ project, catalog, only: 'skillbox/absent-resource' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_INSTALLED' });
  });
});

describe('runDoctor', () => {
  it('reports a healthy project with no findings', async () => {
    const { project, catalog } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const report = await runDoctor({ project, catalog, env: {} });

    expect(report.healthy).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.checks.every((check) => check.status === 'ok')).toBe(true);
  });

  it('detects a missing installed file', async () => {
    const { catalog } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, 'target-dir', 'entry.md'));

    const report = await runDoctor({
      project: await loadProject(projectRoot),
      catalog,
      env: {},
    });

    const files = report.checks.find((check) => check.name === 'files');

    expect(files?.status).toBe('error');
    expect(files?.details.some((detail) => detail.includes('entry.md'))).toBe(true);
    expect(files?.hint).toBeTruthy();
  });

  it('detects a file whose content no longer matches its digest', async () => {
    const { catalog } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    await dir.write('my-project/target-dir/entry.md', 'edited');

    const report = await runDoctor({
      project: await loadProject(projectRoot),
      catalog,
      env: {},
    });

    const files = report.checks.find((check) => check.name === 'files');

    expect(files?.status).toBe('warning');
    expect(files?.message).toContain('local modifications');
  });

  it('detects a manifest and lockfile disagreement', async () => {
    const { project, catalog } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    await writeProjectManifest(projectRoot, {
      ...project.manifest,
      spec: {
        ...project.manifest.spec,
        resources: [{ resource: 'skillbox/code-review', version: '^9.0.0' }],
      },
    });

    const report = await runDoctor({
      project: await loadProject(projectRoot),
      catalog,
      env: {},
    });

    const lockfile = report.checks.find((check) => check.name === 'lockfile');

    expect(lockfile?.status).toBe('error');
  });

  it('reports required environment variables by name only', async () => {
    // The value is never read, so nothing sensitive can reach output (SR-7).
    const { project, catalog } = await installed(
      [
        {
          name: 'api-resource',
          kind: 'api',
          target: 'target-dir',
          env: [
            {
              name: 'SKILLBOX_EXAMPLE_TOKEN',
              description: 'A token for the example service.',
              required: true,
              secret: true,
            },
          ],
        },
      ],
      [{ reference: 'skillbox/api-resource' }],
    );

    const report = await runDoctor({ project, catalog, env: {} });
    const environment = report.checks.find((check) => check.name === 'environment');

    expect(environment?.status).toBe('warning');
    expect(environment?.details[0]).toContain('SKILLBOX_EXAMPLE_TOKEN');
    expect(environment?.hint).toContain('never stores their values');
  });

  it('reports an environment variable as satisfied when present', async () => {
    const { project, catalog } = await installed(
      [
        {
          name: 'api-resource',
          kind: 'api',
          target: 'target-dir',
          env: [
            {
              name: 'SKILLBOX_EXAMPLE_TOKEN',
              description: 'A token for the example service.',
              required: true,
            },
          ],
        },
      ],
      [{ reference: 'skillbox/api-resource' }],
    );

    const report = await runDoctor({
      project,
      catalog,
      env: { SKILLBOX_EXAMPLE_TOKEN: 'a-value-that-must-not-be-read' },
    });

    const environment = report.checks.find((check) => check.name === 'environment');

    expect(environment?.status).toBe('ok');
  });

  it('does not include an environment value anywhere in the report', async () => {
    const sentinel = 'SENTINEL_SECRET_VALUE_9f3a';

    const { project, catalog } = await installed(
      [
        {
          name: 'api-resource',
          kind: 'api',
          target: 'target-dir',
          env: [
            {
              name: 'SKILLBOX_EXAMPLE_TOKEN',
              description: 'A token for the example service.',
              required: true,
            },
          ],
        },
      ],
      [{ reference: 'skillbox/api-resource' }],
    );

    const report = await runDoctor({
      project,
      catalog,
      env: { SKILLBOX_EXAMPLE_TOKEN: sentinel },
    });

    expect(JSON.stringify(report)).not.toContain(sentinel);
  });

  it('ignores an optional environment variable that is unset', async () => {
    const { project, catalog } = await installed(
      [
        {
          name: 'api-resource',
          kind: 'api',
          target: 'target-dir',
          env: [
            {
              name: 'SKILLBOX_OPTIONAL_SETTING',
              description: 'An optional setting.',
              required: false,
            },
          ],
        },
      ],
      [{ reference: 'skillbox/api-resource' }],
    );

    const report = await runDoctor({ project, catalog, env: {} });

    expect(report.checks.find((check) => check.name === 'environment')?.status).toBe(
      'ok',
    );
  });

  it('warns when an installed resource is no longer in the catalog', async () => {
    const { project } = await installed(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const emptyRegistry = await dir.mkdir('empty-registry');

    const report = await runDoctor({
      project,
      catalog: await loadCatalog(emptyRegistry),
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'catalog')?.status).toBe(
      'warning',
    );
  });

  it('detects an unsatisfied recorded dependency', async () => {
    const { project, catalog } = await installed(
      [
        {
          name: 'consumer-resource',
          target: 'target-dir',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource', target: 'provider-dir' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    const withoutProvider: Project = {
      ...project,
      lockfile: {
        ...project.lockfile,
        resources: {
          'skillbox/consumer-resource':
            project.lockfile.resources['skillbox/consumer-resource']!,
        },
      },
    };

    const report = await runDoctor({ project: withoutProvider, catalog, env: {} });

    expect(report.checks.find((check) => check.name === 'dependencies')?.status).toBe(
      'error',
    );
  });

  it('warns about an unmet Node runtime requirement', async () => {
    const { project, catalog } = await installed(
      [
        {
          name: 'future-resource',
          kind: 'script',
          target: 'target-dir',
          entrypoint: 'entry.md',
          files: ['entry.md'],
          spec: { runtime: { type: 'node', version: '>=999.0.0' } },
        },
      ],
      [{ reference: 'skillbox/future-resource' }],
    );

    const report = await runDoctor({ project, catalog, env: {} });
    const runtime = report.checks.find((check) => check.name === 'runtime');

    expect(runtime?.status).toBe('warning');
    expect(runtime?.details[0]).toContain('999.0.0');
  });
});
