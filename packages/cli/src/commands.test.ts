import path from 'node:path';

import {
  createTempDir,
  writeRegistry,
  type ResourceSpec,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultRegistryPath } from './context.js';
import { EXIT_CODES } from './exit-codes.js';
import { run } from './run.js';

/**
 * JSON-mode and option coverage for each command.
 *
 * The lifecycle is covered end to end by the integration suite against the built
 * binary; these run in-process so the branches are instrumented for coverage.
 */

let dir: TempDir;
let projectRoot: string;
let registryRoot: string;

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('project');
});

afterEach(async () => {
  await dir.cleanup();
});

async function cli(
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string; json: () => unknown }> {
  let stdout = '';
  let stderr = '';

  const code = await run(['node', 'skillbox', ...args], {
    cwd: projectRoot,
    env: { SKILLBOX_REGISTRY: registryRoot },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    isTty: false,
  });

  return { code, stdout, stderr, json: (): unknown => JSON.parse(stdout) };
}

async function setUp(resources: readonly ResourceSpec[]): Promise<void> {
  registryRoot = await writeRegistry(dir, resources);
}

/** Write an additional version of the code-review fixture into the registry. */
async function writeNewerVersion(version: string): Promise<void> {
  const directory = `registry/prompts/code-review-${version}`;

  await dir.write(
    `${directory}/skillbox.yaml`,
    [
      'apiVersion: skillbox.dev/v1alpha1',
      'kind: prompt',
      'metadata:',
      '  namespace: skillbox',
      '  name: code-review',
      `  version: ${version}`,
      `  description: Version ${version} of the code review prompt fixture.`,
      'spec:',
      '  entrypoint: entry.md',
      '  files:',
      '    - entry.md',
      '  install:',
      '    target: .skillbox/prompts/code-review',
      '',
    ].join('\n'),
  );
  await dir.write(`${directory}/entry.md`, `version ${version}\n`);
}

const BASIC: readonly ResourceSpec[] = [
  { name: 'code-review', kind: 'prompt', target: '.skillbox/prompts/code-review' },
];

describe('defaultRegistryPath', () => {
  it('points at a registry directory inside the repository', () => {
    // v0.1.0 has no remote registry, so a sensible local default matters.
    expect(defaultRegistryPath().endsWith(`${path.sep}registry`)).toBe(true);
  });
});

describe('init --json', () => {
  it('reports the created files', async () => {
    await setUp(BASIC);

    const result = await cli('init', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'init',
      data: {
        created: ['.skillbox/skillbox.yaml', '.skillbox/skillbox.lock'],
      },
    });
  });
});

