import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * End-to-end tests against the built binary.
 *
 * These deliberately bypass the source aliases used by unit tests and run
 * `bin/skillbox.js` in a real subprocess, so they verify what a user actually
 * gets: the compiled output, the shebang launcher, and the real process exit
 * code (SBX-063).
 *
 * Requires `pnpm build` to have run. The first test asserts that clearly rather
 * than failing with a confusing module-resolution error.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const binary = path.resolve(here, '..', 'bin', 'skillbox.js');

let dir: TempDir;
let projectRoot: string;
let registryRoot: string;

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('project');

  registryRoot = await writeRegistry(dir, [
    {
      name: 'code-review',
      kind: 'prompt',
      description: 'Reviews a code change and produces actionable findings.',
      tags: ['development', 'code-review'],
      target: '.skillbox/prompts/code-review',
      permissions: ['model:invoke'],
    },
    {
      name: 'implementation-planner',
      kind: 'agent',
      description: 'Turns a requirement into an ordered implementation plan.',
      target: '.skillbox/agents/implementation-planner',
      dependencies: [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      spec: { role: 'Plans implementation work as ordered, verifiable steps.' },
    },
  ]);
});

afterEach(async () => {
  await dir.cleanup();
});

interface SpawnResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the built binary in a subprocess. */
async function skillbox(...args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SKILLBOX_REGISTRY: registryRoot,
        NO_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

describe('the built binary', () => {
  it('exists, so the build ran', async () => {
    // Asserting this first turns "cannot find module ../dist/run.js" into a clear
    // message about the missing build step.
    await expect(stat(binary)).resolves.toBeTruthy();
    await expect(
      stat(path.resolve(here, '..', 'dist', 'run.js')),
    ).resolves.toBeTruthy();
  });

  it('reports its version and exits 0', async () => {
    const result = await skillbox('--version');

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exits non-zero for an unknown command', async () => {
    const result = await skillbox('not-a-real-command');

    expect(result.code).toBe(7);
    expect(result.stderr).not.toBe('');
  });
});

describe('the full lifecycle', () => {
  it('walks init, search, inspect, add, list, validate, doctor, remove', async () => {
    // This is the acceptance path from the requirements, run end to end against
    // the real binary rather than in-process.

    const init = await skillbox('init');
    expect(init.code, init.stderr).toBe(0);
    expect(init.stdout).toContain('Initialized Skillbox project');

    const search = await skillbox('search', 'review');
    expect(search.code, search.stderr).toBe(0);
    expect(search.stdout).toContain('skillbox/code-review');

    const inspect = await skillbox('inspect', 'skillbox/code-review');
    expect(inspect.code, inspect.stderr).toBe(0);
    expect(inspect.stdout).toContain('.skillbox/prompts/code-review');
    expect(inspect.stdout).toContain('model:invoke');

    const dryRun = await skillbox('add', 'skillbox/code-review', '--dry-run');
    expect(dryRun.code, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('Dry run');

    const add = await skillbox('add', 'skillbox/code-review');
    expect(add.code, add.stderr).toBe(0);
    expect(add.stdout).toContain('Installed 1 resource');

    // Files landed where inspect said they would.
    const installed = path.join(
      projectRoot,
      '.skillbox',
      'prompts',
      'code-review',
      'entry.md',
    );
    await expect(stat(installed)).resolves.toBeTruthy();

    const list = await skillbox('list');
    expect(list.code, list.stderr).toBe(0);
    expect(list.stdout).toContain('skillbox/code-review');
    expect(list.stdout).toContain('resolved 0.1.0');

    // The project manifest records intent.
    const manifest = await readFile(
      path.join(projectRoot, '.skillbox', 'skillbox.yaml'),
      'utf8',
    );
    expect(manifest).toContain('skillbox/code-review');

    // The lockfile records fact, including an integrity digest.
    const lockfile = await readFile(
      path.join(projectRoot, '.skillbox', 'skillbox.lock'),
      'utf8',
    );
    expect(lockfile).toContain('version: 0.1.0');
    expect(lockfile).toContain('sha256-');

    const validate = await skillbox('validate');
    expect(validate.code, validate.stderr).toBe(0);

    const doctor = await skillbox('doctor');
    expect(doctor.code, doctor.stderr).toBe(0);
    expect(doctor.stdout).toContain('No problems found');

    const remove = await skillbox('remove', 'skillbox/code-review');
    expect(remove.code, remove.stderr).toBe(0);
    await expect(stat(installed)).rejects.toThrow();

    const listAfter = await skillbox('list');
    expect(listAfter.stdout).toContain('No resources are installed');
  });

  it('installs a dependency alongside the resource that needs it', async () => {
    await skillbox('init');

    const add = await skillbox('add', 'skillbox/implementation-planner');
    expect(add.code, add.stderr).toBe(0);

    const list = await skillbox('list');
    expect(list.stdout).toContain('skillbox/implementation-planner');
    expect(list.stdout).toContain('skillbox/code-review');
    expect(list.stdout).toContain('(dependency)');
  });

  it('refuses to remove a resource a dependent still needs', async () => {
    await skillbox('init');
    await skillbox('add', 'skillbox/implementation-planner');

    const remove = await skillbox('remove', 'skillbox/code-review');

    expect(remove.code).toBe(6);
    expect(remove.stderr).toContain('skillbox/implementation-planner');
  });

  it('produces a byte-identical lockfile when reinstalling', async () => {
    await skillbox('init');
    await skillbox('add', 'skillbox/code-review');

    const lockfilePath = path.join(projectRoot, '.skillbox', 'skillbox.lock');
    const first = await readFile(lockfilePath, 'utf8');

    await skillbox('add', 'skillbox/code-review');

    expect(await readFile(lockfilePath, 'utf8')).toBe(first);
  });

  it('records no timestamp in the lockfile', async () => {
    await skillbox('init');
    await skillbox('add', 'skillbox/code-review');

    const lockfile = await readFile(
      path.join(projectRoot, '.skillbox', 'skillbox.lock'),
      'utf8',
    );

    expect(lockfile).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('exit codes', () => {
  it('exits 5 when no project is initialized', async () => {
    const result = await skillbox('list');

    expect(result.code).toBe(5);
    expect(result.stderr).toContain('skillbox init');
  });

  it('exits 3 for a resource that does not exist', async () => {
    await skillbox('init');

    expect((await skillbox('inspect', 'skillbox/nonexistent-thing')).code).toBe(3);
  });

  it('exits 4 when a destination file conflicts', async () => {
    await skillbox('init');
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'my own work');

    const result = await skillbox('add', 'skillbox/code-review');

    expect(result.code).toBe(4);
    expect(result.stderr).toContain('--force');
  });

  it('exits 4 when init would overwrite an existing project', async () => {
    await skillbox('init');

    expect((await skillbox('init')).code).toBe(4);
  });

  it('exits 2 when a manifest is invalid', async () => {
    await dir.write(
      'registry/prompts/broken/skillbox.yaml',
      'apiVersion: not-supported',
    );

    expect((await skillbox('validate')).code).toBe(2);
  });
});

describe('JSON output', () => {
  it('emits a single parseable document on stdout', async () => {
    const result = await skillbox('search', 'review', '--json');

    expect(result.code).toBe(0);
    expect(() => {
      JSON.parse(result.stdout);
    }).not.toThrow();
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: 'search' });
  });

  it('emits a machine-readable error with a stable code', async () => {
    await skillbox('init');

    const result = await skillbox('inspect', 'skillbox/nonexistent-thing', '--json');

    expect(result.code).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: 'inspect',
      error: { code: 'RESOURCE_NOT_FOUND' },
    });
  });

  it('suppresses human-readable output so stdout stays pipeable', async () => {
    await skillbox('init');
    const result = await skillbox('add', 'skillbox/code-review', '--json');

    expect(result.stdout).not.toContain('Install plan');
    expect(() => {
      JSON.parse(result.stdout);
    }).not.toThrow();
  });
});

describe('security guarantees', () => {
  it('does not execute a script resource during installation', async () => {
    // Installing and running are separate actions (SR-5). If installation
    // executed the entrypoint, the sentinel file would exist.
    const sentinel = path.join(projectRoot, 'EXECUTED-DURING-INSTALL');

    registryRoot = await writeRegistry(
      dir,
      [
        {
          name: 'sentinel-script',
          kind: 'script',
          entrypoint: 'run.mjs',
          files: ['run.mjs'],
          target: 'scripts',
          contents: {
            'run.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(sentinel)}, 'x');\n`,
          },
        },
      ],
      'registry-script',
    );

    await skillbox('init');
    const add = await skillbox('add', 'skillbox/sentinel-script');

    expect(add.code, add.stderr).toBe(0);
    await expect(
      stat(path.join(projectRoot, 'scripts', 'run.mjs')),
    ).resolves.toBeTruthy();
    await expect(stat(sentinel)).rejects.toThrow();
  });

  it('rejects a resource whose install target escapes the project', async () => {
    registryRoot = await writeRegistry(
      dir,
      [{ name: 'escaping-resource', target: '../../escaped' }],
      'registry-escape',
    );

    await skillbox('init');
    const result = await skillbox('add', 'skillbox/escaping-resource');

    // Rejected at the schema layer, so the manifest never loads.
    expect(result.code).not.toBe(0);
    await expect(stat(dir.resolve('escaped'))).rejects.toThrow();
  });

  it('does not print an environment variable value', async () => {
    const sentinel = 'SENTINEL_INTEGRATION_SECRET_7b2c';

    registryRoot = await writeRegistry(
      dir,
      [
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
      ],
      'registry-env',
    );

    const result = await new Promise<SpawnResult>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [binary, 'inspect', 'skillbox/api-resource'],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            SKILLBOX_REGISTRY: registryRoot,
            SKILLBOX_EXAMPLE_TOKEN: sentinel,
            NO_COLOR: '1',
          },
        },
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });

    expect(result.stdout).toContain('SKILLBOX_EXAMPLE_TOKEN');
    expect(result.stdout).not.toContain(sentinel);
    expect(result.stderr).not.toContain(sentinel);
  });
});
