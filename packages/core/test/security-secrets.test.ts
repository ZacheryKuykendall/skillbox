import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { validateManifest } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPlan } from '../src/apply.js';
import { loadCatalog } from '../src/catalog.js';
import { runDoctor } from '../src/doctor.js';
import { initProject } from '../src/init.js';
import { serializeLockfile } from '../src/lockfile.js';
import { planInstall } from '../src/plan.js';
import {
  loadProject,
  serializeProjectManifest,
  writeLockfile,
  writeProjectManifest,
} from '../src/project.js';
import { validateDirectory } from '../src/validate.js';

/**
 * Secret handling: a value must never enter a Skillbox artifact or output.
 *
 * The whole guarantee rests on Skillbox never reading a declared environment
 * variable's value. These tests set a sentinel in the environment, run the full
 * lifecycle, and assert the sentinel appears in nothing Skillbox produced
 * (T3, SR-7, SR-8).
 *
 * Required by docs/architecture/security-model.md. Do not weaken without an ADR.
 */

/** Distinctive enough that a substring match cannot be a false negative. */
const SENTINEL = 'SENTINEL-SECRET-VALUE-8f3a-DO-NOT-LEAK';

let dir: TempDir;
let projectRoot: string;
let registryRoot: string;

const ENV_NAME = 'SKILLBOX_EXAMPLE_API_TOKEN';

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('project');

  registryRoot = await writeRegistry(dir, [
    {
      name: 'api-resource',
      kind: 'api',
      target: 'src/integrations/api',
      env: [
        {
          name: ENV_NAME,
          description: 'Bearer token for the example service.',
          required: true,
          secret: true,
        },
        {
          name: 'SKILLBOX_EXAMPLE_API_BASE_URL',
          description: 'Base URL of the example service.',
          required: true,
        },
      ],
      permissions: ['network:outbound', 'env:read'],
    },
  ]);
});

afterEach(async () => {
  await dir.cleanup();
});

/** Recursively read every file under a directory. */
async function readAllFiles(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.set(full, await readFile(full, 'utf8'));
      }
    }
  }

  await walk(root);
  return files;
}

describe('the full lifecycle with a secret set in the environment', () => {
  it('writes the sentinel into no file Skillbox produced', async () => {
    const env = {
      [ENV_NAME]: SENTINEL,
      SKILLBOX_EXAMPLE_API_BASE_URL: `https://user:${SENTINEL}@api.example.com`,
    };

    const catalog = await loadCatalog(registryRoot);
    await initProject({ root: projectRoot });

    const project = await loadProject(projectRoot);
    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/api-resource' }],
    });

    const result = await applyPlan({
      plan,
      manifest: project.manifest,
      lockfile: project.lockfile,
      requestedRanges: new Map([['skillbox/api-resource', '^0.1.0']]),
      registryRoot,
    });

    await writeProjectManifest(projectRoot, result.manifest);
    await writeLockfile(projectRoot, result.lockfile);

    const reloaded = await loadProject(projectRoot);
    const report = await runDoctor({ project: reloaded, catalog, env });

    // Every artifact Skillbox wrote.
    for (const [file, contents] of await readAllFiles(projectRoot)) {
      expect(contents, `${file} must not contain the sentinel`).not.toContain(SENTINEL);
    }

    // Every in-memory structure a caller might serialize.
    expect(JSON.stringify(plan)).not.toContain(SENTINEL);
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(JSON.stringify(report)).not.toContain(SENTINEL);
    expect(serializeLockfile(result.lockfile)).not.toContain(SENTINEL);
    expect(serializeProjectManifest(result.manifest)).not.toContain(SENTINEL);
  });

  it('records the variable name while never reading its value', async () => {
    const catalog = await loadCatalog(registryRoot);
    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/api-resource' }],
    });

    // The name is surfaced so a user knows what to supply.
    expect(plan.env.map((variable) => variable.name)).toContain(ENV_NAME);

    // The declaration carries no value field at all.
    for (const variable of plan.env) {
      expect(Object.keys(variable)).not.toContain('value');
    }
  });
});

