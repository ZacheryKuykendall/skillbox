import path from 'node:path';

import {
  API_VERSION,
  PROJECT_DIRECTORY,
  emptyProjectManifest,
  projectManifestSchema,
  type ProjectManifest,
} from '@skillbox/schema';
import { createTempDir, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertInstallable } from './apply.js';
import { initProject } from './init.js';
import {
  findProjectRoot,
  isInitialized,
  lockfilePath,
  projectDirectory,
  projectManifestPath,
  requestedResources,
  serializeProjectManifest,
  withResource,
  withoutResource,
} from './project.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('path helpers', () => {
  it('locates the project directory', () => {
    expect(projectDirectory('/project')).toBe(path.join('/project', PROJECT_DIRECTORY));
  });

  it('locates the project manifest', () => {
    expect(projectManifestPath('/project')).toBe(
      path.join('/project', PROJECT_DIRECTORY, 'skillbox.yaml'),
    );
  });

  it('locates the lockfile', () => {
    expect(lockfilePath('/project')).toBe(
      path.join('/project', PROJECT_DIRECTORY, 'skillbox.lock'),
    );
  });
});

describe('isInitialized', () => {
  it('is false for a directory with no .skillbox', async () => {
    expect(await isInitialized(dir.path)).toBe(false);
  });

  it('is true after init', async () => {
    const root = await dir.mkdir('project');
    await initProject({ root });

    expect(await isInitialized(root)).toBe(true);
  });

  it('is false when .skillbox exists but holds no manifest', async () => {
    const root = await dir.mkdir('project');
    await dir.mkdir(`project/${PROJECT_DIRECTORY}`);

    expect(await isInitialized(root)).toBe(false);
  });
});

describe('findProjectRoot', () => {
  it('finds the root when started from it', async () => {
    const root = await dir.mkdir('project');
    await initProject({ root });

    expect(await findProjectRoot(root)).toBe(root);
  });

  it('finds the root from a nested subdirectory', async () => {
    // Running a command from a subdirectory should still find the project, the
    // way git and package managers behave.
    const root = await dir.mkdir('project');
    await initProject({ root });
    const nested = await dir.mkdir('project/src/deeply/nested');

    expect(await findProjectRoot(nested)).toBe(root);
  });

  it('returns undefined when no project exists above the starting point', async () => {
    const orphan = await dir.mkdir('not-a-project/sub');

    expect(await findProjectRoot(orphan)).toBeUndefined();
  });

  it('finds the nearest project when projects are nested', async () => {
    const outer = await dir.mkdir('outer');
    await initProject({ root: outer });

    const inner = await dir.mkdir('outer/inner');
    await initProject({ root: inner });

    expect(await findProjectRoot(inner)).toBe(inner);
  });
});

describe('requestedResources', () => {
  it('is empty for a fresh manifest', () => {
    expect(requestedResources(emptyProjectManifest('my-project')).size).toBe(0);
  });

  it('maps each qualified name to its requested version', () => {
    const manifest: ProjectManifest = {
      apiVersion: API_VERSION,
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {
        resources: [
          { resource: 'skillbox/first-resource', version: '^0.1.0' },
          { resource: 'skillbox/second-resource', version: '~0.2.0', target: 'custom' },
        ],
      },
    };

    const requested = requestedResources(manifest);

    expect(requested.get('skillbox/first-resource')).toEqual({ version: '^0.1.0' });
    expect(requested.get('skillbox/second-resource')).toEqual({
      version: '~0.2.0',
      target: 'custom',
    });
  });

  it('handles a manifest with no resources key', () => {
    const manifest: ProjectManifest = {
      apiVersion: API_VERSION,
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {},
    };

    expect(requestedResources(manifest).size).toBe(0);
  });
});

describe('withResource', () => {
  const base = emptyProjectManifest('my-project');

  it('adds a resource', () => {
    const updated = withResource(base, {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });

    expect(updated.spec.resources).toEqual([
      { resource: 'skillbox/code-review', version: '^0.1.0' },
    ]);
  });

  it('replaces an existing entry rather than duplicating it', () => {
    const once = withResource(base, {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });
    const twice = withResource(once, {
      resource: 'skillbox/code-review',
      version: '^0.2.0',
    });

    expect(twice.spec.resources).toEqual([
      { resource: 'skillbox/code-review', version: '^0.2.0' },
    ]);
  });

  it('sorts entries by resource name so the file is stable', () => {
    const updated = withResource(
      withResource(base, { resource: 'skillbox/zebra-resource', version: '^0.1.0' }),
      { resource: 'skillbox/alpha-resource', version: '^0.1.0' },
    );

    expect(updated.spec.resources?.map((entry) => entry.resource)).toEqual([
      'skillbox/alpha-resource',
      'skillbox/zebra-resource',
    ]);
  });

  it('records a target when given', () => {
    const updated = withResource(base, {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
      target: 'custom/place',
    });

    expect(updated.spec.resources?.[0]?.target).toBe('custom/place');
  });

  it('does not mutate the input', () => {
    withResource(base, { resource: 'skillbox/code-review', version: '^0.1.0' });

    expect(base.spec.resources).toEqual([]);
  });

  it('produces a manifest that validates', () => {
    const updated = withResource(base, {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });

    expect(projectManifestSchema.safeParse(updated).success).toBe(true);
  });
});

describe('withoutResource', () => {
  it('removes the named resource', () => {
    const manifest = withResource(emptyProjectManifest('my-project'), {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });

    expect(withoutResource(manifest, 'skillbox/code-review').spec.resources).toEqual(
      [],
    );
  });

  it('leaves other resources in place', () => {
    const manifest = withResource(
      withResource(emptyProjectManifest('my-project'), {
        resource: 'skillbox/first-resource',
        version: '^0.1.0',
      }),
      { resource: 'skillbox/second-resource', version: '^0.1.0' },
    );

    expect(
      withoutResource(manifest, 'skillbox/first-resource').spec.resources?.map(
        (entry) => entry.resource,
      ),
    ).toEqual(['skillbox/second-resource']);
  });

  it('is a no-op for a resource that is not present', () => {
    const manifest = withResource(emptyProjectManifest('my-project'), {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });

    expect(withoutResource(manifest, 'skillbox/absent').spec.resources).toHaveLength(1);
  });

  it('handles a manifest with no resources key', () => {
    const manifest: ProjectManifest = {
      apiVersion: API_VERSION,
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {},
    };

    expect(withoutResource(manifest, 'skillbox/anything').spec.resources).toEqual([]);
  });
});

describe('serializeProjectManifest', () => {
  it('produces YAML that parses back to the same manifest', async () => {
    const { parse } = await import('yaml');
    const manifest = withResource(emptyProjectManifest('my-project'), {
      resource: 'skillbox/code-review',
      version: '^0.1.0',
    });

    expect(parse(serializeProjectManifest(manifest))).toEqual(manifest);
  });

  it('is stable across repeated calls', () => {
    const manifest = emptyProjectManifest('my-project');

    expect(serializeProjectManifest(manifest)).toBe(serializeProjectManifest(manifest));
  });
});

describe('assertInstallable', () => {
  it('accepts a plan with resources', () => {
    expect(() => {
      assertInstallable({ resources: [{}] } as never);
    }).not.toThrow();
  });

  it('rejects an empty plan with an actionable hint', () => {
    try {
      assertInstallable({ resources: [] } as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as { code: string; hint?: string };
      expect(skillboxError.code).toBe('USAGE_ERROR');
      expect(skillboxError.hint).toContain('skillbox add');
    }
  });
});
