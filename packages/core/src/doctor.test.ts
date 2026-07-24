import { API_VERSION, emptyLockfile, type Lockfile } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCatalog, loadCatalog, type Catalog } from './catalog.js';
import { reportDiagnostics, runDoctor } from './doctor.js';
import { digestOf } from './integrity.js';
import type { Project } from './project.js';

let dir: TempDir;
let emptyCatalog: Catalog;

beforeEach(async () => {
  dir = await createTempDir();
  emptyCatalog = buildCatalog(dir.path, []);
});

afterEach(async () => {
  await dir.cleanup();
});

/** A project with an arbitrary lockfile, for exercising individual checks. */
function projectWith(
  lockfile: Lockfile,
  resources: { resource: string; version: string }[] = [],
): Project {
  return {
    root: dir.path,
    manifest: {
      apiVersion: API_VERSION,
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: { resources },
    },
    lockfile,
  };
}

function lockEntry(overrides: Partial<Lockfile['resources'][string]> = {}) {
  return {
    version: '0.1.0',
    kind: 'prompt' as const,
    source: { type: 'local' as const, path: 'prompts/a-resource' },
    integrity: digestOf('x'),
    target: 'target-dir',
    files: {},
    requestedBy: 'direct' as const,
    ...overrides,
  };
}

