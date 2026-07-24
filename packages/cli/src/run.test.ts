import path from 'node:path';

import {
  createTempDir,
  writeRegistry,
  type ResourceSpec,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXIT_CODES } from './exit-codes.js';
import { run } from './run.js';
import { CLI_VERSION } from './version.js';

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

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  json(): unknown;
}

/** Run the CLI in-process with captured output. */
async function cli(...args: string[]): Promise<CliResult> {
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

  return {
    code,
    stdout,
    stderr,
    json(): unknown {
      return JSON.parse(stdout);
    },
  };
}

async function setUpRegistry(resources: readonly ResourceSpec[]): Promise<void> {
  registryRoot = await writeRegistry(dir, resources);
}

const SAMPLE: readonly ResourceSpec[] = [
  {
    name: 'code-review',
    kind: 'prompt',
    description: 'Reviews a code change and produces actionable findings.',
    tags: ['development', 'code-review'],
    target: '.skillbox/prompts/code-review',
    permissions: ['model:invoke'],
  },
  {
    name: 'structured-logger',
    kind: 'component',
    description: 'A dependency-free structured JSON logger for Node services.',
    tags: ['logging'],
    target: 'src/components/structured-logger',
    spec: { language: 'typescript' },
  },
];

describe('global behavior', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
  });

  it('reports its version', async () => {
    const result = await cli('--version');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout.trim()).toBe(CLI_VERSION);
  });

  it('shows help', async () => {
    const result = await cli('--help');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Usage: skillbox');
  });

  it('lists every documented command in help', async () => {
    const result = await cli('--help');

    for (const command of [
      'init',
      'search',
      'list',
      'inspect',
      'add',
      'remove',
      'validate',
      'update',
      'doctor',
    ]) {
      expect(result.stdout).toContain(command);
    }
  });

  it('exits with the usage code for an unknown command', async () => {
    const result = await cli('not-a-command');

    expect(result.code).toBe(EXIT_CODES.USAGE);
    expect(result.stderr).toContain('unknown command');
  });

  it('exits with the usage code for an unknown option', async () => {
    const result = await cli('list', '--not-an-option');

    expect(result.code).toBe(EXIT_CODES.USAGE);
  });

  it('exits with the usage code for a missing required argument', async () => {
    const result = await cli('inspect');

    expect(result.code).toBe(EXIT_CODES.USAGE);
  });

  it('writes diagnostics to stderr so stdout stays pipeable', async () => {
    const result = await cli('inspect', 'skillbox/nonexistent-thing');

    expect(result.code).toBe(EXIT_CODES.NOT_FOUND);
    expect(result.stderr).not.toBe('');
    expect(result.stdout).toBe('');
  });
});

describe('init', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
  });

  it('creates the project configuration and explains what it made', async () => {
    const result = await cli('init');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Initialized Skillbox project');
    expect(result.stdout).toContain('.skillbox/skillbox.yaml');
    expect(result.stdout).toContain('.skillbox/skillbox.lock');
  });

  it('refuses to overwrite an existing project', async () => {
    await cli('init');
    const result = await cli('init');

    expect(result.code).toBe(EXIT_CODES.CONFLICT);
    expect(result.stderr).toContain('already exists');
  });

  it('mentions --force when it refuses', async () => {
    await cli('init');

    expect((await cli('init')).stderr).toContain('--force');
  });

  it('overwrites when forced', async () => {
    await cli('init');

    expect((await cli('init', '--force')).code).toBe(EXIT_CODES.SUCCESS);
  });

  it('accepts an explicit name', async () => {
    const result = await cli('init', '--name', 'custom-name', '--json');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.json()).toMatchObject({ ok: true, data: { name: 'custom-name' } });
  });
});