describe('inspect --json', () => {
  it('includes the install target, permissions, and environment names', async () => {
    await setUp([
      {
        name: 'api-resource',
        kind: 'api',
        target: 'api-dir',
        permissions: ['network:outbound'],
        env: [
          {
            name: 'SKILLBOX_EXAMPLE_TOKEN',
            description: 'Bearer token for the example service.',
            required: true,
            secret: true,
          },
        ],
      },
    ]);

    const result = await cli('inspect', 'skillbox/api-resource', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'inspect',
      data: {
        resource: 'skillbox/api-resource',
        installTarget: 'api-dir',
        permissions: ['network:outbound'],
        environment: [
          {
            name: 'SKILLBOX_EXAMPLE_TOKEN',
            required: true,
            secret: true,
          },
        ],
      },
    });
  });

  it('exposes no field that could carry an environment value', async () => {
    await setUp([
      {
        name: 'api-resource',
        kind: 'api',
        env: [
          {
            name: 'SKILLBOX_EXAMPLE_TOKEN',
            description: 'Bearer token for the example service.',
          },
        ],
      },
    ]);

    const result = await cli('inspect', 'skillbox/api-resource', '--json');
    const data = (result.json() as { data: { environment: Record<string, unknown>[] } })
      .data;

    for (const variable of data.environment) {
      expect(Object.keys(variable).sort()).toEqual([
        'description',
        'name',
        'required',
        'secret',
      ]);
    }
  });

  it('reports optional metadata as null rather than omitting it', async () => {
    await setUp(BASIC);

    expect(
      await cli('inspect', 'skillbox/code-review', '--json').then((r) => r.json()),
    ).toMatchObject({
      data: { license: null, homepage: null, deprecated: null, runtime: null },
    });
  });

  it('includes inputs and outputs', async () => {
    await setUp([
      {
        name: 'documented-resource',
        spec: {
          inputs: [
            { name: 'diff', type: 'string', required: true, description: 'The diff.' },
          ],
          outputs: [
            { name: 'findings', type: 'array', description: 'The findings found.' },
          ],
        },
      },
    ]);

    const result = await cli('inspect', 'skillbox/documented-resource', '--json');

    expect(result.json()).toMatchObject({
      data: {
        inputs: [{ name: 'diff', type: 'string' }],
        outputs: [{ name: 'findings', type: 'array' }],
      },
    });
  });

  it('renders inputs and outputs as text', async () => {
    await setUp([
      {
        name: 'documented-resource',
        spec: {
          inputs: [
            { name: 'diff', type: 'string', required: true, description: 'The diff.' },
          ],
          outputs: [
            { name: 'findings', type: 'array', description: 'The findings found.' },
          ],
        },
      },
    ]);

    const result = await cli('inspect', 'skillbox/documented-resource');

    expect(result.stdout).toContain('Inputs');
    expect(result.stdout).toContain('Outputs');
    expect(result.stdout).toContain('required');
  });

  it('omits the inputs and outputs sections when a resource declares none', async () => {
    // An empty section is noise; dependencies and permissions still show "none"
    // because their absence is itself worth stating before an install.
    await setUp(BASIC);

    const result = await cli('inspect', 'skillbox/code-review');

    expect(result.stdout).not.toContain('Inputs');
    expect(result.stdout).not.toContain('Outputs');
    expect(result.stdout).toContain('Dependencies');
    expect(result.stdout).toContain('none');
  });

  it('renders license and homepage as text when present', async () => {
    await setUp([
      {
        name: 'annotated-resource',
        spec: {},
        rawManifest: [
          'apiVersion: skillbox.dev/v1alpha1',
          'kind: prompt',
          'metadata:',
          '  namespace: skillbox',
          '  name: annotated-resource',
          '  version: 0.1.0',
          '  description: A fixture carrying optional metadata fields.',
          '  license: MIT',
          '  homepage: https://example.com/annotated',
          'spec:',
          '  entrypoint: entry.md',
          '  files:',
          '    - entry.md',
          '',
        ].join('\n'),
        files: ['entry.md'],
        entrypoint: 'entry.md',
      },
    ]);

    const result = await cli('inspect', 'skillbox/annotated-resource');

    expect(result.stdout).toContain('MIT');
    expect(result.stdout).toContain('https://example.com/annotated');
  });

  it('renders runtime as text when present', async () => {
    await setUp([
      {
        name: 'annotated-resource',
        kind: 'script',
        spec: {
          runtime: { type: 'node', version: '>=20.19.0' },
        },
      },
    ]);

    const result = await cli('inspect', 'skillbox/annotated-resource');

    expect(result.stdout).toContain('Runtime');
    expect(result.stdout).toContain('node >=20.19.0');
  });
});

describe('list --json', () => {
  it('reports an empty project', async () => {
    await setUp(BASIC);
    await cli('init');

    expect(await cli('list', '--json').then((r) => r.json())).toMatchObject({
      ok: true,
      command: 'list',
      data: { count: 0, resources: [] },
    });
  });

  it('reports installed resources with their status', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    expect(await cli('list', '--json').then((r) => r.json())).toMatchObject({
      data: {
        count: 1,
        resources: [
          {
            resource: 'skillbox/code-review',
            kind: 'prompt',
            resolved: '0.1.0',
            status: 'ok',
            direct: true,
          },
        ],
      },
    });
  });

  it('filters by kind', async () => {
    await setUp([
      { name: 'a-prompt', kind: 'prompt', target: 'prompt-dir' },
      { name: 'a-script', kind: 'script', target: 'script-dir' },
    ]);
    await cli('init');
    await cli('add', 'skillbox/a-prompt');
    await cli('add', 'skillbox/a-script');

    const result = await cli('list', '--kind', 'script', '--json');

    expect(result.json()).toMatchObject({ data: { count: 1 } });
  });
});

describe('remove --json', () => {
  it('reports what was removed', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    const result = await cli('remove', 'skillbox/code-review', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'remove',
      data: { resource: 'skillbox/code-review', preserved: [] },
    });
  });

  it('reports the plan on a dry run', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    const result = await cli('remove', 'skillbox/code-review', '--dry-run', '--json');

    expect(result.json()).toMatchObject({ data: { dryRun: true } });
  });

  it('shows a modified file as kept in the dry-run text output', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'edited');

    const result = await cli('remove', 'skillbox/code-review', '--dry-run');

    expect(result.stdout).toContain('would be kept');
  });

  it('shows an already-gone file in the dry-run text output', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, '.skillbox', 'prompts', 'code-review', 'entry.md'));

    const result = await cli('remove', 'skillbox/code-review', '--dry-run');

    expect(result.stdout).toContain('already gone');
  });

  it('reports preserved files after a forced removal keeps none', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'edited');

    const result = await cli('remove', 'skillbox/code-review', '--force', '--json');

    expect(result.json()).toMatchObject({ data: { preserved: [] } });
  });
});