describe('runDoctor', () => {
  it('reports every check as ok for an empty project', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile()),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.healthy).toBe(true);
    expect(report.checks).toHaveLength(7);
    expect(report.checks.map((check) => check.name).sort()).toEqual([
      'catalog',
      'configuration',
      'dependencies',
      'environment',
      'files',
      'lockfile',
      'runtime',
    ]);
  });

  it('names the project in the configuration check', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile()),
      catalog: emptyCatalog,
      env: {},
    });

    expect(
      report.checks.find((check) => check.name === 'configuration')?.message,
    ).toContain('my-project');
  });

  it('detects a resource requested but absent from the lockfile', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile(), [
        { resource: 'skillbox/code-review', version: '^0.1.0' },
      ]),
      catalog: emptyCatalog,
      env: {},
    });

    const lockfile = report.checks.find((check) => check.name === 'lockfile');

    expect(lockfile?.status).toBe('error');
    expect(lockfile?.details[0]).toContain('requested but not locked');
  });

  it('detects a locked version outside the requested range', async () => {
    const report = await runDoctor({
      project: projectWith(
        { lockfileVersion: 1, resources: { 'skillbox/code-review': lockEntry() } },
        [{ resource: 'skillbox/code-review', version: '^9.0.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    const lockfile = report.checks.find((check) => check.name === 'lockfile');

    expect(lockfile?.status).toBe('error');
    expect(
      lockfile?.details.some((detail) => detail.includes('manifest requests')),
    ).toBe(true);
  });

  it('detects a direct lockfile entry with no manifest entry', async () => {
    const report = await runDoctor({
      project: projectWith({
        lockfileVersion: 1,
        resources: { 'skillbox/code-review': lockEntry() },
      }),
      catalog: emptyCatalog,
      env: {},
    });

    const lockfile = report.checks.find((check) => check.name === 'lockfile');

    expect(lockfile?.status).toBe('error');
    expect(lockfile?.details.some((detail) => detail.includes('not requested'))).toBe(
      true,
    );
  });

  it('accepts a transitive lockfile entry with no manifest entry', async () => {
    // A dependency belongs in the lockfile only, so this is normal.
    const report = await runDoctor({
      project: projectWith({
        lockfileVersion: 1,
        resources: {
          'skillbox/provider-resource': lockEntry({
            requestedBy: 'skillbox/consumer-resource',
          }),
        },
      }),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'lockfile')?.status).toBe('ok');
  });

  it('rejects a lockfile recording a file outside the project', async () => {
    // A lockfile can arrive via a pull request, so its paths are untrusted (T5).
    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/code-review': lockEntry({
              files: { '../../escaped.txt': digestOf('x') },
            }),
          },
        },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    const files = report.checks.find((check) => check.name === 'files');

    expect(files?.status).toBe('error');
    expect(files?.message).toContain('outside the project directory');
    expect(files?.hint).toContain('tampering');
  });

  it('uses singular wording for a single missing file', async () => {
    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/code-review': lockEntry({
              files: { 'target-dir/gone.md': digestOf('x') },
            }),
          },
        },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'files')?.message).toContain(
      '1 installed file is missing',
    );
  });

  it('uses plural wording for several missing files', async () => {
    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/code-review': lockEntry({
              files: {
                'target-dir/gone-one.md': digestOf('x'),
                'target-dir/gone-two.md': digestOf('y'),
              },
            }),
          },
        },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'files')?.message).toContain(
      '2 installed files are missing',
    );
  });

  it('uses singular wording for one modified file', async () => {
    await dir.write('target-dir/edited.md', 'edited content');

    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/code-review': lockEntry({
              files: { 'target-dir/edited.md': digestOf('original content') },
            }),
          },
        },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'files')?.message).toContain(
      '1 installed file has local modifications',
    );
  });

  it('uses singular wording for one dependency problem', async () => {
    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/consumer-resource': lockEntry({
              dependencies: ['skillbox/absent-resource'],
            }),
          },
        },
        [{ resource: 'skillbox/consumer-resource', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    const dependencies = report.checks.find((check) => check.name === 'dependencies');

    expect(dependencies?.status).toBe('error');
    expect(dependencies?.message).toContain('1 dependency problem');
  });

  it('uses singular wording for one resource missing from the catalog', async () => {
    const report = await runDoctor({
      project: projectWith(
        { lockfileVersion: 1, resources: { 'skillbox/code-review': lockEntry() } },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'catalog')?.message).toContain(
      '1 installed resource is not in the current catalog',
    );
  });

  it('reports the running Node version when runtime requirements are met', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile()),
      catalog: emptyCatalog,
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'runtime')?.message).toContain(
      process.versions.node,
    );
  });

  it('ignores a runtime declaration with no version constraint', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'unconstrained-resource',
        kind: 'script',
        spec: { runtime: { type: 'node' } },
      },
    ]);

    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/unconstrained-resource': lockEntry({ kind: 'script' }),
          },
        },
        [{ resource: 'skillbox/unconstrained-resource', version: '^0.1.0' }],
      ),
      catalog: await loadCatalog(registry),
      env: {},
    });

    expect(report.checks.find((check) => check.name === 'runtime')?.status).toBe('ok');
  });

  it('ignores a non-node runtime declaration', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'python-resource',
        kind: 'script',
        spec: {
          interpreter: 'python',
          runtime: { type: 'python', version: '>=3.12.0' },
        },
      },
    ]);

    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: { 'skillbox/python-resource': lockEntry({ kind: 'script' }) },
        },
        [{ resource: 'skillbox/python-resource', version: '^0.1.0' }],
      ),
      catalog: await loadCatalog(registry),
      env: {},
    });

    // Skillbox does not manage Python versions, so it makes no claim about them.
    expect(report.checks.find((check) => check.name === 'runtime')?.status).toBe('ok');
  });

  it('counts errors and warnings separately', async () => {
    await dir.write('target-dir/edited.md', 'edited');

    const report = await runDoctor({
      project: projectWith(
        {
          lockfileVersion: 1,
          resources: {
            'skillbox/code-review': lockEntry({
              files: { 'target-dir/edited.md': digestOf('original') },
            }),
          },
        },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    // Modified file is a warning; the resource being absent from the catalog is
    // also a warning. Nothing here is an error.
    expect(report.errors).toBe(0);
    expect(report.warnings).toBeGreaterThan(0);
    expect(report.healthy).toBe(false);
  });

  it('defaults to the process environment when none is injected', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile()),
      catalog: emptyCatalog,
    });

    expect(report.checks.find((check) => check.name === 'environment')?.status).toBe(
      'ok',
    );
  });
});

describe('reportDiagnostics', () => {
  it('omits checks that passed', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile()),
      catalog: emptyCatalog,
      env: {},
    });

    expect(reportDiagnostics(report)).toEqual([]);
  });

  it('maps an error check to an error diagnostic with its hint', async () => {
    const report = await runDoctor({
      project: projectWith(emptyLockfile(), [
        { resource: 'skillbox/code-review', version: '^0.1.0' },
      ]),
      catalog: emptyCatalog,
      env: {},
    });

    const diagnostics = reportDiagnostics(report);
    const lockfile = diagnostics.find((diagnostic) => diagnostic.path === 'lockfile');

    expect(lockfile?.severity).toBe('error');
    expect(lockfile?.hint).toBeTruthy();
  });

  it('maps a warning check to a warning diagnostic', async () => {
    const report = await runDoctor({
      project: projectWith(
        { lockfileVersion: 1, resources: { 'skillbox/code-review': lockEntry() } },
        [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      ),
      catalog: emptyCatalog,
      env: {},
    });

    expect(
      reportDiagnostics(report).some((diagnostic) => diagnostic.severity === 'warning'),
    ).toBe(true);
  });
});