describe('search', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
  });

  it('finds a resource by name', async () => {
    const result = await cli('search', 'logger');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('skillbox/structured-logger');
    expect(result.stdout).not.toContain('skillbox/code-review');
  });

  it('lists everything with no query', async () => {
    const result = await cli('search');

    expect(result.stdout).toContain('skillbox/code-review');
    expect(result.stdout).toContain('skillbox/structured-logger');
  });

  it('succeeds when nothing matches', async () => {
    // Finding nothing is a valid outcome, not a failure.
    const result = await cli('search', 'kubernetes');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('No resources matched');
  });

  it('filters by kind', async () => {
    const result = await cli('search', '--kind', 'component');

    expect(result.stdout).toContain('structured-logger');
    expect(result.stdout).not.toContain('code-review');
  });

  it('rejects an unknown kind with the valid kinds listed', async () => {
    const result = await cli('search', '--kind', 'plugin');

    expect(result.code).toBe(EXIT_CODES.USAGE);
    expect(result.stderr).toContain('prompt');
  });

  it('filters by tag', async () => {
    const result = await cli('search', '--tag', 'logging');

    expect(result.stdout).toContain('structured-logger');
    expect(result.stdout).not.toContain('code-review');
  });

  it('respects a limit', async () => {
    const result = await cli('search', '--limit', '1', '--json');

    expect(result.json()).toMatchObject({ data: { count: 1 } });
  });

  it('rejects a non-numeric limit', async () => {
    expect((await cli('search', '--limit', 'many')).code).toBe(EXIT_CODES.USAGE);
  });

  it('does not require an initialized project', async () => {
    expect((await cli('search', 'logger')).code).toBe(EXIT_CODES.SUCCESS);
  });

  it('emits structured JSON', async () => {
    const result = await cli('search', 'logger', '--json');

    expect(result.json()).toMatchObject({
      ok: true,
      command: 'search',
      data: { count: 1 },
    });
  });

  it('reports which fields matched', async () => {
    const result = await cli('search', 'code-review', '--json');
    const data = (result.json() as { data: { results: { matchedFields: string[] }[] } })
      .data;

    expect(data.results[0]?.matchedFields).toContain('name');
  });

  it('matches a namespace', async () => {
    const result = await cli('search', 'skillbox', '--json');

    expect(result.json()).toMatchObject({ data: { count: 2 } });
  });

  it('matches a kind name', async () => {
    const result = await cli('search', 'prompt', '--json');
    const data = (result.json() as { data: { results: { kind: string }[] } }).data;

    expect(data.results.some((entry) => entry.kind === 'prompt')).toBe(true);
  });

  it('reports an empty catalog distinctly from no matches', async () => {
    registryRoot = await dir.mkdir('empty-registry');

    expect((await cli('search')).stdout).toContain('The catalog is empty');
  });

  it('shows tags for a resource that declares them', async () => {
    expect((await cli('search', 'code-review')).stdout).toContain('tags:');
  });
});

