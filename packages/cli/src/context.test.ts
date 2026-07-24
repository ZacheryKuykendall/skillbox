import path from 'node:path';

import { initProject } from '@skillbox/core';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContext, defaultRegistryPath } from './context.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('registry resolution', () => {
  it('prefers an explicit --registry over the environment', async () => {
    const explicit = await dir.mkdir('explicit-registry');

    const context = createContext({
      cwd: dir.path,
      registry: explicit,
      env: { SKILLBOX_REGISTRY: await dir.mkdir('env-registry') },
    });

    expect(context.registryPath()).toBe(explicit);
  });

  it('uses SKILLBOX_REGISTRY when no flag is given', async () => {
    const fromEnv = await dir.mkdir('env-registry');

    const context = createContext({
      cwd: dir.path,
      env: { SKILLBOX_REGISTRY: fromEnv },
    });

    expect(context.registryPath()).toBe(fromEnv);
  });

  it('falls back to the bundled registry', () => {
    const context = createContext({ cwd: dir.path, env: {} });

    expect(context.registryPath()).toBe(defaultRegistryPath());
  });

  it('resolves a relative registry path against the working directory', async () => {
    await dir.mkdir('nested/registry');

    const context = createContext({
      cwd: dir.path,
      env: {},
      registry: path.join('nested', 'registry'),
    });

    expect(context.registryPath()).toBe(dir.resolve('nested', 'registry'));
  });

  it('loads the catalog from the resolved path', async () => {
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);

    const context = createContext({ cwd: dir.path, env: {}, registry });
    const catalog = await context.catalog();

    expect(catalog.names()).toEqual(['skillbox/code-review']);
  });
});

describe('project resolution', () => {
  it('prefers an explicit --project over discovery', async () => {
    const explicit = await dir.mkdir('explicit-project');
    await initProject({ root: explicit });

    const context = createContext({ cwd: dir.path, env: {}, project: explicit });

    expect(await context.projectRoot()).toBe(explicit);
  });

  it('uses SKILLBOX_PROJECT when no flag is given', async () => {
    const fromEnv = await dir.mkdir('env-project');
    await initProject({ root: fromEnv });

    const context = createContext({
      cwd: dir.path,
      env: { SKILLBOX_PROJECT: fromEnv },
    });

    expect(await context.projectRoot()).toBe(fromEnv);
  });

  it('discovers the project by walking up from the working directory', async () => {
    const root = await dir.mkdir('discovered-project');
    await initProject({ root });
    const nested = await dir.mkdir('discovered-project/src/deep');

    const context = createContext({ cwd: nested, env: {} });

    expect(await context.projectRoot()).toBe(root);
  });

  it('fails with an actionable error when no project is found', async () => {
    const orphan = await dir.mkdir('no-project-here');

    const context = createContext({ cwd: orphan, env: {} });

    await expect(context.projectRoot()).rejects.toMatchObject({
      code: 'PROJECT_NOT_INITIALIZED',
      hint: expect.stringContaining('skillbox init'),
    });
  });

  it('loads the project once resolved', async () => {
    const root = await dir.mkdir('loadable-project');
    await initProject({ root, name: 'loadable-project' });

    const context = createContext({ cwd: root, env: {} });
    const project = await context.project();

    expect(project.manifest.metadata.name).toBe('loadable-project');
  });

  it('resolves a relative project path against the working directory', async () => {
    const root = await dir.mkdir('relative-project');
    await initProject({ root });

    const context = createContext({
      cwd: dir.path,
      env: {},
      project: 'relative-project',
    });

    expect(await context.projectRoot()).toBe(root);
  });
});

describe('writer configuration', () => {
  it('exposes a writer honoring the json option', () => {
    expect(createContext({ cwd: dir.path, env: {}, json: true }).writer.isJson).toBe(
      true,
    );
    expect(createContext({ cwd: dir.path, env: {} }).writer.isJson).toBe(false);
  });

  it('exposes the working directory and options it was given', () => {
    const context = createContext({ cwd: dir.path, env: {}, registry: 'somewhere' });

    expect(context.cwd).toBe(dir.path);
    expect(context.options.registry).toBe('somewhere');
  });
});
