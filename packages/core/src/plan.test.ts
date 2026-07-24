import { readdir } from 'node:fs/promises';

import { emptyLockfile, type Lockfile } from '@skillbox/schema';
import {
  createTempDir,
  writeRegistry,
  type ResourceSpec,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog, type Catalog } from './catalog.js';
import { digestOf } from './integrity.js';
import {
  assertNoConflicts,
  describeConflict,
  planInstall,
  plannedPaths,
  type InstallPlan,
} from './plan.js';

let dir: TempDir;
let projectRoot: string;

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('project');
});

afterEach(async () => {
  await dir.cleanup();
});

async function catalogOf(resources: readonly ResourceSpec[]): Promise<Catalog> {
  return loadCatalog(await writeRegistry(dir, resources));
}

async function plan(
  resources: readonly ResourceSpec[],
  requested: readonly { reference: string; range?: string; target?: string }[],
  lockfile: Lockfile = emptyLockfile(),
): Promise<InstallPlan> {
  return planInstall({
    projectRoot,
    catalog: await catalogOf(resources),
    lockfile,
    requested,
  });
}

describe('planInstall', () => {
  it('plans a single resource with its declared files', async () => {
    const result = await plan(
      [{ name: 'code-review', files: ['entry.md', 'README.md'] }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.identifier).toBe('skillbox/code-review@0.1.0');
    expect(result.resources[0]?.files.map((f) => f.source).sort()).toEqual([
      'README.md',
      'entry.md',
    ]);
  });

  it('writes nothing to the filesystem', async () => {
    // The whole point of the plan/apply split: planning is pure (FR-6.2).
    const before = await readdir(projectRoot);

    await plan([{ name: 'code-review' }], [{ reference: 'skillbox/code-review' }]);

    expect(await readdir(projectRoot)).toEqual(before);
    expect(before).toEqual([]);
  });

  it('places files under the resource install target', async () => {
    const result = await plan(
      [{ name: 'code-review', target: '.skillbox/prompts/code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(plannedPaths(result)).toEqual([
      '.skillbox/prompts/code-review/README.md',
      '.skillbox/prompts/code-review/entry.md',
    ]);
  });

  it('honors a per-request target override', async () => {
    const result = await plan(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review', target: 'custom/location' }],
    );

    expect(plannedPaths(result)).toEqual([
      'custom/location/README.md',
      'custom/location/entry.md',
    ]);
  });

  it('flattens files when the strategy is flat', async () => {
    const result = await plan(
      [
        {
          name: 'nested-resource',
          entrypoint: 'src/deep/entry.md',
          files: ['src/deep/entry.md', 'README.md'],
          target: 'flat-target',
          spec: { install: { target: 'flat-target', strategy: 'flat' } },
        },
      ],
      [{ reference: 'skillbox/nested-resource' }],
    );

    expect(plannedPaths(result)).toEqual([
      'flat-target/README.md',
      'flat-target/entry.md',
    ]);
  });

  it('preserves directory structure with the default strategy', async () => {
    const result = await plan(
      [
        {
          name: 'nested-resource',
          entrypoint: 'src/deep/entry.md',
          files: ['src/deep/entry.md', 'README.md'],
          target: 'nested-target',
        },
      ],
      [{ reference: 'skillbox/nested-resource' }],
    );

    expect(plannedPaths(result)).toEqual([
      'nested-target/README.md',
      'nested-target/src/deep/entry.md',
    ]);
  });

  it('plans dependencies in order ahead of their consumers', async () => {
    const result = await plan(
      [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ],
      [{ reference: 'skillbox/consumer-resource' }],
    );

    expect(result.resources.map((r) => r.qualifiedName)).toEqual([
      'skillbox/provider-resource',
      'skillbox/consumer-resource',
    ]);
    expect(result.resources[0]?.direct).toBe(false);
    expect(result.resources[1]?.direct).toBe(true);
  });

  it('collects the union of declared permissions, sorted', async () => {
    const result = await plan(
      [
        {
          name: 'first-resource',
          permissions: ['model:invoke', 'filesystem:read'],
          dependencies: [{ resource: 'skillbox/second-resource', version: '^0.1.0' }],
        },
        {
          name: 'second-resource',
          permissions: ['network:outbound', 'filesystem:read'],
        },
      ],
      [{ reference: 'skillbox/first-resource' }],
    );

    expect(result.permissions).toEqual([
      'filesystem:read',
      'model:invoke',
      'network:outbound',
    ]);
  });

  it('collects required environment variables by name only', async () => {
    const result = await plan(
      [
        {
          name: 'api-resource',
          kind: 'api',
          env: [
            {
              name: 'SKILLBOX_EXAMPLE_TOKEN',
              description: 'A token.',
              required: true,
              secret: true,
            },
          ],
        },
      ],
      [{ reference: 'skillbox/api-resource' }],
    );

    expect(result.env.map((e) => e.name)).toEqual(['SKILLBOX_EXAMPLE_TOKEN']);
    // There is no field for a value, so a plan cannot carry one (SR-7).
    expect(JSON.stringify(result.env)).not.toContain('value');
  });

  it('reports a deprecated resource', async () => {
    const result = await plan(
      [
        {
          name: 'old-resource',
          deprecated: { reason: 'Superseded by a newer prompt.' },
        },
      ],
      [{ reference: 'skillbox/old-resource' }],
    );

    expect(result.resources[0]?.deprecated).toBe(true);
  });

  it('reports missing optional dependencies without failing', async () => {
    const result = await plan(
      [
        {
          name: 'optional-consumer',
          dependencies: [
            { resource: 'skillbox/absent-resource', version: '^0.1.0', optional: true },
          ],
        },
      ],
      [{ reference: 'skillbox/optional-consumer' }],
    );

    expect(result.missingOptional).toEqual(['skillbox/absent-resource']);
  });

  it('marks the plan empty when everything is already installed at that version', async () => {
    const digest = digestOf('x');
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      resources: {
        'skillbox/code-review': {
          version: '0.1.0',
          kind: 'prompt',
          source: { type: 'local', path: 'prompts/code-review' },
          integrity: digest,
          target: '.skillbox/prompts/code-review',
          files: {},
          requestedBy: 'direct',
        },
      },
    };

    const result = await plan(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review' }],
      lockfile,
    );

    expect(result.empty).toBe(true);
    expect(result.resources[0]?.alreadyInstalled).toBe(true);
  });
});

describe('conflict classification', () => {
  it('classifies an existing file Skillbox did not install as untracked', async () => {
    await dir.write('project/.skillbox/prompts/code-review/entry.md', 'my own work');

    const result = await plan(
      [{ name: 'code-review', target: '.skillbox/prompts/code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe('untracked');
    expect(result.conflicts[0]?.path).toBe('.skillbox/prompts/code-review/entry.md');
  });

  it('classifies a file owned by another resource', async () => {
    const target = '.skillbox/prompts/code-review';
    await dir.write(`project/${target}/entry.md`, 'installed by someone else');

    const lockfile: Lockfile = {
      lockfileVersion: 1,
      resources: {
        'skillbox/other-owner': {
          version: '0.1.0',
          kind: 'prompt',
          source: { type: 'local', path: 'prompts/other-owner' },
          integrity: digestOf('x'),
          target,
          files: { [`${target}/entry.md`]: digestOf('installed by someone else') },
          requestedBy: 'direct',
        },
      },
    };

    const result = await plan(
      [{ name: 'code-review', target }],
      [{ reference: 'skillbox/code-review' }],
      lockfile,
    );

    const conflict = result.conflicts.find((c) => c.path === `${target}/entry.md`);

    expect(conflict?.kind).toBe('owned-by-other');
    expect(conflict?.owner).toBe('skillbox/other-owner');
  });

  it('classifies a Skillbox-installed file that was edited as locally-modified', async () => {
    const target = '.skillbox/prompts/code-review';
    await dir.write(`project/${target}/entry.md`, 'edited by the user');

    const lockfile: Lockfile = {
      lockfileVersion: 1,
      resources: {
        'skillbox/code-review': {
          version: '0.1.0',
          kind: 'prompt',
          source: { type: 'local', path: 'prompts/code-review' },
          integrity: digestOf('x'),
          target,
          files: { [`${target}/entry.md`]: digestOf('the original content') },
          requestedBy: 'direct',
        },
      },
    };

    const result = await plan(
      [{ name: 'code-review', target }],
      [{ reference: 'skillbox/code-review' }],
      lockfile,
    );

    const conflict = result.conflicts.find((c) => c.path === `${target}/entry.md`);

    expect(conflict?.kind).toBe('locally-modified');
  });

  it('reports no conflict when replacing its own unmodified file', async () => {
    // Skillbox replacing its own untouched output is not a conflict.
    const target = '.skillbox/prompts/code-review';
    const contents = '# code-review\n\nContents of entry.md.\n';
    await dir.write(`project/${target}/entry.md`, contents);

    const lockfile: Lockfile = {
      lockfileVersion: 1,
      resources: {
        'skillbox/code-review': {
          version: '0.1.0',
          kind: 'prompt',
          source: { type: 'local', path: 'prompts/code-review' },
          integrity: digestOf('x'),
          target,
          files: { [`${target}/entry.md`]: digestOf(contents) },
          requestedBy: 'direct',
        },
      },
    };

    const result = await plan(
      [{ name: 'code-review', target, files: ['entry.md'], entrypoint: 'entry.md' }],
      [{ reference: 'skillbox/code-review' }],
      lockfile,
    );

    expect(result.conflicts).toEqual([]);
  });

  it('marks a planned file as overwriting when a file already exists', async () => {
    await dir.write('project/target-dir/entry.md', 'existing');

    const result = await plan(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    const file = result.resources[0]?.files.find((f) => f.source === 'entry.md');

    expect(file?.overwrites).toBe(true);
  });
});

describe('assertNoConflicts', () => {
  it('does nothing when the plan is clean', async () => {
    const result = await plan(
      [{ name: 'code-review' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(() => {
      assertNoConflicts(result, false);
    }).not.toThrow();
  });

  it('throws with every conflicting path listed', async () => {
    await dir.write('project/target-dir/entry.md', 'mine');
    await dir.write('project/target-dir/README.md', 'mine too');

    const result = await plan(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    try {
      assertNoConflicts(result, false);
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as {
        code: string;
        details: readonly string[];
        hint?: string;
      };
      expect(skillboxError.code).toBe('FILE_CONFLICT');
      expect(skillboxError.details).toHaveLength(2);
      expect(skillboxError.hint).toContain('--force');
    }
  });

  it('permits conflicts when force is set', async () => {
    await dir.write('project/target-dir/entry.md', 'mine');

    const result = await plan(
      [{ name: 'code-review', target: 'target-dir' }],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(() => {
      assertNoConflicts(result, true);
    }).not.toThrow();
  });

  it('uses singular wording for one conflict', async () => {
    await dir.write('project/target-dir/entry.md', 'mine');

    const result = await plan(
      [
        {
          name: 'code-review',
          target: 'target-dir',
          files: ['entry.md'],
          entrypoint: 'entry.md',
        },
      ],
      [{ reference: 'skillbox/code-review' }],
    );

    expect(() => {
      assertNoConflicts(result, false);
    }).toThrow(/1 destination file conflicts/);
  });
});

describe('describeConflict', () => {
  it.each([
    ['untracked', 'already exists'],
    ['locally-modified', 'modified since'],
  ] as const)('describes %s in terms a user can act on', (kind, fragment) => {
    expect(
      describeConflict({ kind, path: 'a.md', resource: 'skillbox/a-resource' }),
    ).toContain(fragment);
  });

  it('names the current owner for owned-by-other', () => {
    expect(
      describeConflict({
        kind: 'owned-by-other',
        path: 'a.md',
        resource: 'skillbox/a-resource',
        owner: 'skillbox/b-resource',
      }),
    ).toContain('skillbox/b-resource');
  });

  it('falls back gracefully when the owner is unknown', () => {
    expect(
      describeConflict({
        kind: 'owned-by-other',
        path: 'a.md',
        resource: 'skillbox/a-resource',
      }),
    ).toContain('another resource');
  });
});