describe('inspect', () => {
  it('shows the manifest, install target, and permissions', async () => {
    await setUpRegistry(SAMPLE);

    const result = await cli('inspect', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('skillbox/code-review@0.1.0');
    expect(result.stdout).toContain('.skillbox/prompts/code-review');
    expect(result.stdout).toContain('model:invoke');
  });

  it('states that permissions are not enforced', async () => {
    // A permission list that looks like a sandbox but is not one would be worse
    // than no list at all.
    await setUpRegistry(SAMPLE);

    expect((await cli('inspect', 'skillbox/code-review')).stdout).toContain(
      'does not enforce',
    );
  });

  it('shows environment variables by name with no value', async () => {
    await setUpRegistry([
      {
        name: 'api-resource',
        kind: 'api',
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

    const result = await cli('inspect', 'skillbox/api-resource');

    expect(result.stdout).toContain('SKILLBOX_EXAMPLE_TOKEN');
    expect(result.stdout).toContain('never reads or stores their values');
  });

  it('does not leak an environment value that is set in the process', async () => {
    const sentinel = 'SENTINEL_CLI_SECRET_4a91';
    await setUpRegistry([
      {
        name: 'api-resource',
        kind: 'api',
        env: [
          {
            name: 'SKILLBOX_EXAMPLE_TOKEN',
            description: 'Bearer token for the example service.',
            required: true,
          },
        ],
      },
    ]);

    let stdout = '';
    await run(['node', 'skillbox', 'inspect', 'skillbox/api-resource'], {
      cwd: projectRoot,
      env: { SKILLBOX_REGISTRY: registryRoot, SKILLBOX_EXAMPLE_TOKEN: sentinel },
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => undefined,
      isTty: false,
    });

    expect(stdout).not.toContain(sentinel);
  });

  it('reports a deprecation notice', async () => {
    await setUpRegistry([
      {
        name: 'old-resource',
        deprecated: {
          reason: 'Superseded by a newer prompt.',
          replacement: 'skillbox/new-resource',
        },
      },
      { name: 'new-resource' },
    ]);

    const result = await cli('inspect', 'skillbox/old-resource');

    expect(result.stdout).toContain('deprecated');
    expect(result.stdout).toContain('skillbox/new-resource');
  });

  it('exits with the not-found code for an unknown resource', async () => {
    await setUpRegistry(SAMPLE);

    expect((await cli('inspect', 'skillbox/nonexistent-thing')).code).toBe(
      EXIT_CODES.NOT_FOUND,
    );
  });

  it('exits with the validation code for a malformed reference', async () => {
    await setUpRegistry(SAMPLE);

    expect((await cli('inspect', 'not-a-reference')).code).toBe(EXIT_CODES.VALIDATION);
  });
});

describe('add', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
    await cli('init');
  });

  it('shows the plan and installs', async () => {
    const result = await cli('add', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Install plan');
    expect(result.stdout).toContain('Installed 1 resource');
  });

  it('shows requested permissions before installing', async () => {
    expect((await cli('add', 'skillbox/code-review')).stdout).toContain(
      'Permissions requested',
    );
  });

  it('changes nothing on a dry run', async () => {
    const result = await cli('add', 'skillbox/code-review', '--dry-run');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Dry run');
    expect((await cli('list')).stdout).toContain('No resources are installed');
  });

  it('installs dependencies in order', async () => {
    await setUpRegistry([
      {
        name: 'consumer-resource',
        target: 'consumer-dir',
        dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
      },
      { name: 'provider-resource', target: 'provider-dir' },
    ]);
    await cli('init', '--force');

    const result = await cli('add', 'skillbox/consumer-resource', '--json');

    expect(result.json()).toMatchObject({
      data: {
        installed: [
          { qualifiedName: 'skillbox/provider-resource' },
          { qualifiedName: 'skillbox/consumer-resource' },
        ],
      },
    });
  });

  it('aborts on a conflict without writing anything', async () => {
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'my own work');

    const result = await cli('add', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.CONFLICT);
    expect(result.stderr).toContain('conflict');
    expect((await cli('list')).stdout).toContain('No resources are installed');
  });

  it('mentions --force when a conflict blocks installation', async () => {
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'mine');

    expect((await cli('add', 'skillbox/code-review')).stderr).toContain('--force');
  });

  it('overwrites a conflict when forced', async () => {
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'mine');

    expect((await cli('add', 'skillbox/code-review', '--force')).code).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it('honors a target override', async () => {
    const result = await cli(
      'add',
      'skillbox/code-review',
      '--target',
      'custom/place',
      '--json',
    );

    expect(JSON.stringify(result.json())).toContain('custom/place');
  });

  it('reports a missing dependency with the dependency exit code', async () => {
    await setUpRegistry([
      {
        name: 'needs-absent',
        dependencies: [{ resource: 'skillbox/absent-resource', version: '^0.1.0' }],
      },
    ]);
    await cli('init', '--force');

    expect((await cli('add', 'skillbox/needs-absent')).code).toBe(
      EXIT_CODES.DEPENDENCY,
    );
  });

  it('reports a circular dependency with the dependency exit code', async () => {
    await setUpRegistry([
      {
        name: 'cycle-a',
        dependencies: [{ resource: 'skillbox/cycle-b', version: '^0.1.0' }],
      },
      {
        name: 'cycle-b',
        dependencies: [{ resource: 'skillbox/cycle-a', version: '^0.1.0' }],
      },
    ]);
    await cli('init', '--force');

    const result = await cli('add', 'skillbox/cycle-a');

    expect(result.code).toBe(EXIT_CODES.DEPENDENCY);
    expect(result.stderr).toContain('Circular dependency');
  });

  it('reports being uninitialized when there is no project', async () => {
    const scratch = await dir.mkdir('uninitialized');
    let stderr = '';

    const code = await run(['node', 'skillbox', 'add', 'skillbox/code-review'], {
      cwd: scratch,
      env: { SKILLBOX_REGISTRY: registryRoot },
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      isTty: false,
    });

    expect(code).toBe(EXIT_CODES.NOT_INITIALIZED);
    expect(stderr).toContain('skillbox init');
  });

  it('is idempotent when the resource is already at the resolved version', async () => {
    await cli('add', 'skillbox/code-review');

    const result = await cli('add', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Nothing to do');
  });
});

describe('list', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
    await cli('init');
  });

  it('reports an empty project', async () => {
    expect((await cli('list')).stdout).toContain('No resources are installed');
  });

  it('shows requested and resolved versions', async () => {
    await cli('add', 'skillbox/code-review');

    const result = await cli('list');

    expect(result.stdout).toContain('skillbox/code-review');
    expect(result.stdout).toContain('requested ^0.1.0');
    expect(result.stdout).toContain('resolved 0.1.0');
    expect(result.stdout).toContain('ok');
  });

  it('flags a resource whose file was modified', async () => {
    await cli('add', 'skillbox/code-review');
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'edited');

    const result = await cli('list');

    expect(result.stdout).toContain('modified');
    expect(result.stdout).toContain('skillbox doctor');
  });

  it('flags a resource whose file is gone', async () => {
    await cli('add', 'skillbox/code-review');

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, '.skillbox', 'prompts', 'code-review', 'entry.md'));

    expect((await cli('list')).stdout).toContain('missing');
  });

  it('marks a dependency as such rather than inventing a requested range', async () => {
    await setUpRegistry([
      {
        name: 'consumer-resource',
        target: 'consumer-dir',
        dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
      },
      { name: 'provider-resource', target: 'provider-dir' },
    ]);
    await cli('init', '--force');
    await cli('add', 'skillbox/consumer-resource');

    expect((await cli('list')).stdout).toContain('(dependency)');
  });
});