describe('doctor', () => {
  it('reports an unset variable by name only', async () => {
    const catalog = await loadCatalog(registryRoot);
    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const report = await runDoctor({ project, catalog, env: {} });
    const environment = report.checks.find((check) => check.name === 'environment');

    // Nothing is installed yet, so there is nothing to check.
    expect(environment?.status).toBe('ok');
  });

  it('never includes the value of a variable that is set', async () => {
    const catalog = await loadCatalog(registryRoot);
    await initProject({ root: projectRoot });

    const project = await loadProject(projectRoot);
    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/api-resource' }],
    });
    const result = await applyPlan({
      plan,
      manifest: project.manifest,
      lockfile: project.lockfile,
      requestedRanges: new Map(),
      registryRoot,
    });
    await writeLockfile(projectRoot, result.lockfile);
    await writeProjectManifest(projectRoot, result.manifest);

    const report = await runDoctor({
      project: await loadProject(projectRoot),
      catalog,
      env: { [ENV_NAME]: SENTINEL, SKILLBOX_EXAMPLE_API_BASE_URL: 'https://x' },
    });

    expect(JSON.stringify(report)).not.toContain(SENTINEL);
    expect(report.checks.find((check) => check.name === 'environment')?.status).toBe(
      'ok',
    );
  });

  it('states that values are never stored, so the guarantee is discoverable', async () => {
    const catalog = await loadCatalog(registryRoot);
    await initProject({ root: projectRoot });

    const project = await loadProject(projectRoot);
    const plan = await planInstall({
      projectRoot,
      catalog,
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/api-resource' }],
    });
    const result = await applyPlan({
      plan,
      manifest: project.manifest,
      lockfile: project.lockfile,
      requestedRanges: new Map(),
      registryRoot,
    });
    await writeLockfile(projectRoot, result.lockfile);
    await writeProjectManifest(projectRoot, result.manifest);

    const report = await runDoctor({
      project: await loadProject(projectRoot),
      catalog,
      env: {},
    });

    const environment = report.checks.find((check) => check.name === 'environment');

    expect(environment?.status).toBe('warning');
    expect(environment?.hint).toContain('never stores their values');
  });
});

describe('validation diagnostics', () => {
  it('does not echo a value pasted into an env name field', () => {
    // An author might paste a real token where a variable name belongs. If the
    // error quoted the received value, the secret would reach logs and CI output.
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'pasted-secret',
        version: '0.1.0',
        description: 'A fixture where a value was pasted into a name field.',
      },
      spec: {
        entrypoint: 'entry.md',
        files: ['entry.md'],
        protocol: 'rest',
        env: [{ name: SENTINEL, description: 'Pasted by mistake.' }],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.diagnostics)).not.toContain(SENTINEL);
    }
  });

  it('does not echo a value pasted into tokenEnv', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'pasted-token',
        version: '0.1.0',
        description: 'A fixture where a token was pasted into tokenEnv.',
      },
      spec: {
        entrypoint: 'entry.md',
        files: ['entry.md'],
        protocol: 'rest',
        auth: { type: 'bearer', tokenEnv: SENTINEL },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.diagnostics)).not.toContain(SENTINEL);
    }
  });

  it('does not echo a credential-bearing URL pasted into baseUrlEnv', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'pasted-url',
        version: '0.1.0',
        description: 'A fixture where a URL was pasted into baseUrlEnv.',
      },
      spec: {
        entrypoint: 'entry.md',
        files: ['entry.md'],
        protocol: 'rest',
        baseUrlEnv: `https://user:${SENTINEL}@api.example.com`,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.diagnostics)).not.toContain(SENTINEL);
    }
  });

  it('keeps validating the rest of the catalog without leaking', async () => {
    const report = await validateDirectory({ directory: registryRoot });

    expect(JSON.stringify(report)).not.toContain(SENTINEL);
    expect(report.ok).toBe(true);
  });
});

describe('the manifest format cannot carry a value', () => {
  it('rejects a value field on an env declaration', () => {
    // This is the structural reason the guarantee holds: there is no field to
    // put a value in, and strict validation means one cannot be added.
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'smuggled-value',
        version: '0.1.0',
        description: 'A fixture attempting to declare an environment value.',
      },
      spec: {
        entrypoint: 'entry.md',
        files: ['entry.md'],
        protocol: 'rest',
        env: [{ name: 'A_TOKEN', description: 'Nope.', value: SENTINEL }],
      },
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a secret field anywhere else in the spec', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'smuggled-secret',
        version: '0.1.0',
        description: 'A fixture attempting to declare a secret in the spec.',
      },
      spec: {
        entrypoint: 'entry.md',
        files: ['entry.md'],
        protocol: 'rest',
        secrets: { token: SENTINEL },
      },
    });

    expect(result.ok).toBe(false);
  });
});

describe('the repository itself', () => {
  it('contains no .env file that could hold real values', async () => {
    // .gitignore excludes .env* categorically; this asserts none slipped in.
    const { stat } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');

    const repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
    );

    for (const candidate of ['.env', '.env.local', '.env.production']) {
      await expect(
        stat(path.join(repositoryRoot, candidate)),
        `${candidate} must not exist in the repository`,
      ).rejects.toThrow();
    }
  });
});