describe('update --json', () => {
  it('reports candidates when everything is current', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    const result = await cli('update', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'update',
      data: { updatable: [] },
    });
  });

  it('reports a dry run without applying', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    expect(
      await cli('update', '--dry-run', '--json').then((r) => r.json()),
    ).toMatchObject({
      data: { dryRun: true },
    });
  });

  it('limits to a single resource', async () => {
    await setUp([
      { name: 'first-resource', target: 'first-dir' },
      { name: 'second-resource', target: 'second-dir' },
    ]);
    await cli('init');
    await cli('add', 'skillbox/first-resource');
    await cli('add', 'skillbox/second-resource');

    const result = await cli('update', 'skillbox/first-resource', '--json');
    const data = (result.json() as { data: { candidates: unknown[] } }).data;

    expect(data.candidates).toHaveLength(1);
  });

  it('reports a resource that is not installed', async () => {
    await setUp(BASIC);
    await cli('init');

    expect((await cli('update', 'skillbox/code-review')).code).toBe(
      EXIT_CODES.NOT_FOUND,
    );
  });

  it('applies an in-range update and rewrites the lockfile', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await writeNewerVersion('0.1.9');

    const result = await cli('update', '--json');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.json()).toMatchObject({
      data: { updatable: ['skillbox/code-review'] },
    });
    expect(await cli('list', '--json').then((r) => r.json())).toMatchObject({
      data: { resources: [{ resolved: '0.1.9' }] },
    });
  });

  it('applies an in-range update in text mode', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await writeNewerVersion('0.1.9');

    const result = await cli('update');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Update plan');
    expect(result.stdout).toContain('Updated 1 resource');
  });

  it('shows the plan without applying on a dry run', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await writeNewerVersion('0.1.9');

    const result = await cli('update', '--dry-run');

    expect(result.stdout).toContain('Dry run');
    expect(await cli('list', '--json').then((r) => r.json())).toMatchObject({
      data: { resources: [{ resolved: '0.1.0' }] },
    });
  });

  it('aborts an update that would overwrite a modified file', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await writeNewerVersion('0.1.9');

    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'my edits');

    const result = await cli('update');

    expect(result.code).toBe(EXIT_CODES.CONFLICT);
    expect(result.stdout).toContain('Conflicts');
  });
});

describe('add --json', () => {
  it('reports the plan without installing on a dry run', async () => {
    await setUp(BASIC);
    await cli('init');

    const result = await cli('add', 'skillbox/code-review', '--dry-run', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'add',
      data: {
        dryRun: true,
        plan: { resources: [{ resource: 'skillbox/code-review' }] },
      },
    });

    expect(await cli('list', '--json').then((r) => r.json())).toMatchObject({
      data: { count: 0 },
    });
  });

  it('reports conflicts in the plan payload', async () => {
    await setUp(BASIC);
    await cli('init');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'mine');

    const result = await cli('add', 'skillbox/code-review', '--dry-run', '--json');
    const data = (result.json() as { data: { plan: { conflicts: unknown[] } } }).data;

    expect(data.plan.conflicts.length).toBeGreaterThan(0);
  });

  it('emits a machine-readable conflict error rather than installing', async () => {
    await setUp(BASIC);
    await cli('init');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'mine');

    const result = await cli('add', 'skillbox/code-review', '--json');

    expect(result.code).toBe(EXIT_CODES.CONFLICT);
    expect(result.json()).toMatchObject({
      ok: false,
      error: { code: 'FILE_CONFLICT' },
    });
  });

  it('reports an optional dependency that was not found', async () => {
    await setUp([
      {
        name: 'optional-consumer',
        target: 'consumer-dir',
        dependencies: [
          { resource: 'skillbox/absent-resource', version: '^0.1.0', optional: true },
        ],
      },
    ]);
    await cli('init');

    const result = await cli('add', 'skillbox/optional-consumer', '--json');

    expect(result.json()).toMatchObject({
      data: { plan: { missingOptional: ['skillbox/absent-resource'] } },
    });
  });

  it('mentions an optional dependency in the text plan', async () => {
    await setUp([
      {
        name: 'optional-consumer',
        target: 'consumer-dir',
        dependencies: [
          { resource: 'skillbox/absent-resource', version: '^0.1.0', optional: true },
        ],
      },
    ]);
    await cli('init');

    expect((await cli('add', 'skillbox/optional-consumer')).stdout).toContain(
      'Optional dependencies not found',
    );
  });

  it('flags a deprecated resource in the plan', async () => {
    await setUp([
      {
        name: 'old-resource',
        target: 'old-dir',
        deprecated: { reason: 'Superseded by a newer prompt.' },
      },
    ]);
    await cli('init');

    expect((await cli('add', 'skillbox/old-resource')).stdout).toContain('deprecated');
  });

  it('reports required environment variables in the plan', async () => {
    await setUp([
      {
        name: 'api-resource',
        kind: 'api',
        target: 'api-dir',
        env: [
          {
            name: 'SKILLBOX_EXAMPLE_TOKEN',
            description: 'Bearer token for the example service.',
            required: true,
          },
        ],
      },
    ]);
    await cli('init');

    const result = await cli('add', 'skillbox/api-resource');

    expect(result.stdout).toContain('Environment variables required');
    expect(result.stdout).toContain('SKILLBOX_EXAMPLE_TOKEN');
    expect(result.stdout).toContain('never reads or stores their values');
  });
});