describe('validate', () => {
  it('reports a clean catalog', async () => {
    await setUpRegistry(SAMPLE);

    const result = await cli('validate');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('validated with no findings');
  });

  it('exits with the validation code when a manifest is invalid', async () => {
    await setUpRegistry(SAMPLE);
    await dir.write('registry/prompts/broken/skillbox.yaml', 'apiVersion: nope');

    const result = await cli('validate');

    expect(result.code).toBe(EXIT_CODES.VALIDATION);
    expect(result.stderr === '' ? result.stdout : result.stderr).toContain('error');
  });

  it('reports the field path and a hint', async () => {
    await setUpRegistry(SAMPLE);
    await dir.write(
      'registry/prompts/broken/skillbox.yaml',
      'apiVersion: skillbox.dev/v1alpha1\nkind: prompt\nmetadata: {}\n',
    );

    const result = await cli('validate');

    expect(result.stdout).toContain('metadata');
  });

  it('validates a single resource directory', async () => {
    await setUpRegistry(SAMPLE);

    const result = await cli(
      'validate',
      path.join(registryRoot, 'prompts', 'code-review'),
    );

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('1 resource validated');
  });

  it('passes with a warning by default', async () => {
    await setUpRegistry([
      { name: 'has-undeclared', contents: { 'notes.md': 'undeclared file' } },
    ]);

    const result = await cli('validate');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('warning');
  });

  it('fails on a warning with --strict', async () => {
    await setUpRegistry([
      { name: 'has-undeclared', contents: { 'notes.md': 'undeclared file' } },
    ]);

    expect((await cli('validate', '--strict')).code).toBe(EXIT_CODES.VALIDATION);
  });

  it('emits structured JSON', async () => {
    await setUpRegistry(SAMPLE);

    const result = await cli('validate', '--json');

    expect(result.json()).toMatchObject({ ok: true, command: 'validate' });
  });
});

