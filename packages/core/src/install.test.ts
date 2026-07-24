import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { LOCKFILE_FILENAME, PROJECT_DIRECTORY } from '@skillbox/schema';
import {
  createTempDir,
  writeRegistry,
  type ResourceSpec,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPlan } from './apply.js';
import { loadCatalog, type Catalog } from './catalog.js';
import { initProject, projectNameFromDirectory } from './init.js';
import { serializeLockfile } from './lockfile.js';
import { planInstall } from './plan.js';
import { loadProject, writeLockfile, writeProjectManifest } from './project.js';

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

async function setUpCatalog(resources: readonly ResourceSpec[]): Promise<Catalog> {
  registryRoot = await writeRegistry(dir, resources);
  return loadCatalog(registryRoot);
}

/** Init, plan, and apply in one step, returning the installed project state. */
async function install(
  resources: readonly ResourceSpec[],
  requested: readonly { reference: string; range?: string; target?: string }[],
  options: { beforeWrite?: (destination: string) => void } = {},
) {
  const catalog = await setUpCatalog(resources);
  await initProject({ root: projectRoot });

  const project = await loadProject(projectRoot);
  const plan = await planInstall({
    projectRoot,
    catalog,
    lockfile: project.lockfile,
    requested,
  });

  const result = await applyPlan({
    plan,
    manifest: project.manifest,
    lockfile: project.lockfile,
    requestedRanges: new Map(
      requested.map((entry) => [entry.reference, entry.range ?? '^0.1.0']),
    ),
    registryRoot,
    ...(options.beforeWrite === undefined ? {} : { beforeWrite: options.beforeWrite }),
  });

  await writeProjectManifest(projectRoot, result.manifest);
  await writeLockfile(projectRoot, result.lockfile);

  return result;
}