describe('validate --json', () => {
  it('reports errors with their targets', async () => {
    await setUp(BASIC);
    await dir.write(
      'registry/prompts/broken/skillbox.yaml',
      'apiVersion: not-supported',
    );

    const result = await cli('validate', '--json');

    expect(result.code).toBe(EXIT_CODES.VALIDATION);
    expect(result.json()).toMatchObject({ ok: false, data: { errors: 1 } });
  });

  it('marks a warning as not ok under --strict', async () => {
    await setUp([{ name: 'has-undeclared', contents: { 'notes.md': 'undeclared' } }]);

    const result = await cli('validate', '--strict', '--json');

    expect(result.code).toBe(EXIT_CODES.VALIDATION);
    expect(result.json()).toMatchObject({ ok: false, data: { warnings: 1 } });
  });

  it('reports a path outside the working directory in full', async () => {
    await setUp(BASIC);

    const result = await cli('validate', registryRoot);

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
  });
});

describe('doctor --json', () => {
  it('includes every check', async () => {
    await setUp(BASIC);
    await cli('init');

    const result = await cli('doctor', '--json');
    const data = (result.json() as { data: { checks: unknown[] } }).data;

    expect(data.checks).toHaveLength(7);
  });

  it('reports not ok when an error is found', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, '.skillbox', 'prompts', 'code-review', 'entry.md'));

    const result = await cli('doctor', '--json');

    expect(result.code).toBe(EXIT_CODES.GENERAL);
    expect(result.json()).toMatchObject({ ok: false });
  });

  it('stays ok in JSON mode when only warnings are present', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'edited');

    const result = await cli('doctor', '--json');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.json()).toMatchObject({ ok: true, data: { healthy: false } });
  });

  it('fails in JSON mode under --strict with a warning', async () => {
    await setUp(BASIC);
    await cli('init');
    await cli('add', 'skillbox/code-review');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'edited');

    expect((await cli('doctor', '--strict', '--json')).code).toBe(
      EXIT_CODES.VALIDATION,
    );
  });
});

describe('--project', () => {
  it('targets an explicit project root', async () => {
    await setUp(BASIC);
    const other = await dir.mkdir('other-project');

    const result = await cli('--project', other, 'init', '--json');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.json()).toMatchObject({ data: { name: 'other-project' } });
  });

  it('is honored by commands that read the project', async () => {
    await setUp(BASIC);
    const other = await dir.mkdir('other-project');
    await cli('--project', other, 'init');

    const result = await cli('--project', other, 'list', '--json');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.json()).toMatchObject({ data: { count: 0 } });
  });
});

describe('--registry', () => {
  it('overrides the environment variable', async () => {
    await setUp(BASIC);
    const other = await writeRegistry(
      dir,
      [{ name: 'other-resource' }],
      'other-registry',
    );

    const result = await cli('--registry', other, 'search', '--json');

    expect(JSON.stringify(result.json())).toContain('other-resource');
    expect(JSON.stringify(result.json())).not.toContain('code-review');
  });

  it('reports a registry path that does not exist', async () => {
    await setUp(BASIC);

    const result = await cli('--registry', dir.resolve('no-such-place'), 'search');

    expect(result.code).toBe(EXIT_CODES.GENERAL);
    expect(result.stderr).toContain('--registry');
  });
});