describe('remove', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
    await cli('init');
    await cli('add', 'skillbox/code-review');
  });

  it('removes the resource and its files', async () => {
    const result = await cli('remove', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('Removed skillbox/code-review');
    expect((await cli('list')).stdout).toContain('No resources are installed');
  });

  it('refuses to delete a modified file', async () => {
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'my edits');

    const result = await cli('remove', 'skillbox/code-review');

    expect(result.code).toBe(EXIT_CODES.CONFLICT);
    expect(result.stderr).toContain('local modifications');
  });

  it('deletes a modified file when forced', async () => {
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'my edits');

    expect((await cli('remove', 'skillbox/code-review', '--force')).code).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it('changes nothing on a dry run', async () => {
    const result = await cli('remove', 'skillbox/code-review', '--dry-run');

    expect(result.stdout).toContain('Dry run');
    expect((await cli('list')).stdout).toContain('skillbox/code-review');
  });

  it('exits with the not-found code for a resource that is not installed', async () => {
    expect((await cli('remove', 'skillbox/structured-logger')).code).toBe(
      EXIT_CODES.NOT_FOUND,
    );
  });
});

describe('doctor', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
    await cli('init');
  });

  it('reports a healthy project', async () => {
    await cli('add', 'skillbox/code-review');

    const result = await cli('doctor');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('No problems found');
  });

  it('warns about a modified file without failing', async () => {
    await cli('add', 'skillbox/code-review');
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'edited');

    const result = await cli('doctor');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('local modifications');
  });

  it('fails on a warning with --strict', async () => {
    await cli('add', 'skillbox/code-review');
    await dir.write('my-project/.skillbox/prompts/code-review/entry.md', 'edited');

    expect((await cli('doctor', '--strict')).code).toBe(EXIT_CODES.VALIDATION);
  });

  it('fails when a file is missing', async () => {
    await cli('add', 'skillbox/code-review');

    const { rm } = await import('node:fs/promises');
    await rm(path.join(projectRoot, '.skillbox', 'prompts', 'code-review', 'entry.md'));

    expect((await cli('doctor')).code).toBe(EXIT_CODES.GENERAL);
  });

  it('emits structured JSON', async () => {
    const result = await cli('doctor', '--json');

    expect(result.json()).toMatchObject({ ok: true, command: 'doctor' });
  });
});

describe('update', () => {
  beforeEach(async () => {
    await setUpRegistry(SAMPLE);
    await cli('init');
  });

  it('reports nothing to do when up to date', async () => {
    await cli('add', 'skillbox/code-review');

    const result = await cli('update');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('up to date');
  });

  it('reports an empty project', async () => {
    expect((await cli('update')).stdout).toContain('No resources are installed');
  });

  it('installs a newer compatible version', async () => {
    await cli('add', 'skillbox/code-review');

    await dir.write(
      'registry/prompts/code-review-0.1.9/skillbox.yaml',
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: code-review',
        '  version: 0.1.9',
        '  description: A newer version of the code review prompt fixture.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '  install:',
        '    target: .skillbox/prompts/code-review',
        '',
      ].join('\n'),
    );
    await dir.write('registry/prompts/code-review-0.1.9/entry.md', 'newer body\n');

    const result = await cli('update');

    expect(result.code).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain('0.1.9');
    expect((await cli('list')).stdout).toContain('resolved 0.1.9');
  });

  it('reports a newer version blocked by the requested range', async () => {
    // Crossing a major boundary is deliberate, not something update does silently.
    await cli('add', 'skillbox/code-review');

    await dir.write(
      'registry/prompts/code-review-2.0.0/skillbox.yaml',
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: code-review',
        '  version: 2.0.0',
        '  description: A major new version of the code review prompt fixture.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '',
      ].join('\n'),
    );
    await dir.write('registry/prompts/code-review-2.0.0/entry.md', 'v2 body\n');

    const result = await cli('update');

    expect(result.stdout).toContain('outside the requested range');
    expect(result.stdout).toContain('2.0.0');
  });

  it('changes nothing on a dry run', async () => {
    await cli('add', 'skillbox/code-review');

    expect((await cli('update', '--dry-run')).code).toBe(EXIT_CODES.SUCCESS);
  });
});