describe('initProject', () => {
  it('creates the project directory, manifest, and lockfile', async () => {
    const result = await initProject({ root: projectRoot });

    expect(result.created).toEqual([
      `${PROJECT_DIRECTORY}/skillbox.yaml`,
      `${PROJECT_DIRECTORY}/${LOCKFILE_FILENAME}`,
    ]);

    for (const created of result.created) {
      expect((await stat(path.join(projectRoot, created))).isFile()).toBe(true);
    }
  });

  it('derives the project name from the directory', async () => {
    const result = await initProject({ root: projectRoot });

    expect(result.name).toBe('my-project');
  });

  it('accepts an explicit name', async () => {
    const result = await initProject({ root: projectRoot, name: 'custom-name' });

    expect(result.name).toBe('custom-name');
    expect((await loadProject(projectRoot)).manifest.metadata.name).toBe('custom-name');
  });

  it('rejects an invalid explicit name', async () => {
    await expect(
      initProject({ root: projectRoot, name: 'Not Valid!' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses to overwrite an existing project', async () => {
    await initProject({ root: projectRoot });

    await expect(initProject({ root: projectRoot })).rejects.toMatchObject({
      code: 'ALREADY_INITIALIZED',
    });
  });

  it('changes nothing when it refuses', async () => {
    await initProject({ root: projectRoot, name: 'original-name' });
    const before = await readFile(
      path.join(projectRoot, PROJECT_DIRECTORY, 'skillbox.yaml'),
      'utf8',
    );

    await expect(
      initProject({ root: projectRoot, name: 'clobbered' }),
    ).rejects.toThrow();

    expect(
      await readFile(
        path.join(projectRoot, PROJECT_DIRECTORY, 'skillbox.yaml'),
        'utf8',
      ),
    ).toBe(before);
  });

  it('overwrites when forced', async () => {
    await initProject({ root: projectRoot, name: 'original-name' });
    await initProject({ root: projectRoot, name: 'replacement', force: true });

    expect((await loadProject(projectRoot)).manifest.metadata.name).toBe('replacement');
  });

  it('writes a lockfile that loads as empty', async () => {
    await initProject({ root: projectRoot });

    expect((await loadProject(projectRoot)).lockfile.resources).toEqual({});
  });
});

describe('projectNameFromDirectory', () => {
  it.each([
    ['my-project', 'my-project'],
    ['MyProject', 'myproject'],
    ['my_project', 'my-project'],
    ['my project', 'my-project'],
    ['my.project', 'my-project'],
    ['--weird--', 'weird'],
    ['a', 'skillbox-project'],
    ['_', 'skillbox-project'],
  ])('derives %s as %s', (directory, expected) => {
    expect(projectNameFromDirectory(path.join('/tmp', directory))).toBe(expected);
  });
});

describe('loadProject', () => {
  it('reports a clear error when not initialized', async () => {
    await expect(loadProject(projectRoot)).rejects.toMatchObject({
      code: 'PROJECT_NOT_INITIALIZED',
    });
  });

  it('hints at running init', async () => {
    await expect(loadProject(projectRoot)).rejects.toMatchObject({
      hint: expect.stringContaining('skillbox init'),
    });
  });

  it('treats an absent lockfile as empty', async () => {
    await initProject({ root: projectRoot });

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, PROJECT_DIRECTORY, LOCKFILE_FILENAME));

    expect((await loadProject(projectRoot)).lockfile.resources).toEqual({});
  });

  it('rejects a malformed project manifest', async () => {
    await dir.write(`my-project/${PROJECT_DIRECTORY}/skillbox.yaml`, 'a: [unclosed');

    await expect(loadProject(projectRoot)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects a structurally invalid project manifest', async () => {
    await dir.write(
      `my-project/${PROJECT_DIRECTORY}/skillbox.yaml`,
      'apiVersion: skillbox.dev/v1alpha1\nkind: NotAProject\n',
    );

    await expect(loadProject(projectRoot)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects a malformed lockfile', async () => {
    await initProject({ root: projectRoot });
    await dir.write(`my-project/${PROJECT_DIRECTORY}/${LOCKFILE_FILENAME}`, 'a: [oops');

    await expect(loadProject(projectRoot)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('applyPlan', () => {
  it('copies declared files to the install target', async () => {
    await install(
      [{ name: 'code-review', target: '.skillbox/prompts/code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(
      await readFile(
        path.join(projectRoot, '.skillbox', 'prompts', 'code-review', 'entry.md'),
        'utf8',
      ),
    ).toContain('code-review');
  });

  it('records the resource in the project manifest with the requested range', async () => {
    await install(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review', range: '^0.1.0' }],
    );

    const project = await loadProject(projectRoot);

    expect(project.manifest.spec.resources).toEqual([
      { resource: 'skillbox/code-review', version: '^0.1.0' },
    ]);
  });

  it('records exact resolution facts in the lockfile', async () => {
    await install([{ name: 'code-review' }], [{ reference: 'skillbox/code-review' }]);

    const locked = (await loadProject(projectRoot)).lockfile.resources[
      'skillbox/code-review'
    ];

    expect(locked?.version).toBe('0.1.0');
    expect(locked?.kind).toBe('prompt');
    expect(locked?.requestedBy).toBe('direct');
    expect(locked?.integrity).toMatch(/^sha256-/);
    expect(Object.keys(locked?.files ?? {})).toHaveLength(2);
  });

  it('records a digest for every installed file that matches the file on disk', async () => {
    await install(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const { digestOfFile } = await import('./integrity.js');
    const locked = (await loadProject(projectRoot)).lockfile.resources[
      'skillbox/code-review'
    ];

    for (const [installedPath, digest] of Object.entries(locked?.files ?? {})) {
      expect(await digestOfFile(path.join(projectRoot, installedPath))).toBe(digest);
    }
  });

  it('installs dependencies and records them in the lockfile only', async () => {
    // A transitive dependency belongs in the lockfile, not in the statement of
    // what the project asked for.
    await install(
      [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    const project = await loadProject(projectRoot);

    expect(project.manifest.spec.resources?.map((r) => r.resource)).toEqual([
      'skillbox/consumer-resource',
    ]);
    expect(Object.keys(project.lockfile.resources).sort()).toEqual([
      'skillbox/consumer-resource',
      'skillbox/provider-resource',
    ]);
    expect(project.lockfile.resources['skillbox/provider-resource']?.requestedBy).toBe(
      'skillbox/consumer-resource',
    );
  });

  it('produces a lockfile that is unchanged when reinstalling', async () => {
    // The determinism claim end to end: no diff when nothing changed (ADR-0004).
    await install([{ name: 'code-review' }], [{ reference: 'skillbox/code-review' }]);

    const first = serializeLockfile((await loadProject(projectRoot)).lockfile);

    const catalog = await loadCatalog(registryRoot);
    const project = await loadProject(projectRoot);
    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/code-review' }],
    });
    const result = await applyPlan({
      plan,
      manifest: project.manifest,
      lockfile: project.lockfile,
      requestedRanges: new Map([['skillbox/code-review', '^0.1.0']]),
      registryRoot,
    });

    expect(serializeLockfile(result.lockfile)).toBe(first);
  });

  it('records a target override in the project manifest', async () => {
    await install(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review', target: 'custom/place' }],
    );

    expect((await loadProject(projectRoot)).manifest.spec.resources?.[0]?.target).toBe(
      'custom/place',
    );
  });

  it('omits the target when it matches the resource default', async () => {
    await install(
      [{ name: 'code-review', target: '.skillbox/prompts/code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(
      (await loadProject(projectRoot)).manifest.spec.resources?.[0]?.target,
    ).toBeUndefined();
  });

  it('substitutes project variables into installed text files', async () => {
    const catalog = await setUpCatalog([
      {
        name: 'templated-resource',
        files: ['entry.md'],
        entrypoint: 'entry.md',
        target: 'target-dir',
        contents: { 'entry.md': 'Service: {{skillbox.service-name}}\n' },
      },
    ]);

    await initProject({ root: projectRoot });
    const loaded = await loadProject(projectRoot);

    const withVariables = {
      ...loaded.manifest,
      spec: { ...loaded.manifest.spec, variables: { 'service-name': 'billing' } },
    };

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: loaded.lockfile,
      requested: [{ reference: 'skillbox/templated-resource' }],
    });

    await applyPlan({
      plan,
      manifest: withVariables,
      lockfile: loaded.lockfile,
      requestedRanges: new Map(),
      registryRoot,
    });

    expect(
      await readFile(path.join(projectRoot, 'target-dir', 'entry.md'), 'utf8'),
    ).toBe('Service: billing\n');
  });

  it('fails when a template references an undeclared variable', async () => {
    const catalog = await setUpCatalog([
      {
        name: 'templated-resource',
        files: ['entry.md'],
        entrypoint: 'entry.md',
        target: 'target-dir',
        contents: { 'entry.md': 'Service: {{skillbox.not-declared}}\n' },
      },
    ]);

    await initProject({ root: projectRoot });
    const loaded = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: loaded.lockfile,
      requested: [{ reference: 'skillbox/templated-resource' }],
    });

    await expect(
      applyPlan({
        plan,
        manifest: {
          ...loaded.manifest,
          spec: { ...loaded.manifest.spec, variables: { 'other-name': 'x' } },
        },
        lockfile: loaded.lockfile,
        requestedRanges: new Map(),
        registryRoot,
      }),
    ).rejects.toMatchObject({ code: 'UNDECLARED_VARIABLE' });
  });

  it('does not execute anything during installation', async () => {
    // A script resource is copied and nothing more (SR-5). If Skillbox executed
    // the entrypoint, the sentinel file would exist.
    await install(
      [
        {
          name: 'dangerous-script',
          kind: 'script',
          entrypoint: 'run.mjs',
          files: ['run.mjs'],
          target: 'scripts-dir',
          contents: {
            'run.mjs': `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(
              path.join(projectRoot, 'EXECUTED'),
            )}, 'x');`,
          },
        },
      ],
      [{ reference: 'skillbox/dangerous-script' }],
    );

    expect(await stat(path.join(projectRoot, 'scripts-dir', 'run.mjs'))).toBeTruthy();
    await expect(stat(path.join(projectRoot, 'EXECUTED'))).rejects.toThrow();
  });
});

describe('rollback', () => {
  it('leaves no new files when a write fails partway through', async () => {
    const catalog = await setUpCatalog([
      {
        name: 'multi-file',
        entrypoint: 'entry.md',
        files: ['entry.md', 'README.md', 'extra.md'],
        target: 'target-dir',
      },
    ]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/multi-file' }],
    });

    let writes = 0;

    await expect(
      applyPlan({
        plan,
        manifest: project.manifest,
        lockfile: project.lockfile,
        requestedRanges: new Map(),
        registryRoot,
        beforeWrite: () => {
          writes += 1;
          if (writes === 3) throw new Error('injected failure');
        },
      }),
    ).rejects.toThrow('injected failure');

    // The target directory was created by the install, so rollback removes it.
    await expect(stat(path.join(projectRoot, 'target-dir'))).rejects.toThrow();
  });

  it('restores the previous contents of an overwritten file', async () => {
    await dir.write('my-project/target-dir/entry.md', 'ORIGINAL CONTENT');

    const catalog = await setUpCatalog([
      {
        name: 'overwriting-resource',
        entrypoint: 'entry.md',
        files: ['entry.md', 'README.md'],
        target: 'target-dir',
      },
    ]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/overwriting-resource' }],
    });

    let writes = 0;

    await expect(
      applyPlan({
        plan,
        manifest: project.manifest,
        lockfile: project.lockfile,
        requestedRanges: new Map(),
        registryRoot,
        beforeWrite: () => {
          writes += 1;
          if (writes === 2) throw new Error('injected failure');
        },
      }),
    ).rejects.toThrow('injected failure');

    expect(
      await readFile(path.join(projectRoot, 'target-dir', 'entry.md'), 'utf8'),
    ).toBe('ORIGINAL CONTENT');
  });

  it('leaves the project manifest and lockfile untouched on failure', async () => {
    const catalog = await setUpCatalog([
      { name: 'failing-resource', target: 'target-dir' },
    ]);

    await initProject({ root: projectRoot });
    const before = await loadProject(projectRoot);
    const beforeLock = serializeLockfile(before.lockfile);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: before.lockfile,
      requested: [{ reference: 'skillbox/failing-resource' }],
    });

    await expect(
      applyPlan({
        plan,
        manifest: before.manifest,
        lockfile: before.lockfile,
        requestedRanges: new Map(),
        registryRoot,
        beforeWrite: () => {
          throw new Error('injected failure');
        },
      }),
    ).rejects.toThrow();

    // Configuration is written last, so a crash cannot leave it claiming an
    // install that did not finish.
    const after = await loadProject(projectRoot);
    expect(serializeLockfile(after.lockfile)).toBe(beforeLock);
    expect(after.manifest.spec.resources).toEqual([]);
  });

  it('does not delete a directory that already existed', async () => {
    await dir.write('my-project/existing/keep.txt', 'keep me');

    const catalog = await setUpCatalog([{ name: 'into-existing', target: 'existing' }]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/into-existing' }],
    });

    await expect(
      applyPlan({
        plan,
        manifest: project.manifest,
        lockfile: project.lockfile,
        requestedRanges: new Map(),
        registryRoot,
        beforeWrite: () => {
          throw new Error('injected failure');
        },
      }),
    ).rejects.toThrow();

    expect(await readdir(path.join(projectRoot, 'existing'))).toEqual(['keep.txt']);
  });
});
